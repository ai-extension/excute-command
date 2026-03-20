package service

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

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

func (s *WorkflowService) CreateWorkflow(wf *domain.Workflow, user *domain.User) error {
	if wf.ID == uuid.Nil {
		wf.ID = uuid.New()
	}
	wf.Status = domain.StatusPending
	if user != nil {
		wf.CreatedBy = &user.ID
		wf.CreatedByUsername = user.Username
	}

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
	return s.GetWorkflowWithAction(id, user, "READ")
}

func (s *WorkflowService) GetWorkflowWithAction(id uuid.UUID, user *domain.User, action string) (*domain.Workflow, error) {
	if user == nil {
		return s.repo.GetByID(id, &domain.PermissionScope{IsGlobal: true})
	}
	scope := domain.GetPermissionScope(user, "workflows", action)
	return s.repo.GetByID(id, &scope)
}

func (s *WorkflowService) ListWorkflows(namespaceID uuid.UUID, user *domain.User) ([]domain.Workflow, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.repo.List(namespaceID, &scope)
}

func (s *WorkflowService) ListWorkflowsPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, tagIDs []uuid.UUID, isTemplate *bool, isPublic *bool, createdBy *uuid.UUID, user *domain.User) ([]domain.Workflow, int64, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.repo.ListPaginated(namespaceID, limit, offset, searchTerm, tagIDs, isTemplate, isPublic, createdBy, &scope)
}

func (s *WorkflowService) ListGlobalPaginated(limit, offset int, searchTerm string, isTemplate *bool, scope *domain.PermissionScope) ([]domain.Workflow, int64, error) {
	return s.repo.ListGlobalPaginated(limit, offset, searchTerm, isTemplate, scope)
}

func (s *WorkflowService) UpdateWorkflow(wf *domain.Workflow, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "workflows", "WRITE")
	existing, err := s.repo.GetByID(wf.ID, &scope)
	if err != nil {
		return err
	}

	// Merge top-level fields from partial wf into existing record
	if wf.Name != "" {
		existing.Name = wf.Name
	}
	existing.Description = wf.Description
	existing.AIGuide = wf.AIGuide
	if wf.DefaultServerID != nil {
		existing.DefaultServerID = wf.DefaultServerID
	}
	if wf.Status != "" {
		existing.Status = wf.Status
	}
	if wf.TimeoutMinutes > 0 {
		existing.TimeoutMinutes = wf.TimeoutMinutes
	}
	existing.IsTemplate = wf.IsTemplate
	existing.IsPublic = wf.IsPublic
	existing.TriggerSource = wf.TriggerSource
	existing.TargetFolder = wf.TargetFolder
	existing.CleanupFiles = wf.CleanupFiles

	// Copy associations from wf to existing (the repo handle syncing these)
	if wf.Inputs != nil {
		existing.Inputs = wf.Inputs
	}
	if wf.Variables != nil {
		existing.Variables = wf.Variables
	}
	if wf.Groups != nil {
		existing.Groups = wf.Groups
	}
	if wf.Tags != nil {
		existing.Tags = wf.Tags
	}
	if wf.Hooks != nil {
		existing.Hooks = wf.Hooks
	}
	if wf.Files != nil {
		existing.Files = wf.Files
	}

	// Recursively assign IDs to new inputs, variables, groups and steps
	for i := range existing.Inputs {
		if existing.Inputs[i].ID == uuid.Nil {
			existing.Inputs[i].ID = uuid.New()
		}
		existing.Inputs[i].WorkflowID = existing.ID
	}

	for i := range existing.Variables {
		if existing.Variables[i].ID == uuid.Nil {
			existing.Variables[i].ID = uuid.New()
		}
		existing.Variables[i].WorkflowID = existing.ID
	}

	for i := range existing.Groups {
		if existing.Groups[i].ID == uuid.Nil {
			existing.Groups[i].ID = uuid.New()
		}
		existing.Groups[i].WorkflowID = existing.ID
		for j := range existing.Groups[i].Steps {
			if existing.Groups[i].Steps[j].ID == uuid.Nil {
				existing.Groups[i].Steps[j].ID = uuid.New()
			}
			existing.Groups[i].Steps[j].GroupID = existing.Groups[i].ID
		}
	}
	return s.repo.Update(existing)
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

func (s *WorkflowService) ListExecutionsPaginated(workflowID uuid.UUID, limit, offset int, executedBy *uuid.UUID, tagIDs []uuid.UUID, user *domain.User) ([]domain.WorkflowExecution, int64, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.execRepo.ListByWorkflowIDPaginated(workflowID, limit, offset, executedBy, tagIDs, &scope)
}

func (s *WorkflowService) ListNamespaceExecutions(namespaceID uuid.UUID, user *domain.User) ([]domain.WorkflowExecution, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.execRepo.ListByNamespaceID(namespaceID, &scope)
}

func (s *WorkflowService) ListNamespaceExecutionsPaginated(namespaceID uuid.UUID, limit, offset int, status string, workflowID *uuid.UUID, executedBy *uuid.UUID, tagIDs []uuid.UUID, user *domain.User) ([]domain.WorkflowExecution, int64, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.execRepo.ListByNamespaceIDPaginated(namespaceID, limit, offset, status, workflowID, executedBy, tagIDs, &scope)
}

