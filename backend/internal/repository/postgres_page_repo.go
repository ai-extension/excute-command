package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresPageRepo struct {
	db *gorm.DB
}

func NewPostgresPageRepo(db *gorm.DB) *PostgresPageRepo {
	return &PostgresPageRepo{db: db}
}

func (r *PostgresPageRepo) Create(page *domain.Page) error {
	return r.db.Create(page).Error
}

func (r *PostgresPageRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.Page, error) {
	var page domain.Page
	db := applyScope(r.db, scope, "", "")
	err := db.
		Preload("Workflows", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Workflows.Workflow").
		Preload("Workflows.Workflow.Inputs").
		First(&page, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &page, nil
}

func (r *PostgresPageRepo) GetBySlug(slug string) (*domain.Page, error) {
	var page domain.Page
	err := r.db.
		Preload("Workflows", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Workflows.Workflow").
		Preload("Workflows.Workflow.Inputs").
		First(&page, "slug = ?", slug).Error
	if err != nil {
		return nil, err
	}
	return &page, nil
}

func (r *PostgresPageRepo) List(namespaceID uuid.UUID, scope *domain.PermissionScope) ([]domain.Page, error) {
	var pages []domain.Page
	db := applyScope(r.db, scope, "", "")
	err := db.
		Preload("Workflows", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Workflows.Workflow").
		Preload("Workflows.Workflow.Inputs").
		Where("namespace_id = ?", namespaceID).
		Order("created_at DESC").
		Find(&pages).Error
	if err != nil {
		return nil, err
	}
	return pages, nil
}

func (r *PostgresPageRepo) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, isPublic *bool, createdBy *uuid.UUID, scope *domain.PermissionScope) ([]domain.Page, int64, error) {
	var pages []domain.Page
	var total int64
	db := applyScope(r.db, scope, "", "").Where("namespace_id = ?", namespaceID)

	if searchTerm != "" {
		s := "%" + searchTerm + "%"
		db = db.Where("title ILIKE ? OR slug ILIKE ?", s, s)
	}

	if isPublic != nil {
		db = db.Where("is_public = ?", *isPublic)
	}

	if createdBy != nil {
		db = db.Where("created_by = ?", createdBy)
	}

	if err := db.Model(&domain.Page{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.
		Preload("Workflows", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Workflows.Workflow").
		Preload("Workflows.Workflow.Inputs").
		Limit(limit).Offset(offset).Order("created_at DESC").
		Find(&pages).Error
	return pages, total, err
}

func (r *PostgresPageRepo) ListGlobalPaginated(limit, offset int, searchTerm string, isPublic *bool, scope *domain.PermissionScope) ([]domain.Page, int64, error) {
	var pages []domain.Page
	var total int64
	db := applyScope(r.db, scope, "", "") // Pages don't have tags in this schema
	db = db.Model(&domain.Page{})

	if searchTerm != "" {
		db = db.Where("title ILIKE ? OR description ILIKE ?", "%"+searchTerm+"%", "%"+searchTerm+"%")
	}

	if isPublic != nil {
		db = db.Where("is_public = ?", *isPublic)
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Limit(limit).Offset(offset).Order("created_at DESC").Find(&pages).Error
	return pages, total, err
}

func (r *PostgresPageRepo) Update(page *domain.Page) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Sync Workflows
		if err := tx.Where("page_id = ?", page.ID).Delete(&domain.PageWorkflow{}).Error; err != nil {
			return err
		}
		for i := range page.Workflows {
			page.Workflows[i].ID = uuid.New()
			page.Workflows[i].PageID = page.ID
			if err := tx.Omit("Workflow").Create(&page.Workflows[i]).Error; err != nil {
				return err
			}
		}

		// Update top-level fields
		return tx.Omit("Workflows").Save(page).Error
	})
}

func (r *PostgresPageRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Page{}, "id = ?", id).Error
}
