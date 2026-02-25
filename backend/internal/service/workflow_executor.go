package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type WorkflowExecutor struct {
	wfRepo        domain.WorkflowRepository
	groupRepo     domain.WorkflowGroupRepository
	stepRepo      domain.WorkflowStepRepository
	inputRepo     domain.WorkflowInputRepository
	execRepo      domain.WorkflowExecutionRepository
	serverService *ServerService
	hub           *Hub
}

func NewWorkflowExecutor(
	wfRepo domain.WorkflowRepository,
	groupRepo domain.WorkflowGroupRepository,
	stepRepo domain.WorkflowStepRepository,
	inputRepo domain.WorkflowInputRepository,
	execRepo domain.WorkflowExecutionRepository,
	serverService *ServerService,
	hub *Hub,
) *WorkflowExecutor {
	return &WorkflowExecutor{
		wfRepo:        wfRepo,
		groupRepo:     groupRepo,
		stepRepo:      stepRepo,
		inputRepo:     inputRepo,
		execRepo:      execRepo,
		serverService: serverService,
		hub:           hub,
	}
}

func (e *WorkflowExecutor) Run(ctx context.Context, workflowID uuid.UUID, inputs map[string]string) error {
	wf, err := e.wfRepo.GetByID(workflowID)
	if err != nil {
		return err
	}

	// Validate inputs against definitions for security
	if err := e.validateInputs(wf, inputs); err != nil {
		return err
	}

	// Create execution record
	execID := uuid.New()
	baseDir, _ := os.Getwd()
	logDir := filepath.Join(baseDir, "data", "logs", "workflows")
	os.MkdirAll(logDir, 0755)
	logPath := filepath.Join(logDir, execID.String()+".log")

	inputsJSON, _ := json.Marshal(inputs)
	execution := &domain.WorkflowExecution{
		ID:         execID,
		WorkflowID: workflowID,
		Status:     domain.StatusRunning,
		Inputs:     string(inputsJSON),
		LogPath:    logPath,
		StartedAt:  time.Now(),
	}
	e.execRepo.Create(execution)

	logFile, _ := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	defer logFile.Close()

	fmt.Fprintf(logFile, "--- WORKFLOW EXECUTION STARTED: %s ---\n", execution.StartedAt.Format(time.RFC3339))
	fmt.Fprintf(logFile, "Workflow: %s (%s)\n", wf.Name, workflowID)
	fmt.Fprintf(logFile, "Inputs: %s\n\n", execution.Inputs)

	e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("--- WORKFLOW EXECUTION STARTED: %s ---\n", wf.Name))

	wf.Status = domain.StatusRunning
	e.wfRepo.Update(wf)
	e.hub.BroadcastStatus(wf.ID.String(), "workflow", string(domain.StatusRunning))

	var runErr error
	groupResults := make(map[string]string) // key -> status string
	for i := range wf.Groups {
		err := e.runGroup(ctx, &wf.Groups[i], inputs, wf.Variables, groupResults, wf.DefaultServerID, logFile, workflowID, execID)
		groupResults[wf.Groups[i].Key] = string(wf.Groups[i].Status)
		if err != nil {
			runErr = err
			break
		}
	}

	finishedAt := time.Now()
	execution.FinishedAt = &finishedAt
	if runErr != nil {
		wf.Status = domain.StatusFailed
		execution.Status = domain.StatusFailed
		fmt.Fprintf(logFile, "\n--- WORKFLOW FAILED: %v ---\n", runErr)
	} else {
		wf.Status = domain.StatusSuccess
		execution.Status = domain.StatusSuccess
		fmt.Fprintf(logFile, "\n--- WORKFLOW SUCCESS ---\n")
	}

	e.execRepo.Update(execution)
	e.wfRepo.Update(wf)
	e.hub.BroadcastStatus(wf.ID.String(), "workflow", string(wf.Status))

	return runErr
}

