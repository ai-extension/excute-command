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
