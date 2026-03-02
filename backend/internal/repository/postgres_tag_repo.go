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
	err := db.First(&tag, "id = ?", id).Error
	return &tag, err
}

func (r *PostgresTagRepo) ListByNamespace(namespaceID uuid.UUID, scope *domain.PermissionScope) ([]domain.Tag, error) {
	var tags []domain.Tag
	db := applyScope(r.db, scope, "", "")
	err := db.Where("namespace_id = ?", namespaceID).Order("created_at desc").Find(&tags).Error
	return tags, err
}

func (r *PostgresTagRepo) Update(tag *domain.Tag) error {
	return r.db.Save(tag).Error
}

func (r *PostgresTagRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Tag{}, "id = ?", id).Error
}