func (e *WorkflowExecutor) validateInputs(wf *domain.Workflow, provided map[string]string) error {
	for _, input := range wf.Inputs {
		val, ok := provided[input.Key]
		if !ok {
			val = input.DefaultValue
		}

		if val == "" {
			continue // Allow empty if allowed by default
		}

		switch input.Type {
		case "number":
			// Simple numeric check using strconv
			if _, err := strconv.ParseFloat(val, 64); err != nil {
				return fmt.Errorf("field %s must be a number", input.Label)
			}
		case "select":
			// Value must be one of the comma-separated options in DefaultValue
			options := strings.Split(input.DefaultValue, ",")
			valid := false
			for _, opt := range options {
				if strings.TrimSpace(opt) == val {
					valid = true
					break
				}
			}
			if !valid {
				return fmt.Errorf("field %s has invalid option: %s", input.Label, val)
			}
		default: // "input"
			// Whitelist approach: only allow alphanumeric, spaces, and basic symbols used in paths/params
			// We block shell metacharacters: ; & | $ ` > < ( ) etc.
			matched, _ := regexp.MatchString(`^[a-zA-Z0-9_\-\.\ \/]+$`, val)
			if !matched {
				return fmt.Errorf("field %s contains invalid characters. Security policy: only alpha-numeric, space, _, -, ., / are allowed", input.Label)
			}
		}
	}
	return nil
}

func (e *WorkflowExecutor) evaluateCondition(condition string, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string) (bool, error) {
	if strings.TrimSpace(condition) == "" {
		return true, nil // Empty condition = always run
	}

	// Resolve all placeholders in the condition first
	resolved := condition

	// Resolve {{variable.key}}
	for _, v := range variables {
		resolved = strings.ReplaceAll(resolved, "{{variable."+v.Key+"}}", v.Value)
	}
	// Resolve {{input.key}}
	for k, v := range inputs {
		resolved = strings.ReplaceAll(resolved, "{{input."+k+"}}", v)
	}
	// Resolve {{step.<group_key>.status}}
	for key, status := range groupResults {
		resolved = strings.ReplaceAll(resolved, "{{step."+key+".status}}", status)
	}

	// Evaluate with || (lower precedence) then && (higher precedence)
	return e.evalOr(resolved, condition)
}

// evalOr evaluates an expression split by ||
func (e *WorkflowExecutor) evalOr(expr, original string) (bool, error) {
	orParts := strings.Split(expr, "||")
	for _, part := range orParts {
		result, err := e.evalAnd(strings.TrimSpace(part), original)
		if err != nil {
			return false, err
		}
		if result {
			return true, nil // Short-circuit OR
		}
	}
	return false, nil
}

// evalAnd evaluates an expression split by &&
func (e *WorkflowExecutor) evalAnd(expr, original string) (bool, error) {
	andParts := strings.Split(expr, "&&")
	for _, part := range andParts {
		result, err := e.evalAtom(strings.TrimSpace(part), original)
		if err != nil {
			return false, err
		}
		if !result {
			return false, nil // Short-circuit AND
		}
	}
	return true, nil
}

// evalAtom evaluates a single comparison: LHS == RHS or LHS != RHS
func (e *WorkflowExecutor) evalAtom(expr, original string) (bool, error) {
	if idx := strings.Index(expr, "!="); idx != -1 {
		lhs := strings.TrimSpace(strings.Trim(expr[:idx], `"' `))
		rhs := strings.TrimSpace(strings.Trim(expr[idx+2:], `"' `))
		return lhs != rhs, nil
	}
	if idx := strings.Index(expr, "=="); idx != -1 {
		lhs := strings.TrimSpace(strings.Trim(expr[:idx], `"' `))
		rhs := strings.TrimSpace(strings.Trim(expr[idx+2:], `"' `))
		return lhs == rhs, nil
	}
	return false, fmt.Errorf("unsupported condition syntax: %q — use ==, !=, && or ||", original)
}

func (e *WorkflowExecutor) runGroup(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, defaultServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, executionID uuid.UUID) error {
	// Evaluate condition before running
	if shouldRun, err := e.evaluateCondition(group.Condition, inputs, variables, groupResults); err != nil {
		return fmt.Errorf("group %q condition error: %w", group.Name, err)
	} else if !shouldRun {
		msg := fmt.Sprintf("\n[GROUP SKIPPED] %s (condition: %s)\n", group.Name, group.Condition)
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), msg)
		group.Status = "SKIPPED"
		e.groupRepo.Update(group)
		e.hub.BroadcastStatus(group.ID.String(), "group", "SKIPPED")
		return nil
	}

	msg := fmt.Sprintf("\n[GROUP] %s (Parallel: %v)\n", group.Name, group.IsParallel)
	fmt.Fprint(logFile, msg)
	e.hub.BroadcastLog(group.WorkflowID.String(), msg)
	group.Status = domain.StatusRunning
	e.groupRepo.Update(group)
	e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusRunning))

	// Group-level server override: use group's server if set, otherwise fall back to workflow default
	effectiveServerID := defaultServerID
	if group.DefaultServerID != uuid.Nil {
		effectiveServerID = group.DefaultServerID
	}

	if group.IsParallel {
		var wg sync.WaitGroup
		errs := make(chan error, len(group.Steps))

		for i := range group.Steps {
			wg.Add(1)
			go func(step *domain.WorkflowStep) {
				defer wg.Done()
				if err := e.runStep(ctx, step, inputs, variables, effectiveServerID, logFile, workflowID, executionID); err != nil {
					errs <- err
				}
			}(&group.Steps[i])
		}

		wg.Wait()
		close(errs)

		for err := range errs {
			if err != nil {
				group.Status = domain.StatusFailed
				e.groupRepo.Update(group)
				e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusFailed))
				return err
			}
		}
	} else {
		for i := range group.Steps {
			if err := e.runStep(ctx, &group.Steps[i], inputs, variables, effectiveServerID, logFile, workflowID, executionID); err != nil {
				group.Status = domain.StatusFailed
				e.groupRepo.Update(group)
				e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusFailed))
				return err
			}
		}
	}

	group.Status = domain.StatusSuccess
	e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusSuccess))
	return e.groupRepo.Update(group)
}

