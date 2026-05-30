package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresWorkflowFileRepo struct {
	db *gorm.DB
}

func NewPostgresWorkflowFileRepo(db *gorm.DB) *PostgresWorkflowFileRepo {
	return &PostgresWorkflowFileRepo{db: db}
}

func (r *PostgresWorkflowFileRepo) Create(file *domain.WorkflowFile) error {
	return r.db.Create(file).Error
}

func (r *PostgresWorkflowFileRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.WorkflowFile, error) {
	var file domain.WorkflowFile
	db := r.db
	if scope != nil && !scope.IsGlobal {
		db = db.Joins("JOIN workflows ON workflows.id = workflow_files.workflow_id").
			Where(fileScopeCond(r.db, scope))
	}
	if err := db.Take(&file, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &file, nil
}

func (r *PostgresWorkflowFileRepo) GetByWorkflowID(workflowID uuid.UUID, scope *domain.PermissionScope) ([]domain.WorkflowFile, error) {
	var files []domain.WorkflowFile
	db := r.db
	if scope != nil && !scope.IsGlobal {
		db = db.Joins("JOIN workflows ON workflows.id = workflow_files.workflow_id").
			Where(fileScopeCond(r.db, scope))
	}
	if err := db.Where("workflow_id = ?", workflowID).Order("created_at DESC").Find(&files).Error; err != nil {
		return nil, err
	}
	return files, nil
}

// fileScopeCond builds the workflow-inherited scope condition for workflow_files queries:
// the parent workflow must be in an allowed namespace, be an allowed item, or carry an
// allowed tag.
func fileScopeCond(db *gorm.DB, scope *domain.PermissionScope) *gorm.DB {
	cond := db.Where("workflows.namespace_id IN ?", scope.AllowedNamespaceIDs).
		Or("workflow_files.workflow_id IN ?", scope.AllowedItemIDs)
	if len(scope.AllowedTagIDs) > 0 {
		sub := db.Table("workflow_tags").Select("workflow_id").Where("tag_id IN ?", scope.AllowedTagIDs)
		cond = cond.Or("workflow_files.workflow_id IN (?)", sub)
	}
	return cond
}

func (r *PostgresWorkflowFileRepo) Update(file *domain.WorkflowFile) error {
	return r.db.Save(file).Error
}

func (r *PostgresWorkflowFileRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.WorkflowFile{}, "id = ?", id).Error
}