func (s *WorkflowService) GetExecution(id uuid.UUID, user *domain.User) (*domain.WorkflowExecution, error) {
	if user == nil {
		return s.execRepo.GetByID(id, &domain.PermissionScope{IsGlobal: true})
	}
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
	return s.stepRepo.Create(step)
}

func (s *WorkflowService) CreateExecution(exec *domain.WorkflowExecution) error {
	return s.execRepo.Create(exec)
}

func (s *WorkflowService) GetExecutionAnalytics(namespaceID uuid.UUID, days int, user *domain.User) ([]map[string]interface{}, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.execRepo.GetExecutionAnalytics(namespaceID, days, &scope)
}

func (s *WorkflowService) CloneWorkflow(id uuid.UUID, targetNamespaceID uuid.UUID, user *domain.User) (*domain.Workflow, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	original, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return nil, err
	}

	// Deep copy and reset IDs
	clone := *original
	clone.ID = uuid.New()
	clone.NamespaceID = targetNamespaceID
	clone.IsTemplate = false // Cloned item is a regular workflow by default
	clone.Status = domain.StatusPending
	if user != nil {
		clone.CreatedBy = &user.ID
		clone.CreatedByUsername = user.Username
	}

	// Clone Inputs
	newInputs := make([]domain.WorkflowInput, len(original.Inputs))
	for i, input := range original.Inputs {
		newInputs[i] = input
		newInputs[i].ID = uuid.New()
		newInputs[i].WorkflowID = clone.ID
	}
	clone.Inputs = newInputs

	// Clone Variables
	newVars := make([]domain.WorkflowVariable, len(original.Variables))
	for i, variable := range original.Variables {
		newVars[i] = variable
		newVars[i].ID = uuid.New()
		newVars[i].WorkflowID = clone.ID
	}
	clone.Variables = newVars

	// Clone Groups and Steps
	newGroups := make([]domain.WorkflowGroup, len(original.Groups))
	for i, group := range original.Groups {
		newGroups[i] = group
		newGroups[i].ID = uuid.New()
		newGroups[i].WorkflowID = clone.ID

		newSteps := make([]domain.WorkflowStep, len(group.Steps))
		for j, step := range group.Steps {
			newSteps[j] = step
			newSteps[j].ID = uuid.New()
			newSteps[j].GroupID = newGroups[i].ID
		}
		newGroups[i].Steps = newSteps
	}
	clone.Groups = newGroups

	if err := s.repo.Create(&clone); err != nil {
		return nil, err
	}

	return &clone, nil
}

func (s *WorkflowService) CleanupZombieExecutions() error {
	log.Println("[Cleanup] Checking for interrupted executions from previous session...")
	// 1. Fetch all running executions
	execs, err := s.execRepo.GetRunningExecutions()
	if err != nil {
		return err
	}

	if len(execs) == 0 {
		log.Println("[Cleanup] No interrupted executions found.")
		return nil
	}

	log.Printf("[Cleanup] Found %d interrupted executions. Appending messages to logs...", len(execs))
	// 2. Append interrupt message to log files
	cwd, _ := os.Getwd()
	interruptedMsg := "\n[SYSTEM] Execution interrupted due to server restart.\n"

	for _, exec := range execs {
		execLogDir := filepath.Join(cwd, "data", "logs", "executions", exec.ID.String())

		// Append to workflow.log
		mainLogPath := filepath.Join(execLogDir, "workflow.log")
		if f, err := os.OpenFile(mainLogPath, os.O_APPEND|os.O_WRONLY, 0644); err == nil {
			fmt.Fprint(f, interruptedMsg)
			f.Close()
		}

		// Append to each running step's log
		for _, step := range exec.Steps {
			stepLogPath := filepath.Join(execLogDir, step.StepID.String()+".log")
			if f, err := os.OpenFile(stepLogPath, os.O_APPEND|os.O_WRONLY, 0644); err == nil {
				fmt.Fprint(f, interruptedMsg)
				f.Close()
			}
		}
	}

	log.Println("[Cleanup] Marking executions and workflows as FAILED in database...")
	// 3. Update DB status
	if err := s.execRepo.CleanupInterruptedExecutions(); err != nil {
		return err
	}
	log.Println("[Cleanup] System clean and ready.")
	return nil
}

func (s *WorkflowService) ImportWorkflow(wf *domain.Workflow, user *domain.User) error {
	// Reset IDs to ensure they are newly generated by CreateWorkflow logic
	wf.ID = uuid.Nil
	for i := range wf.Inputs {
		wf.Inputs[i].ID = uuid.Nil
	}
	for i := range wf.Variables {
		wf.Variables[i].ID = uuid.Nil
	}
	for i := range wf.Groups {
		wf.Groups[i].ID = uuid.Nil
		for j := range wf.Groups[i].Steps {
			wf.Groups[i].Steps[j].ID = uuid.Nil
		}
	}
	for i := range wf.Hooks {
		wf.Hooks[i].ID = uuid.Nil
	}
	// Files are tricky as they refer to local paths, for now we just reset IDs
	for i := range wf.Files {
		wf.Files[i].ID = uuid.Nil
	}

	return s.CreateWorkflow(wf, user)
}
