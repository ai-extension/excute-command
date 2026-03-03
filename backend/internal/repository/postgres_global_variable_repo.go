package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresGlobalVariableRepo struct {
	db *gorm.DB
}

func NewPostgresGlobalVariableRepo(db *gorm.DB) *PostgresGlobalVariableRepo {
	return &PostgresGlobalVariableRepo{db: db}
}

func (r *PostgresGlobalVariableRepo) Create(gv *domain.GlobalVariable) error {
	return r.db.Create(gv).Error
}

func (r *PostgresGlobalVariableRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.GlobalVariable, error) {
	var gv domain.GlobalVariable
	db := applyScope(r.db, scope, "", "")
	if err := db.First(&gv, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &gv, nil
}

func (r *PostgresGlobalVariableRepo) List(namespaceID uuid.UUID, scope *domain.PermissionScope) ([]domain.GlobalVariable, error) {
	var gvs []domain.GlobalVariable
	db := applyScope(r.db, scope, "", "")
	if err := db.Where("namespace_id = ?", namespaceID).Find(&gvs).Error; err != nil {
		return nil, err
	}
	return gvs, nil
}

func (r *PostgresGlobalVariableRepo) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, scope *domain.PermissionScope) ([]domain.GlobalVariable, int64, error) {
	var gvs []domain.GlobalVariable
	var total int64

	db := applyScope(r.db, scope, "", "")
	db = db.Model(&domain.GlobalVariable{}).Where("namespace_id = ?", namespaceID)

	if searchTerm != "" {
		db = db.Where("key ILIKE ? OR description ILIKE ?", "%"+searchTerm+"%", "%"+searchTerm+"%")
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Limit(limit).Offset(offset).Order("created_at desc").Find(&gvs).Error
	return gvs, total, err
}

func (r *PostgresGlobalVariableRepo) Update(gv *domain.GlobalVariable) error {
	return r.db.Save(gv).Error
}

func (r *PostgresGlobalVariableRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.GlobalVariable{}, "id = ?", id).Error
}
