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

func (s *WorkflowService) GetWorkflow(id uuid.UUID, user *domain.User) (*domain.Workflow, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.repo.GetByID(id, &scope)
}

func (s *WorkflowService) ListWorkflows(namespaceID uuid.UUID, user *domain.User) ([]domain.Workflow, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.repo.List(namespaceID, &scope)
}

func (s *WorkflowService) ListWorkflowsPaginated(namespaceID uuid.UUID, limit, offset int, user *domain.User) ([]domain.Workflow, int64, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.repo.ListPaginated(namespaceID, limit, offset, &scope)
}

func (s *WorkflowService) UpdateWorkflow(wf *domain.Workflow, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "workflows", "WRITE")
	_, err := s.repo.GetByID(wf.ID, &scope)
	if err != nil {
		return err
	}

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

func (s *WorkflowService) DeleteWorkflow(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "workflows", "DELETE")
	_, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return err
	}
	return s.repo.Delete(id)
}

func (s *WorkflowService) ListExecutions(workflowID uuid.UUID, user *domain.User) ([]domain.WorkflowExecution, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.execRepo.ListByWorkflowID(workflowID, &scope)
}

func (s *WorkflowService) ListExecutionsPaginated(workflowID uuid.UUID, limit, offset int, user *domain.User) ([]domain.WorkflowExecution, int64, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.execRepo.ListByWorkflowIDPaginated(workflowID, limit, offset, &scope)
}

func (s *WorkflowService) ListNamespaceExecutions(namespaceID uuid.UUID, user *domain.User) ([]domain.WorkflowExecution, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.execRepo.ListByNamespaceID(namespaceID, &scope)
}

func (s *WorkflowService) GetExecution(id uuid.UUID, user *domain.User) (*domain.WorkflowExecution, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.execRepo.GetByID(id, &scope)
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
