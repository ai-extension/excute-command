package repository

import (
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

func (r *PostgresDatasetRepo) DeleteRecord(id uuid.UUID) error {
	return r.db.Delete(&domain.DatasetRecord{}, "id = ?", id).Error
}
