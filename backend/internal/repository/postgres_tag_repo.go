package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresTagRepo struct {
	db *gorm.DB
}

func NewPostgresTagRepo(db *gorm.DB) domain.TagRepository {
	return &PostgresTagRepo{db: db}
}

func (r *PostgresTagRepo) Create(tag *domain.Tag) error {
	return r.db.Create(tag).Error
}

func (r *PostgresTagRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.Tag, error) {
	var tag domain.Tag
	db := applyScope(r.db, scope, "", "")
	err := db.Take(&tag, "id = ?", id).Error
	return &tag, err
}

func (r *PostgresTagRepo) ListByNamespace(namespaceID uuid.UUID, scope *domain.PermissionScope) ([]domain.Tag, error) {
	var tags []domain.Tag
	db := applyScope(r.db, scope, "", "")
	err := db.Where("namespace_id = ?", namespaceID).Order("created_at desc").Find(&tags).Error
	return tags, err
}

func (r *PostgresTagRepo) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, createdBy *uuid.UUID, scope *domain.PermissionScope) ([]domain.Tag, int64, error) {
	var tags []domain.Tag
	var total int64

	db := applyScope(r.db, scope, "", "")
	db = db.Model(&domain.Tag{}).Where("namespace_id = ?", namespaceID)

	if createdBy != nil {
		db = db.Where("created_by = ?", createdBy)
	}

	if searchTerm != "" {
		db = db.Where("name ILIKE ?", "%"+searchTerm+"%")
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Limit(limit).Offset(offset).Order("created_at desc").Find(&tags).Error
	return tags, total, err
}

func (r *PostgresTagRepo) ListGlobalPaginated(limit, offset int, searchTerm string, scope *domain.PermissionScope) ([]domain.Tag, int64, error) {
	var tags []domain.Tag
	var total int64
	db := r.db.Model(&domain.Tag{})

	if scope != nil && !scope.IsGlobal {
		// Tags filter by their own IDs and their namespaces
		// Wait, according to applyScope logic for tags, it might need special handling or just be items
		// For tags themselves, they don't have separate tags, so tagJoinTable is empty
		db = applyScope(db, scope, "", "")
	}

	if searchTerm != "" {
		db = db.Where("name ILIKE ?", "%"+searchTerm+"%")
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Limit(limit).Offset(offset).Order("created_at DESC").Find(&tags).Error
	return tags, total, err
}

func (r *PostgresTagRepo) Update(tag *domain.Tag) error {
	return r.db.Save(tag).Error
}

func (r *PostgresTagRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Tag{}, "id = ?", id).Error
}
