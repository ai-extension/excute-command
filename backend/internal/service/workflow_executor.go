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
	globalVarRepo domain.GlobalVariableRepository
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
	globalVarRepo domain.GlobalVariableRepository,
) *WorkflowExecutor {
	return &WorkflowExecutor{
		wfRepo:        wfRepo,
		groupRepo:     groupRepo,
		stepRepo:      stepRepo,
		inputRepo:     inputRepo,
		execRepo:      execRepo,
		globalVarRepo: globalVarRepo,
		serverService: serverService,
		hub:           hub,
	}
}

func (e *WorkflowExecutor) Run(ctx context.Context, workflowID uuid.UUID, execID uuid.UUID, inputs map[string]string, scheduledID *uuid.UUID) error {
	return e.RunWithDepth(ctx, workflowID, execID, inputs, scheduledID, 0)
}

func (e *WorkflowExecutor) RunWithDepth(ctx context.Context, workflowID uuid.UUID, execID uuid.UUID, inputs map[string]string, scheduledID *uuid.UUID, depth int) error {
	if depth > 3 {
		return fmt.Errorf("maximum hook depth exceeded (circular dependency?)")
	}

	wf, err := e.wfRepo.GetByID(workflowID)
	if err != nil {
		return err
	}

	// Validate inputs against definitions for security
	if err := e.validateInputs(wf, inputs); err != nil {
		return err
	}

	// Create execution record
	baseDir, _ := os.Getwd()
	execLogDir := filepath.Join(baseDir, "data", "logs", "executions", execID.String())
	if err := os.MkdirAll(execLogDir, 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %w", err)
	}

	mainLogPath := filepath.Join(execLogDir, "workflow.log")
	inputsJSON, _ := json.Marshal(inputs)
	execution := &domain.WorkflowExecution{
		ID:          execID,
		WorkflowID:  workflowID,
		ScheduledID: scheduledID,
		Status:      domain.StatusRunning,
		Inputs:      string(inputsJSON),
		LogPath:     mainLogPath,
		StartedAt:   time.Now(),
	}
	e.execRepo.Create(execution)

	logFile, _ := os.OpenFile(mainLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	defer logFile.Close()

	fmt.Fprintf(logFile, "================================================================================\n")
	fmt.Fprintf(logFile, "--- WORKFLOW EXECUTION STARTED: %s ---\n", execution.StartedAt.Format(time.RFC3339))
	fmt.Fprintf(logFile, "Workflow: %s (%s)\n", wf.Name, workflowID)
	fmt.Fprintf(logFile, "Inputs: %s\n", execution.Inputs)
	fmt.Fprintf(logFile, "================================================================================\n\n")

	e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("--- WORKFLOW EXECUTION STARTED: %s ---\n", wf.Name))

	wf.Status = domain.StatusRunning
	e.wfRepo.Update(wf)
	e.hub.BroadcastStatus(wf.ID.String(), "workflow", string(domain.StatusRunning))

	var runErr error
	var serverIDs []uuid.UUID
	var cleanupPaths []string
	serverSet := make(map[uuid.UUID]bool)

	// 0. Execute BEFORE hooks
	if err := e.RunHooks(ctx, wf.Hooks, domain.HookTypeBefore, wf.NamespaceID, logFile, depth); err != nil {
		runErr = fmt.Errorf("before hook failed: %w", err)
		goto finalize
	}

	// Get all unique servers in this workflow
	if wf.DefaultServerID != uuid.Nil {
		serverSet[wf.DefaultServerID] = true
	}
	for _, g := range wf.Groups {
		if g.DefaultServerID != uuid.Nil {
			serverSet[g.DefaultServerID] = true
		}
		for _, s := range g.Steps {
			if s.ServerID != uuid.Nil {
				serverSet[s.ServerID] = true
			}
		}
	}

	for id := range serverSet {
		serverIDs = append(serverIDs, id)
	}

	// 1. Transfer files to servers
	if len(wf.Files) > 0 && len(serverIDs) > 0 {
		fmt.Fprintf(logFile, "--- TRANSFERRING %d FILES TO %d SERVERS ---\n", len(wf.Files), len(serverIDs))
		for _, f := range wf.Files {
			targetPath := f.TargetPath // Fallback to file-specific if present (for backward compatibility), but standard is to use wf.TargetFolder now
			if wf.TargetFolder != "" {
				targetPath = filepath.Join(wf.TargetFolder, f.FileName)
			}
			cleanupPaths = append(cleanupPaths, targetPath)

			fmt.Fprintf(logFile, "Copying %s to %s... ", f.FileName, targetPath)
			e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("Copying %s to %s...", f.FileName, targetPath))

			err := e.serverService.UploadFileToServers(ctx, serverIDs, f.LocalPath, targetPath)
			if err != nil {
				runErr = fmt.Errorf("failed to transfer file %s: %w", f.FileName, err)
				fmt.Fprintf(logFile, "ERROR: %v\n", err)
				e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("Error transferring file: %v", err))
				break
			} else {
				fmt.Fprintf(logFile, "SUCCESS\n")
			}
		}
		fmt.Fprintf(logFile, "--- TRANSFER COMPLETE ---\n\n")
	}

	// 2. Execute workflow groups
	if runErr == nil {
		groupResults := make(map[string]string) // key -> status string
		for i := range wf.Groups {
			err := e.runGroup(ctx, &wf.Groups[i], inputs, wf.Variables, groupResults, wf.DefaultServerID, logFile, workflowID, execID, wf.NamespaceID)
			groupResults[wf.Groups[i].Key] = string(wf.Groups[i].Status)
			if err != nil {
				runErr = err
				break
			}
		}
	}

	// 3. Cleanup files if requested
	if wf.CleanupFiles && len(cleanupPaths) > 0 && len(serverIDs) > 0 {
		fmt.Fprintf(logFile, "\n--- CLEANING UP TRANSFERRED FILES ---\n")
		for _, path := range cleanupPaths {
			cmdStr := fmt.Sprintf("rm -f %s", path)
			for _, serverID := range serverIDs {
				_, err := e.serverService.ExecuteCommand(serverID, cmdStr, nil, nil, nil)
				if err != nil {
					fmt.Fprintf(logFile, "Failed to cleanup %s on server %s: %v\n", path, serverID, err)
				}
			}
			fmt.Fprintf(logFile, "Cleaned up %s\n", path)
		}
		fmt.Fprintf(logFile, "--- CLEANUP COMPLETE ---\n")
	}

	e.hub.BroadcastStatus(wf.ID.String(), "workflow", string(wf.Status))

