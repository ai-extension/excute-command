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
	for i := range wf.Groups {
		err := e.runGroup(ctx, &wf.Groups[i], inputs, wf.DefaultServerID, logFile, workflowID, execID)
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

func (e *WorkflowExecutor) runGroup(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, defaultServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, executionID uuid.UUID) error {
	msg := fmt.Sprintf("\n[GROUP] %s (Parallel: %v)\n", group.Name, group.IsParallel)
	fmt.Fprint(logFile, msg)
	e.hub.BroadcastLog(group.WorkflowID.String(), msg)
	group.Status = domain.StatusRunning
	e.groupRepo.Update(group)
	e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusRunning))

	if group.IsParallel {
		var wg sync.WaitGroup
		errs := make(chan error, len(group.Steps))

		for i := range group.Steps {
			wg.Add(1)
			go func(step *domain.WorkflowStep) {
				defer wg.Done()
				if err := e.runStep(ctx, step, inputs, defaultServerID, logFile, workflowID, executionID); err != nil {
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
			if err := e.runStep(ctx, &group.Steps[i], inputs, defaultServerID, logFile, workflowID, executionID); err != nil {
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

func (e *WorkflowExecutor) runStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, defaultServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, executionID uuid.UUID) error {
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
