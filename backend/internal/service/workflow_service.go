package service

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type WorkflowService struct {
	repo         domain.WorkflowRepository
	groupRepo    domain.WorkflowGroupRepository
	stepRepo     domain.WorkflowStepRepository
	inputRepo    domain.WorkflowInputRepository
	variableRepo domain.WorkflowVariableRepository
	execRepo     domain.WorkflowExecutionRepository
}

func NewWorkflowService(
	repo domain.WorkflowRepository,
	groupRepo domain.WorkflowGroupRepository,
	stepRepo domain.WorkflowStepRepository,
	inputRepo domain.WorkflowInputRepository,
	variableRepo domain.WorkflowVariableRepository,
	execRepo domain.WorkflowExecutionRepository,
) *WorkflowService {
	return &WorkflowService{
		repo:         repo,
		groupRepo:    groupRepo,
		stepRepo:     stepRepo,
		inputRepo:    inputRepo,
		variableRepo: variableRepo,
		execRepo:     execRepo,
	}
}

func (s *WorkflowService) CreateWorkflow(wf *domain.Workflow) error {
	if wf.ID == uuid.Nil {
		wf.ID = uuid.New()
	}
	wf.Status = domain.StatusPending

	// Recursively assign IDs to inputs, groups and steps
	for i := range wf.Inputs {
		if wf.Inputs[i].ID == uuid.Nil {
			wf.Inputs[i].ID = uuid.New()
		}
		wf.Inputs[i].WorkflowID = wf.ID
	}

	for i := range wf.Variables {
		if wf.Variables[i].ID == uuid.Nil {
			wf.Variables[i].ID = uuid.New()
		}
		wf.Variables[i].WorkflowID = wf.ID
	}

	for i := range wf.Groups {
		if wf.Groups[i].ID == uuid.Nil {
			wf.Groups[i].ID = uuid.New()
		}
		wf.Groups[i].WorkflowID = wf.ID
		for j := range wf.Groups[i].Steps {
			if wf.Groups[i].Steps[j].ID == uuid.Nil {
				wf.Groups[i].Steps[j].ID = uuid.New()
			}
			wf.Groups[i].Steps[j].GroupID = wf.Groups[i].ID
		}
	}

	return s.repo.Create(wf)
}

func (s *WorkflowService) GetWorkflow(id uuid.UUID) (*domain.Workflow, error) {
	return s.repo.GetByID(id)
}

func (s *WorkflowService) ListWorkflows(namespaceID uuid.UUID) ([]domain.Workflow, error) {
	return s.repo.List(namespaceID)
}

func (s *WorkflowService) UpdateWorkflow(wf *domain.Workflow) error {
	// Recursively assign IDs to new inputs, variables, groups and steps
	for i := range wf.Inputs {
		if wf.Inputs[i].ID == uuid.Nil {
			wf.Inputs[i].ID = uuid.New()
		}
		wf.Inputs[i].WorkflowID = wf.ID
	}

	for i := range wf.Variables {
		if wf.Variables[i].ID == uuid.Nil {
			wf.Variables[i].ID = uuid.New()
		}
		wf.Variables[i].WorkflowID = wf.ID
	}

	for i := range wf.Groups {
		if wf.Groups[i].ID == uuid.Nil {
			wf.Groups[i].ID = uuid.New()
		}
		wf.Groups[i].WorkflowID = wf.ID
		for j := range wf.Groups[i].Steps {
			if wf.Groups[i].Steps[j].ID == uuid.Nil {
				wf.Groups[i].Steps[j].ID = uuid.New()
			}
			wf.Groups[i].Steps[j].GroupID = wf.Groups[i].ID
		}
	}
	return s.repo.Update(wf)
}

func (s *WorkflowService) DeleteWorkflow(id uuid.UUID) error {
	return s.repo.Delete(id)
}

func (s *WorkflowService) ListExecutions(workflowID uuid.UUID) ([]domain.WorkflowExecution, error) {
	return s.execRepo.ListByWorkflowID(workflowID)
}

func (s *WorkflowService) ListNamespaceExecutions(namespaceID uuid.UUID) ([]domain.WorkflowExecution, error) {
	return s.execRepo.ListByNamespaceID(namespaceID)
}

func (s *WorkflowService) GetExecution(id uuid.UUID) (*domain.WorkflowExecution, error) {
	return s.execRepo.GetByID(id)
}

func (s *WorkflowService) CreateGroup(group *domain.WorkflowGroup) error {
	if group.ID == uuid.Nil {
		group.ID = uuid.New()
	}
	group.Status = domain.StatusPending
	return s.groupRepo.Create(group)
}

func (s *WorkflowService) CreateStep(step *domain.WorkflowStep) error {
	if step.ID == uuid.Nil {
		step.ID = uuid.New()
	}
	step.Status = domain.StatusPending
	return s.stepRepo.Create(step)
}