finalize:
	finishedAt := time.Now()
	execution.FinishedAt = &finishedAt

	if runErr != nil {
		wf.Status = domain.StatusFailed
		execution.Status = domain.StatusFailed
		fmt.Fprintf(logFile, "\n--- WORKFLOW FAILED: %v ---\n", runErr)

		// Execute AFTER_FAILED hooks
		e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterFailed, wf.NamespaceID, logFile, depth)
	} else {
		wf.Status = domain.StatusSuccess
		execution.Status = domain.StatusSuccess
		fmt.Fprintf(logFile, "\n--- WORKFLOW SUCCESS ---\n")

		// Execute AFTER_SUCCESS hooks
		e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterSuccess, wf.NamespaceID, logFile, depth)
	}

	e.execRepo.Update(execution)
	e.wfRepo.Update(wf)
	e.hub.BroadcastStatus(wf.ID.String(), "workflow", string(wf.Status))

	return runErr
}

func (e *WorkflowExecutor) RunHooks(ctx context.Context, hooks []domain.WorkflowHook, hookType domain.HookType, namespaceID uuid.UUID, logFile *os.File, depth int) error {
	for _, hook := range hooks {
		if hook.HookType != hookType {
			continue
		}

		fmt.Fprintf(logFile, "\n>>> EXECUTING %s HOOK: %s <<<\n", hookType, hook.TargetWorkflowID)
		e.hub.BroadcastLog(hook.WorkflowID.String(), fmt.Sprintf(">>> Executing %s hook...", hookType))

		var hookInputs map[string]string
		if hook.Inputs != "" {
			json.Unmarshal([]byte(hook.Inputs), &hookInputs)
		}

		hookExecID := uuid.New()
		err := e.RunWithDepth(ctx, hook.TargetWorkflowID, hookExecID, hookInputs, nil, depth+1)
		if err != nil {
			fmt.Fprintf(logFile, "!!! HOOK FAILED: %v !!!\n", err)
			return err
		}
		fmt.Fprintf(logFile, ">>> HOOK SUCCESS <<<\n\n")
	}
	return nil
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

func (e *WorkflowExecutor) evaluateCondition(condition string, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID) (bool, error) {
	if strings.TrimSpace(condition) == "" {
		return true, nil // Empty condition = always run
	}

	// Resolve all placeholders in the condition first
	resolved := condition

	// 1. Resolve {{global.key}}
	if e.globalVarRepo != nil {
		gvs, _ := e.globalVarRepo.List(namespaceID)
		for _, v := range gvs {
			resolved = strings.ReplaceAll(resolved, "{{global."+v.Key+"}}", v.Value)
		}
	}

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

func (e *WorkflowExecutor) runGroup(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, defaultServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID) error {
	// Evaluate condition before running
	if shouldRun, err := e.evaluateCondition(group.Condition, inputs, variables, groupResults, namespaceID); err != nil {
		return fmt.Errorf("group %q condition error: %w", group.Name, err)
	} else if !shouldRun {
		msg := fmt.Sprintf("\n%s\n[GROUP SKIPPED] %s\nCondition: %s\n%s\n", strings.Repeat("-", 80), group.Name, group.Condition, strings.Repeat("-", 80))
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), msg)
		group.Status = "SKIPPED"
		e.groupRepo.Update(group)
		e.hub.BroadcastStatus(group.ID.String(), "group", "SKIPPED")
		return nil
	}

	msg := fmt.Sprintf("\n%s\n[GROUP] %s\nParallel: %v\n%s\n", strings.Repeat("=", 80), group.Name, group.IsParallel, strings.Repeat("=", 80))
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
				if err := e.runStep(ctx, step, inputs, variables, effectiveServerID, logFile, workflowID, executionID, namespaceID); err != nil {
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
			if err := e.runStep(ctx, &group.Steps[i], inputs, variables, effectiveServerID, logFile, workflowID, executionID, namespaceID); err != nil {
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

func (e *WorkflowExecutor) runStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, variables []domain.WorkflowVariable, defaultServerID uuid.UUID, mainLogFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID) error {
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

	// Create step-specific log file
	baseDir, _ := os.Getwd()
	stepLogPath := filepath.Join(baseDir, "data", "logs", "executions", executionID.String(), step.ID.String()+".log")
	stepLogFile, _ := os.OpenFile(stepLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	defer stepLogFile.Close()

	msg := fmt.Sprintf("\n[STEP] %s\n%s\n", step.Name, strings.Repeat("─", 40))
	fmt.Fprint(mainLogFile, msg)
	fmt.Fprint(stepLogFile, msg)

	e.hub.BroadcastLog(step.ID.String(), msg)
	e.hub.BroadcastLog(step.GroupID.String(), msg)
	e.hub.BroadcastLog(workflowID.String(), msg)

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
	// 3. Global Variables: {{global.key}}
	if e.globalVarRepo != nil {
		gvs, _ := e.globalVarRepo.List(namespaceID)
		for _, v := range gvs {
			command = strings.ReplaceAll(command, "{{global."+v.Key+"}}", v.Value)
		}
	}

	targetServerID := step.ServerID
	if targetServerID == uuid.Nil {
		targetServerID = defaultServerID
	}

	if targetServerID != uuid.Nil {
		// Run on remote server via ServerService with real-time streaming
		var out bytes.Buffer
		w1 := &wsWriter{hub: e.hub, targetID: step.ID.String(), buffer: &out}
		w2 := &wsWriter{hub: e.hub, targetID: workflowID.String(), buffer: mainLogFile}
		w3 := &fileWriter{file: stepLogFile}

		output, err = e.serverService.ExecuteCommand(targetServerID, command, w1, w2, w3)
	} else {
		// Run locally
		output, err = e.runLocalStep(ctx, step, command, mainLogFile, stepLogFile, workflowID)
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

func (e *WorkflowExecutor) runLocalStep(ctx context.Context, step *domain.WorkflowStep, command string, mainLogFile *os.File, stepLogFile *os.File, workflowID uuid.UUID) (string, error) {
	c := exec.CommandContext(ctx, "sh", "-c", command)
	var out bytes.Buffer

	// Multi-broadcast writer
	// Send to step console, main log file, and specific step log file
	w1 := &wsWriter{hub: e.hub, targetID: step.ID.String(), buffer: &out}
	w2 := &wsWriter{hub: e.hub, targetID: workflowID.String(), buffer: mainLogFile}
	w3 := &fileWriter{file: stepLogFile} // We need a simple writer for the step log file
	mw := io.MultiWriter(w1, w2, w3)

	c.Stdout = mw
	c.Stderr = mw

	err := c.Run()
	return out.String(), err
}

// Helper for io.MultiWriter with os.File
type fileWriter struct {
	file *os.File
}

func (w *fileWriter) Write(p []byte) (n int, err error) {
	return w.file.Write(p)
}
