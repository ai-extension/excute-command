package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresWorkflowRepo struct {
	db *gorm.DB
}

func NewPostgresWorkflowRepo(db *gorm.DB) *PostgresWorkflowRepo {
	return &PostgresWorkflowRepo{db: db}
}

func (r *PostgresWorkflowRepo) Create(wf *domain.Workflow) error {
	return r.db.Create(wf).Error
}

func (r *PostgresWorkflowRepo) GetByID(id uuid.UUID) (*domain.Workflow, error) {
	var wf domain.Workflow
	err := r.db.
		Preload("Inputs", func(db *gorm.DB) *gorm.DB { return db.Order("\"created_at\" ASC") }).
		Preload("Variables", func(db *gorm.DB) *gorm.DB { return db.Order("\"created_at\" ASC") }).
		Preload("Groups", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Groups.Steps", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		First(&wf, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &wf, nil
}

func (r *PostgresWorkflowRepo) List(namespaceID uuid.UUID) ([]domain.Workflow, error) {
	var wfs []domain.Workflow
	err := r.db.
		Preload("Inputs").
		Preload("Variables").
		Preload("Groups", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Groups.Steps", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Where("namespace_id = ?", namespaceID).
		Find(&wfs).Error
	if err != nil {
		return nil, err
	}
	return wfs, nil
}

func (r *PostgresWorkflowRepo) Update(wf *domain.Workflow) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Sync Inputs: explicitly delete all old inputs and recreate them.
		// This avoids GORM's ON CONFLICT DO UPDATE which silently skips the `type` column
		// (a PostgreSQL reserved word) in the SET clause.
		if err := tx.Where("workflow_id = ?", wf.ID).Delete(&domain.WorkflowInput{}).Error; err != nil {
			return err
		}
		for i := range wf.Inputs {
			wf.Inputs[i].ID = uuid.New()
			wf.Inputs[i].WorkflowID = wf.ID
			if wf.Inputs[i].Type == "" {
				wf.Inputs[i].Type = "input"
			}
			if err := tx.Create(&wf.Inputs[i]).Error; err != nil {
				return err
			}
		}

		// Sync Variables: explicitly delete all old variables and recreate them.
		if err := tx.Where("workflow_id = ?", wf.ID).Delete(&domain.WorkflowVariable{}).Error; err != nil {
			return err
		}
		for i := range wf.Variables {
			wf.Variables[i].ID = uuid.New()
			wf.Variables[i].WorkflowID = wf.ID
			if err := tx.Create(&wf.Variables[i]).Error; err != nil {
				return err
			}
		}

		// Step 1: Upsert each group first to ensure it exists in the DB before touching steps.
		// This prevents FK violations when steps reference a new group that hasn't been saved yet.
		for i := range wf.Groups {
			wf.Groups[i].WorkflowID = wf.ID
			if err := tx.Omit("Steps").Save(&wf.Groups[i]).Error; err != nil {
				return err
			}
		}

		// Step 2: Now that all groups exist, sync their steps.
		for i := range wf.Groups {
			if err := tx.Model(&wf.Groups[i]).Association("Steps").Replace(wf.Groups[i].Steps); err != nil {
				return err
			}
		}

		// Step 3: Sync the groups list at the association level to remove deleted groups.
		if err := tx.Model(wf).Association("Groups").Replace(wf.Groups); err != nil {
			return err
		}

		// Update top-level fields (omit associations to avoid double-processing)
		return tx.Omit("Groups", "Inputs", "Variables").Save(wf).Error
	})
}

func (r *PostgresWorkflowRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Workflow{}, "id = ?", id).Error
}

type PostgresWorkflowGroupRepo struct {
	db *gorm.DB
}

func NewPostgresWorkflowGroupRepo(db *gorm.DB) *PostgresWorkflowGroupRepo {
	return &PostgresWorkflowGroupRepo{db: db}
}

func (r *PostgresWorkflowGroupRepo) Create(group *domain.WorkflowGroup) error {
	return r.db.Create(group).Error
}

func (r *PostgresWorkflowGroupRepo) GetByWorkflowID(workflowID uuid.UUID) ([]domain.WorkflowGroup, error) {
	var groups []domain.WorkflowGroup
	if err := r.db.Where("workflow_id = ?", workflowID).Order("\"order\" ASC").Find(&groups).Error; err != nil {
		return nil, err
	}
	return groups, nil
}

func (r *PostgresWorkflowGroupRepo) Update(group *domain.WorkflowGroup) error {
	return r.db.Save(group).Error
}

func (r *PostgresWorkflowGroupRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.WorkflowGroup{}, "id = ?", id).Error
}

type PostgresWorkflowStepRepo struct {
	db *gorm.DB
}

func NewPostgresWorkflowStepRepo(db *gorm.DB) *PostgresWorkflowStepRepo {
	return &PostgresWorkflowStepRepo{db: db}
}