func (e *WorkflowExecutor) runStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, variables []domain.WorkflowVariable, defaultServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, executionID uuid.UUID) error {
	step.Status = domain.StatusRunning
	e.stepRepo.Update(step)
	e.hub.BroadcastStatus(step.ID.String(), "step", string(domain.StatusRunning))

	// Create execution step record
	stepExec := &domain.WorkflowExecutionStep{
		ID:          uuid.New(),
		ExecutionID: executionID,
		StepID:      step.ID,
		Name:        step.Name,
		Status:      domain.StatusRunning,
		StartedAt:   time.Now(),
	}
	e.execRepo.CreateStepResult(stepExec)

	msg := fmt.Sprintf("\n  [STEP] %s\n", step.Name)
	fmt.Fprint(logFile, msg)
	e.hub.BroadcastLog(step.ID.String(), msg)
	e.hub.BroadcastLog(step.GroupID.String(), msg) // Also broadcast to group
	e.hub.BroadcastLog(workflowID.String(), msg)   // Also broadcast to workflow global log

	var output string
	var err error

	// Substitute variables in command
	command := step.CommandText
	// 1. Static Variables: {{variable.key}}
	for _, v := range variables {
		command = strings.ReplaceAll(command, "{{variable."+v.Key+"}}", v.Value)
	}
	// 2. Runtime Inputs: {{key}}
	for k, v := range inputs {
		command = strings.ReplaceAll(command, "{{"+k+"}}", v)
	}

	targetServerID := step.ServerID
	if targetServerID == uuid.Nil {
		targetServerID = defaultServerID
	}

	if targetServerID != uuid.Nil {
		// Run on remote server via ServerService
		output, err = e.serverService.ExecuteCommand(targetServerID, command)
		// Broadcast to live terminals
		e.hub.BroadcastLog(step.ID.String(), output)
		e.hub.BroadcastLog(workflowID.String(), "  [OUTPUT]\n"+output)
		// Write to persistent file
		fmt.Fprintf(logFile, "  [OUTPUT]\n%s\n", output)
	} else {
		// Run locally
		output, err = e.runLocalStep(ctx, step, command, logFile, workflowID)
	}

	step.Output = output
	if err != nil {
		step.Status = domain.StatusFailed
		e.stepRepo.Update(step)
		e.hub.BroadcastStatus(step.ID.String(), "step", string(domain.StatusFailed))
		return err
	}

	step.Status = domain.StatusSuccess
	e.hub.BroadcastStatus(step.ID.String(), "step", string(domain.StatusSuccess))

	// Finalize execution step record
	stepExec.Status = step.Status
	stepExec.Output = step.Output
	finishedAt := time.Now()
	stepExec.FinishedAt = &finishedAt
	e.execRepo.CreateStepResult(stepExec)

	return e.stepRepo.Update(step)
}

func (e *WorkflowExecutor) runLocalStep(ctx context.Context, step *domain.WorkflowStep, command string, logFile *os.File, workflowID uuid.UUID) (string, error) {
	c := exec.CommandContext(ctx, "sh", "-c", command)
	var out bytes.Buffer
	// Multi-broadcast writer
	// We want to send to step console, group console (if implemented), and overall global console
	w1 := &wsWriter{hub: e.hub, targetID: step.ID.String(), buffer: &out}
	w2 := &wsWriter{hub: e.hub, targetID: workflowID.String(), buffer: logFile}
	mw := io.MultiWriter(w1, w2)

	c.Stdout = mw
	c.Stderr = mw

	err := c.Run()
	return out.String(), err
}
