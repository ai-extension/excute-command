package repository

import (
	"encoding/json"
	"sort"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresDatasetRepo struct {
	db *gorm.DB
}

func NewPostgresDatasetRepo(db *gorm.DB) *PostgresDatasetRepo {
	return &PostgresDatasetRepo{db: db}
}

func (r *PostgresDatasetRepo) Create(d *domain.Dataset) error {
	return r.db.Create(d).Error
}

func (r *PostgresDatasetRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.Dataset, error) {
	var d domain.Dataset
	db := applyScope(r.db, scope, "", "")
	if err := db.Take(&d, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &d, nil
}

// GetByKey looks up a dataset by its (namespace_id, key) pair. Used to enforce key
// uniqueness within a namespace; intentionally not RBAC-scoped.
func (r *PostgresDatasetRepo) GetByKey(namespaceID uuid.UUID, key string) (*domain.Dataset, error) {
	var d domain.Dataset
	if err := r.db.Where("namespace_id = ? AND key = ?", namespaceID, key).Take(&d).Error; err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *PostgresDatasetRepo) List(namespaceID uuid.UUID, scope *domain.PermissionScope) ([]domain.Dataset, error) {
	var ds []domain.Dataset
	db := applyScope(r.db, scope, "", "")
	if err := db.Where("namespace_id = ?", namespaceID).Order("created_at DESC").Find(&ds).Error; err != nil {
		return nil, err
	}
	return ds, nil
}

func (r *PostgresDatasetRepo) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, createdBy *uuid.UUID, scope *domain.PermissionScope) ([]domain.Dataset, int64, error) {
	var ds []domain.Dataset
	var total int64

	db := applyScope(r.db, scope, "", "")
	db = db.Model(&domain.Dataset{}).Where("namespace_id = ?", namespaceID)

	if createdBy != nil {
		db = db.Where("created_by = ?", createdBy)
	}

	if searchTerm != "" {
		db = db.Where("key ILIKE ? OR name ILIKE ? OR description ILIKE ?", "%"+searchTerm+"%", "%"+searchTerm+"%", "%"+searchTerm+"%")
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Limit(limit).Offset(offset).Order("created_at DESC").Find(&ds).Error
	return ds, total, err
}

// ListGlobalPaginated returns datasets across ALL namespaces, scoped by RBAC. Used by
// the role-permissions picker so admins can grant per-dataset rules globally.
func (r *PostgresDatasetRepo) ListGlobalPaginated(limit, offset int, searchTerm string, scope *domain.PermissionScope) ([]domain.Dataset, int64, error) {
	var ds []domain.Dataset
	var total int64

	db := applyScope(r.db, scope, "", "").Model(&domain.Dataset{})
	if searchTerm != "" {
		db = db.Where("key ILIKE ? OR name ILIKE ? OR description ILIKE ?", "%"+searchTerm+"%", "%"+searchTerm+"%", "%"+searchTerm+"%")
	}
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := db.Limit(limit).Offset(offset).Order("created_at DESC").Find(&ds).Error
	return ds, total, err
}

func (r *PostgresDatasetRepo) Update(d *domain.Dataset) error {
	return r.db.Save(d).Error
}

func (r *PostgresDatasetRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Dataset{}, "id = ?", id).Error
}

// --- Records ---

func (r *PostgresDatasetRepo) ListRecords(datasetID uuid.UUID, limit, offset int, searchTerm string) ([]domain.DatasetRecord, int64, error) {
	var recs []domain.DatasetRecord
	var total int64

	db := r.db.Model(&domain.DatasetRecord{}).Where("dataset_id = ?", datasetID)
	if searchTerm != "" {
		db = db.Where("data::text ILIKE ?", "%"+searchTerm+"%")
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Limit(limit).Offset(offset).Order("created_at DESC").Find(&recs).Error
	return recs, total, err
}

func (r *PostgresDatasetRepo) AllRecords(datasetID uuid.UUID) ([]domain.DatasetRecord, error) {
	var recs []domain.DatasetRecord
	err := r.db.Where("dataset_id = ?", datasetID).Order("created_at DESC").Find(&recs).Error
	return recs, err
}

// AllRecordsCapped loads at most `limit` records (newest first). A limit <= 0 means
// "no cap". Used by the in-memory filter/aggregate paths to bound memory per request.
func (r *PostgresDatasetRepo) AllRecordsCapped(datasetID uuid.UUID, limit int) ([]domain.DatasetRecord, error) {
	var recs []domain.DatasetRecord
	q := r.db.Where("dataset_id = ?", datasetID).Order("created_at DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	err := q.Find(&recs).Error
	return recs, err
}

func (r *PostgresDatasetRepo) GetRecord(id uuid.UUID) (*domain.DatasetRecord, error) {
	var rec domain.DatasetRecord
	if err := r.db.Take(&rec, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &rec, nil
}

func (r *PostgresDatasetRepo) CreateRecord(rec *domain.DatasetRecord) error {
	return r.db.Create(rec).Error
}

func (r *PostgresDatasetRepo) UpdateRecord(rec *domain.DatasetRecord) error {
	return r.db.Save(rec).Error
}

// buildIncrementAndSetSQL constructs a single UPDATE statement that merges setPatch
// (top-level jsonb concat) and applies numeric deltas to each named field, reading the
// current value from the pre-update `data` column so it is race-free. Field names and
// deltas are passed as bound parameters (never interpolated). Returns the SQL and args.
func buildIncrementAndSetSQL(datasetID uuid.UUID, ids []uuid.UUID, setPatch map[string]interface{}, deltas map[string]float64) (string, []interface{}, error) {
	args := []interface{}{}

	// Base: existing data merged with the constant set-patch (same for every matched row).
	expr := "COALESCE(data, '{}'::jsonb)"
	if len(setPatch) > 0 {
		b, err := json.Marshal(setPatch)
		if err != nil {
			return "", nil, err
		}
		expr += " || ?::jsonb"
		args = append(args, string(b))
	}

	// Wrap each inc field. COALESCE((data->>field)::numeric, 0) reads the OLD value, so a
	// missing field counts as 0. Sorted for a deterministic statement (testability).
	keys := make([]string, 0, len(deltas))
	for k := range deltas {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		expr = "jsonb_set(" + expr + ", ARRAY[?]::text[], (COALESCE((data->>?)::numeric, 0) + (?)::numeric)::text::jsonb)"
		args = append(args, k, k, deltas[k])
	}

	sql := "UPDATE dataset_records SET data = " + expr + ", updated_at = now() WHERE id IN ? AND dataset_id = ?"
	args = append(args, ids, datasetID)
	return sql, args, nil
}

// IncrementAndSet atomically applies setPatch + numeric deltas to the given records in one
// statement. See buildIncrementAndSetSQL. A no-op (empty ids) returns 0, nil.
func (r *PostgresDatasetRepo) IncrementAndSet(datasetID uuid.UUID, ids []uuid.UUID, setPatch map[string]interface{}, deltas map[string]float64) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	sql, args, err := buildIncrementAndSetSQL(datasetID, ids, setPatch, deltas)
	if err != nil {
		return 0, err
	}
	res := r.db.Exec(sql, args...)
	return res.RowsAffected, res.Error
}

func (r *PostgresDatasetRepo) DeleteRecord(id uuid.UUID) error {
	return r.db.Delete(&domain.DatasetRecord{}, "id = ?", id).Error
}
