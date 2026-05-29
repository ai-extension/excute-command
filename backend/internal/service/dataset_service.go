package service

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type DatasetService struct {
	repo domain.DatasetRepository
}

func NewDatasetService(repo domain.DatasetRepository) *DatasetService {
	return &DatasetService{repo: repo}
}

func (s *DatasetService) Create(d *domain.Dataset, user *domain.User) error {
	d.ID = uuid.New()
	if d.Columns == "" {
		d.Columns = "[]"
	}
	if user != nil {
		d.CreatedBy = &user.ID
		d.CreatedByUsername = user.Username
	}
	return s.repo.Create(d)
}

func (s *DatasetService) GetByID(id uuid.UUID, user *domain.User) (*domain.Dataset, error) {
	return s.GetByIDWithAction(id, user, "READ")
}

func (s *DatasetService) GetByIDWithAction(id uuid.UUID, user *domain.User, action string) (*domain.Dataset, error) {
	scope := domain.GetPermissionScope(user, "datasets", action)
	return s.repo.GetByID(id, &scope)
}

func (s *DatasetService) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, createdBy *uuid.UUID, user *domain.User) ([]domain.Dataset, int64, error) {
	scope := domain.GetPermissionScope(user, "namespaces", "READ")
	return s.repo.ListPaginated(namespaceID, limit, offset, searchTerm, createdBy, &scope)
}

func (s *DatasetService) Update(d *domain.Dataset, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "namespaces", "WRITE")
	existing, err := s.repo.GetByID(d.ID, &scope)
	if err != nil {
		return err
	}

	if d.Key != "" {
		existing.Key = d.Key
	}
	if d.Name != "" {
		existing.Name = d.Name
	}
	if d.Description != "" {
		existing.Description = d.Description
	}
	if d.Columns != "" {
		existing.Columns = d.Columns
	}

	return s.repo.Update(existing)
}

func (s *DatasetService) Delete(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "namespaces", "WRITE")
	if _, err := s.repo.GetByID(id, &scope); err != nil {
		return err
	}
	return s.repo.Delete(id)
}

// --- Records (schema is loose; we only ensure Data is a valid JSON object) ---

func validRecordData(data string) error {
	if data == "" {
		return nil
	}
	var v interface{}
	if err := json.Unmarshal([]byte(data), &v); err != nil {
		return errors.New("data must be valid JSON")
	}
	return nil
}

func (s *DatasetService) ListRecords(datasetID uuid.UUID, limit, offset int, searchTerm string, user *domain.User) ([]domain.DatasetRecord, int64, error) {
	return s.ListRecordsFiltered(datasetID, limit, offset, searchTerm, "", user)
}

// ListRecordsFiltered supports a structured "key=val,..." filter (matchConditions syntax) in
// addition to the substring search. When a filter is present, records are loaded and matched
// in memory, then paginated; otherwise SQL pagination is used.
func (s *DatasetService) ListRecordsFiltered(datasetID uuid.UUID, limit, offset int, searchTerm, filter string, user *domain.User) ([]domain.DatasetRecord, int64, error) {
	if _, err := s.GetByIDWithAction(datasetID, user, "READ"); err != nil {
		return nil, 0, err
	}

	filter = strings.TrimSpace(filter)
	if filter == "" {
		return s.repo.ListRecords(datasetID, limit, offset, searchTerm)
	}

	all, err := s.repo.AllRecords(datasetID)
	if err != nil {
		return nil, 0, err
	}
	search := strings.ToLower(strings.TrimSpace(searchTerm))

	matched := make([]domain.DatasetRecord, 0, len(all))
	for _, r := range all {
		m := map[string]interface{}{}
		if r.Data != "" {
			dec := json.NewDecoder(strings.NewReader(r.Data))
			dec.UseNumber()
			_ = dec.Decode(&m)
		}
		m["_id"] = r.ID.String()
		if !evalFilterString(m, filter) {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(r.Data), search) {
			continue
		}
		matched = append(matched, r)
	}

	total := int64(len(matched))
	if offset > len(matched) {
		offset = len(matched)
	}
	end := offset + limit
	if end > len(matched) {
		end = len(matched)
	}
	return matched[offset:end], total, nil
}

func (s *DatasetService) CreateRecord(datasetID uuid.UUID, rec *domain.DatasetRecord, user *domain.User) error {
	if _, err := s.GetByIDWithAction(datasetID, user, "WRITE"); err != nil {
		return err
	}
	if err := validRecordData(rec.Data); err != nil {
		return err
	}
	rec.ID = uuid.New()
	rec.DatasetID = datasetID
	if rec.Data == "" {
		rec.Data = "{}"
	}
	return s.repo.CreateRecord(rec)
}

func (s *DatasetService) UpdateRecord(rec *domain.DatasetRecord, user *domain.User) error {
	existing, err := s.repo.GetRecord(rec.ID)
	if err != nil {
		return err
	}
	if _, err := s.GetByIDWithAction(existing.DatasetID, user, "WRITE"); err != nil {
		return err
	}
	if err := validRecordData(rec.Data); err != nil {
		return err
	}
	if rec.Data != "" {
		existing.Data = rec.Data
	}
	return s.repo.UpdateRecord(existing)
}

func (s *DatasetService) DeleteRecord(id uuid.UUID, user *domain.User) error {
	existing, err := s.repo.GetRecord(id)
	if err != nil {
		return err
	}
	if _, err := s.GetByIDWithAction(existing.DatasetID, user, "DELETE"); err != nil {
		return err
	}
	return s.repo.DeleteRecord(id)
}