func (r *PostgresWorkflowStepRepo) Create(step *domain.WorkflowStep) error {
	return r.db.Create(step).Error
}

func (r *PostgresWorkflowStepRepo) GetByGroupID(groupID uuid.UUID) ([]domain.WorkflowStep, error) {
	var steps []domain.WorkflowStep
	if err := r.db.Where("group_id = ?", groupID).Order("\"order\" ASC").Find(&steps).Error; err != nil {
		return nil, err
	}
	return steps, nil
}

func (r *PostgresWorkflowStepRepo) Update(step *domain.WorkflowStep) error {
	return r.db.Save(step).Error
}

func (r *PostgresWorkflowStepRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.WorkflowStep{}, "id = ?", id).Error
}

type PostgresWorkflowInputRepo struct {
	db *gorm.DB
}

func NewPostgresWorkflowInputRepo(db *gorm.DB) *PostgresWorkflowInputRepo {
	return &PostgresWorkflowInputRepo{db: db}
}

func (r *PostgresWorkflowInputRepo) Create(input *domain.WorkflowInput) error {
	return r.db.Create(input).Error
}

func (r *PostgresWorkflowInputRepo) GetByWorkflowID(workflowID uuid.UUID) ([]domain.WorkflowInput, error) {
	var inputs []domain.WorkflowInput
	if err := r.db.Where("workflow_id = ?", workflowID).Find(&inputs).Error; err != nil {
		return nil, err
	}
	return inputs, nil
}

func (r *PostgresWorkflowInputRepo) Update(input *domain.WorkflowInput) error {
	return r.db.Save(input).Error
}

func (r *PostgresWorkflowInputRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.WorkflowInput{}, "id = ?", id).Error
}

type PostgresWorkflowVariableRepo struct {
	db *gorm.DB
}

func NewPostgresWorkflowVariableRepo(db *gorm.DB) *PostgresWorkflowVariableRepo {
	return &PostgresWorkflowVariableRepo{db: db}
}

func (r *PostgresWorkflowVariableRepo) Create(variable *domain.WorkflowVariable) error {
	return r.db.Create(variable).Error
}

func (r *PostgresWorkflowVariableRepo) GetByWorkflowID(workflowID uuid.UUID) ([]domain.WorkflowVariable, error) {
	var variables []domain.WorkflowVariable
	if err := r.db.Where("workflow_id = ?", workflowID).Find(&variables).Error; err != nil {
		return nil, err
	}
	return variables, nil
}

func (r *PostgresWorkflowVariableRepo) Update(variable *domain.WorkflowVariable) error {
	return r.db.Save(variable).Error
}

func (r *PostgresWorkflowVariableRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.WorkflowVariable{}, "id = ?", id).Error
}

type PostgresWorkflowExecutionRepo struct {
	db *gorm.DB
}

func NewPostgresWorkflowExecutionRepo(db *gorm.DB) *PostgresWorkflowExecutionRepo {
	return &PostgresWorkflowExecutionRepo{db: db}
}

func (r *PostgresWorkflowExecutionRepo) Create(exec *domain.WorkflowExecution) error {
	return r.db.Create(exec).Error
}

func (r *PostgresWorkflowExecutionRepo) GetByID(id uuid.UUID) (*domain.WorkflowExecution, error) {
	var exec domain.WorkflowExecution
	if err := r.db.Preload("Workflow.Groups.Steps").Preload("Steps").First(&exec, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &exec, nil
}

func (r *PostgresWorkflowExecutionRepo) ListByWorkflowID(workflowID uuid.UUID) ([]domain.WorkflowExecution, error) {
	var execs []domain.WorkflowExecution
	if err := r.db.Where("workflow_id = ?", workflowID).Order("created_at DESC").Find(&execs).Error; err != nil {
		return nil, err
	}
	return execs, nil
}

func (r *PostgresWorkflowExecutionRepo) ListByNamespaceID(namespaceID uuid.UUID) ([]domain.WorkflowExecution, error) {
	var execs []domain.WorkflowExecution
	err := r.db.
		Preload("Workflow").
		Joins("JOIN workflows ON workflows.id = workflow_executions.workflow_id").
		Where("workflows.namespace_id = ?", namespaceID).
		Order("workflow_executions.created_at DESC").
		Find(&execs).Error
	if err != nil {
		return nil, err
	}
	return execs, nil
}

func (r *PostgresWorkflowExecutionRepo) Update(exec *domain.WorkflowExecution) error {
	return r.db.Save(exec).Error
}

func (r *PostgresWorkflowExecutionRepo) CreateStepResult(stepExec *domain.WorkflowExecutionStep) error {
	return r.db.Save(stepExec).Error // Use Save to handle both Create and Update
}
