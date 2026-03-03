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

func (e *WorkflowExecutor) Run(ctx context.Context, workflowID uuid.UUID, execID uuid.UUID, inputs map[string]string, scheduledID *uuid.UUID, user *domain.User) error {
	return e.RunWithDepth(ctx, workflowID, execID, inputs, scheduledID, 0, user)
}

func (e *WorkflowExecutor) RunWithDepth(ctx context.Context, workflowID uuid.UUID, execID uuid.UUID, inputs map[string]string, scheduledID *uuid.UUID, depth int, user *domain.User) error {
	if depth > 3 {
		return fmt.Errorf("maximum hook depth exceeded (circular dependency?)")
	}

	scope := domain.GetPermissionScope(user, "workflows", "EXECUTE")
	wf, err := e.wfRepo.GetByID(workflowID, &scope)
	if err != nil {
		return err
	}

	// Validate inputs against definitions for security
	if err := e.validateInputs(wf, inputs); err != nil {
		return err
	}

	// Setup log directory
	baseDir, _ := os.Getwd()
	execLogDir := filepath.Join(baseDir, "data", "logs", "executions", execID.String())
	if err := os.MkdirAll(execLogDir, 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %w", err)
	}
	mainLogPath := filepath.Join(execLogDir, "workflow.log")

	// Get existing execution record (created by handler to avoid race condition)
	execution, err := e.execRepo.GetByID(execID, nil)
	if err != nil {
		// Fallback if not found
		inputsJSON, _ := json.Marshal(inputs)
		execution = &domain.WorkflowExecution{
			ID:         execID,
			WorkflowID: workflowID,
			Status:     domain.StatusRunning,
			Inputs:     string(inputsJSON),
			StartedAt:  time.Now(),
		}
		if user != nil {
			execution.ExecutedBy = &user.ID
			execution.User = user
		}
		e.execRepo.Create(execution)
	}

	// Update with log path
	execution.LogPath = mainLogPath
	e.execRepo.Update(execution)

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
	if err := e.RunHooks(ctx, wf.Hooks, domain.HookTypeBefore, wf.NamespaceID, logFile, depth, execution.User); err != nil {
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

			err := e.serverService.UploadFileToServers(ctx, serverIDs, f.LocalPath, targetPath, execution.User)
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
		workingDirs := &sync.Map{}

		// Initialize baseline directories to prevent parallel race conditions in the first group
		// Baseline for local server (Nil UUID)
		if gwd, err := os.Getwd(); err == nil {
			workingDirs.Store(uuid.Nil, gwd)
		}
		// Baseline for remote servers
		for id := range serverSet {
			// Get initial physical directory (resolving symlinks) on remote server without logging it
			out, err := e.serverService.ExecuteCommand(id, "pwd -P", execution.User)
			if err == nil {
				workingDirs.Store(id, filepath.Clean(strings.TrimSpace(out)))
			}
		}

		for i := range wf.Groups {
			err := e.runGroup(ctx, &wf.Groups[i], inputs, wf.Variables, groupResults, wf.DefaultServerID, logFile, workflowID, execID, wf.NamespaceID, execution.User, workingDirs)
			groupResults[wf.Groups[i].Key] = string(wf.Groups[i].Status)
			if err != nil {
				runErr = err
				break
			}
			// Strict Group Boundary: Small gap to let SSH connections and buffers settle,
			// and ensures clear log separation.
			time.Sleep(500 * time.Millisecond)
		}
	}

	// 3. Cleanup files if requested
	if wf.CleanupFiles && len(cleanupPaths) > 0 && len(serverIDs) > 0 {
		fmt.Fprintf(logFile, "\n--- CLEANING UP TRANSFERRED FILES ---\n")
		for _, path := range cleanupPaths {
			cmdStr := fmt.Sprintf("rm -f %s", path)
			for _, serverID := range serverIDs {
				_, err := e.serverService.ExecuteCommand(serverID, cmdStr, execution.User, nil, nil)
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
		e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterFailed, wf.NamespaceID, logFile, depth, execution.User)
	} else {
		wf.Status = domain.StatusSuccess
		execution.Status = domain.StatusSuccess
		fmt.Fprintf(logFile, "\n--- WORKFLOW SUCCESS ---\n")

		// Execute AFTER_SUCCESS hooks
		e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterSuccess, wf.NamespaceID, logFile, depth, execution.User)
	}

	e.execRepo.Update(execution)
	e.wfRepo.Update(wf)
	e.hub.BroadcastStatus(wf.ID.String(), "workflow", string(wf.Status))

	return runErr
}

func (e *WorkflowExecutor) RunHooks(ctx context.Context, hooks []domain.WorkflowHook, hookType domain.HookType, namespaceID uuid.UUID, logFile *os.File, depth int, user *domain.User) error {
	for _, hook := range hooks {
		if hook.HookType != hookType {
			continue
		}

		if logFile != nil {
			fmt.Fprintf(logFile, "\n>>> EXECUTING %s HOOK: %s <<<\n", hookType, hook.TargetWorkflowID)
		}
		if hook.WorkflowID != nil {
			e.hub.BroadcastLog(hook.WorkflowID.String(), fmt.Sprintf(">>> Executing %s hook...", hookType))
		}

		var hookInputs map[string]string
		if hook.Inputs != "" {
			json.Unmarshal([]byte(hook.Inputs), &hookInputs)
		}

		hookExecID := uuid.New()
		err := e.RunWithDepth(ctx, hook.TargetWorkflowID, hookExecID, hookInputs, nil, depth+1, user)
		if err != nil {
			if logFile != nil {
				fmt.Fprintf(logFile, "!!! HOOK FAILED: %v !!!\n", err)
			}
			return err
		}
		if logFile != nil {
			fmt.Fprintf(logFile, ">>> HOOK SUCCESS <<<\n\n")
		}
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

func (e *WorkflowExecutor) evaluateCondition(condition string, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID, user *domain.User) (bool, error) {
	if strings.TrimSpace(condition) == "" {
		return true, nil // Empty condition = always run
	}

	// Resolve all placeholders in the condition first
	resolved := condition

	// 1. Resolve {{global.key}}
	if e.globalVarRepo != nil {
		scope := domain.GetPermissionScope(user, "namespaces", "READ")
		gvs, _ := e.globalVarRepo.List(namespaceID, &scope)
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

func (e *WorkflowExecutor) runGroup(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, defaultServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID, user *domain.User, workingDirs *sync.Map) error {
	// Evaluate condition before running
	if shouldRun, err := e.evaluateCondition(group.Condition, inputs, variables, groupResults, namespaceID, user); err != nil {
		errStr := fmt.Sprintf("\n%s\n[GROUP CONDITION ERROR] %s\nCondition: %s\nError: %v\n%s\n", strings.Repeat("!", 80), group.Name, group.Condition, err, strings.Repeat("!", 80))
		fmt.Fprint(logFile, errStr)
		e.hub.BroadcastLog(workflowID.String(), errStr)
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
				if err := e.runStep(ctx, step, inputs, variables, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs); err != nil {
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
			if err := e.runStep(ctx, &group.Steps[i], inputs, variables, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs); err != nil {
				group.Status = domain.StatusFailed
				e.groupRepo.Update(group)
				e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusFailed))
				return err
			}
		}
	}
	// Perform relay copy if configured before marking group as SUCCESS
	if group.CopySourcePath != "" && group.CopyTargetServerID != uuid.Nil && group.CopyTargetPath != "" {
		if err := e.relayCopy(ctx, group, effectiveServerID, logFile, workflowID, user); err != nil {
			fmt.Fprintf(logFile, "Relay copy failed: %v\n", err)
			e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("Relay copy failed: %v", err))
			group.Status = domain.StatusFailed
			e.groupRepo.Update(group)
			e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusFailed))
			return fmt.Errorf("relay copy failed: %w", err)
		}
	}

	group.Status = domain.StatusSuccess
	e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusSuccess))

	// Explicit completion marker for logs
	compMsg := fmt.Sprintf("\n%s\n--- GROUP COMPLETE: %s ---\n%s\n", strings.Repeat("-", 20), group.Name, strings.Repeat("-", 20))
	fmt.Fprint(logFile, compMsg)
	e.hub.BroadcastLog(workflowID.String(), compMsg)

	return e.groupRepo.Update(group)
}

func (e *WorkflowExecutor) relayCopy(ctx context.Context, group *domain.WorkflowGroup, sourceServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, user *domain.User) error {
	fmt.Fprintf(logFile, "\n--- RELAY COPY: %s -> Server(%s):%s ---\n", group.CopySourcePath, group.CopyTargetServerID, group.CopyTargetPath)
	e.hub.BroadcastLog(workflowID.String(), "Starting relay copy...")

	// 1. Create tarball on source server
	tmpTarName := fmt.Sprintf("relay_%s.tar.gz", uuid.New().String())
	sourceDir := filepath.Dir(group.CopySourcePath)
	sourceBase := filepath.Base(group.CopySourcePath)

	// Use tar -czf to create a compressed archive. Use -C to change directory so the path in tar is relative.
	tarCmd := fmt.Sprintf("tar -czf /tmp/%s -C %s %s", tmpTarName, sourceDir, sourceBase)
	_, err := e.serverService.ExecuteCommand(sourceServerID, tarCmd, user)
	if err != nil {
		return fmt.Errorf("failed to create tarball on source: %w", err)
	}
	defer e.serverService.ExecuteCommand(sourceServerID, fmt.Sprintf("rm -f /tmp/%s", tmpTarName), user)

	// 2. Download tarball to backend
	localTmpDir := filepath.Join("data", "tmp", "relay")
	os.MkdirAll(localTmpDir, 0755)
	localTarPath := filepath.Join(localTmpDir, tmpTarName)
	err = e.serverService.DownloadFileFromServer(ctx, sourceServerID, "/tmp/"+tmpTarName, localTarPath, user)
	if err != nil {
		return fmt.Errorf("failed to download tarball to backend: %w", err)
	}
	defer os.Remove(localTarPath)

	// 3. Upload tarball to target server
	err = e.serverService.UploadFileToServers(ctx, []uuid.UUID{group.CopyTargetServerID}, localTarPath, "/tmp/"+tmpTarName, user)
	if err != nil {
		return fmt.Errorf("failed to upload tarball to target: %w", err)
	}
	defer e.serverService.ExecuteCommand(group.CopyTargetServerID, fmt.Sprintf("rm -f /tmp/%s", tmpTarName), user)

	// 4. Extract tarball on target server
	// Ensure target directory exists and extract. -xovf: extract, overwrite, verbose, file. --strip-components=0 or just extract.
	// We want to overwrite, so we use --overwrite (or it's default in many tar versions).
	// We also ensure the target path exists.
	mkdirCmd := fmt.Sprintf("mkdir -p %s", group.CopyTargetPath)
	e.serverService.ExecuteCommand(group.CopyTargetServerID, mkdirCmd, user)

	extractCmd := fmt.Sprintf("tar -xzf /tmp/%s -C %s", tmpTarName, group.CopyTargetPath)
	_, err = e.serverService.ExecuteCommand(group.CopyTargetServerID, extractCmd, user)
	if err != nil {
		return fmt.Errorf("failed to extract tarball on target: %w", err)
	}

	fmt.Fprintf(logFile, "--- RELAY COPY SUCCESS ---\n")
	e.hub.BroadcastLog(workflowID.String(), "Relay copy completed successfully.")
	return nil
}

func (e *WorkflowExecutor) runStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, variables []domain.WorkflowVariable, defaultServerID uuid.UUID, mainLogFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID, user *domain.User, workingDirs *sync.Map) error {
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
	securityRegex := regexp.MustCompile(`^[a-zA-Z0-9_\-\.\ \/]+$`)

	// 1. Static Variables: {{variable.key}}
	for _, v := range variables {
		if v.Value != "" && !securityRegex.MatchString(v.Value) {
			return fmt.Errorf("security violation: variable '%s' contains invalid characters", v.Key)
		}
		command = strings.ReplaceAll(command, "{{variable."+v.Key+"}}", v.Value)
	}
	// 2. Runtime Inputs: {{key}}
	for k, v := range inputs {
		// Note: inputs are already validated at the start of the workflow execution,
		// but re-validating here doesn't hurt.
		if v != "" && !securityRegex.MatchString(v) {
			return fmt.Errorf("security violation: input '%s' contains invalid characters", k)
		}
		command = strings.ReplaceAll(command, "{{"+k+"}}", v)
	}
	// 3. Global Variables: {{global.key}}
	if e.globalVarRepo != nil {
		scope := domain.GetPermissionScope(user, "namespaces", "READ")
		gvs, _ := e.globalVarRepo.List(namespaceID, &scope)
		for _, v := range gvs {
			if v.Value != "" && !securityRegex.MatchString(v.Value) {
				return fmt.Errorf("security violation: global variable '%s' contains invalid characters", v.Key)
			}
			command = strings.ReplaceAll(command, "{{global."+v.Key+"}}", v.Value)
		}
	}

	targetServerID := step.ServerID
	if targetServerID == uuid.Nil {
		targetServerID = defaultServerID
	}

	// Persist CWD: Prepend directory restoration and append directory capture
	cwdMarker := "::CWD::"
	var startingDir string // Track where this step started
	if targetServerID != uuid.Nil {
		if val, ok := workingDirs.Load(targetServerID); ok {
			startingDir = val.(string)
			if startingDir != "" {
				// Use curly braces for grouping in the same shell context.
				// Note: Semicolon after the command is required before the closing brace.
				command = fmt.Sprintf("cd %s && { %s; }", strconv.Quote(startingDir), command)
			}
		}
		// Use -P to resolve physical path (essential for Mac/Unix symlink consistency)
		command = fmt.Sprintf("%s; printf '%s' && pwd -P", command, cwdMarker)
	}

	if targetServerID != uuid.Nil {
		// Run on remote server via ServerService with real-time streaming
		var out bytes.Buffer

		// Multi-writer for all destinations we want cleaned
		mw := io.MultiWriter(
			&wsWriter{hub: e.hub, targetID: step.ID.String(), buffer: &out},
			&wsWriter{hub: e.hub, targetID: workflowID.String(), buffer: mainLogFile},
			&fileWriter{file: stepLogFile},
		)

		// Filter out the CWD marker and capture the directory
		filter := &cwdFilteredWriter{
			underlying: mw,
			marker:     cwdMarker,
		}

		_, err = e.serverService.ExecuteCommand(targetServerID, command, user, filter)
		filter.Finalize()
		output = out.String()
		if filter.found {
			newDir := filepath.Clean(strings.TrimSpace(filter.cwdBuffer.String()))
			// Heuristic: only update the shared state if the directory actually changed.
			// This prevents parallel "passive" steps from overwriting intentional directory changes.
			if newDir != "" && newDir != filepath.Clean(startingDir) {
				workingDirs.Store(targetServerID, newDir)
			}
		}
	} else {
		// Run locally
		output, err = e.runLocalStep(ctx, step, command, mainLogFile, stepLogFile, workflowID, workingDirs)
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

func (e *WorkflowExecutor) runLocalStep(ctx context.Context, step *domain.WorkflowStep, command string, mainLogFile *os.File, stepLogFile *os.File, workflowID uuid.UUID, workingDirs *sync.Map) (string, error) {
	// Persist CWD for local execution
	localID := uuid.Nil // Use Nil UUID as key for local server
	cwdMarker := "::CWD::"
	var startingDir string
	if val, ok := workingDirs.Load(localID); ok {
		startingDir = val.(string)
		if startingDir != "" {
			// Use curly braces for grouping in the same shell context
			command = fmt.Sprintf("cd %s && { %s; }", strconv.Quote(startingDir), command)
		}
	}
	// Use -P for local consistency as well
	command = fmt.Sprintf("%s; printf '%s' && pwd -P", command, cwdMarker)

	c := exec.CommandContext(ctx, "sh", "-c", command)
	var out bytes.Buffer

	// Multi-writer for all destinations we want cleaned
	mw := io.MultiWriter(
		&wsWriter{hub: e.hub, targetID: step.ID.String(), buffer: &out},
		&wsWriter{hub: e.hub, targetID: workflowID.String(), buffer: mainLogFile},
		&fileWriter{file: stepLogFile},
	)

	// Filter out the CWD marker and capture the directory
	filter := &cwdFilteredWriter{
		underlying: mw,
		marker:     cwdMarker,
	}

	c.Stdout = filter
	c.Stderr = filter

	err := c.Run()
	filter.Finalize()
	if filter.found {
		newDir := filepath.Clean(strings.TrimSpace(filter.cwdBuffer.String()))
		// Heuristic: only update the shared state if the directory actually changed.
		if newDir != "" && newDir != filepath.Clean(startingDir) {
			workingDirs.Store(localID, newDir)
		}
	}
	return out.String(), err
}

// Helper for io.MultiWriter with os.File
type fileWriter struct {
	file *os.File
}

func (w *fileWriter) Write(p []byte) (n int, err error) {
	return w.file.Write(p)
}

type wsWriter struct {
	hub      *Hub
	targetID string
	buffer   io.Writer
}

func (w *wsWriter) Write(p []byte) (n int, err error) {
	n, err = w.buffer.Write(p)
	w.hub.BroadcastLog(w.targetID, string(p))
	return n, err
}

type cwdFilteredWriter struct {
	underlying io.Writer
	marker     string
	buffer     bytes.Buffer
	found      bool
	cwdBuffer  strings.Builder
	mu         sync.Mutex
}

func (w *cwdFilteredWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.found {
		w.cwdBuffer.Write(p)
		return len(p), nil
	}

	w.buffer.Write(p)
	content := w.buffer.Bytes()
	idx := bytes.Index(content, []byte(w.marker))

	if idx != -1 {
		// Output everything before the marker
		if _, err := w.underlying.Write(content[:idx]); err != nil {
			return 0, err
		}
		w.found = true
		// Capture anything after the marker in this chunk
		w.cwdBuffer.Write(content[idx+len(w.marker):])
		w.buffer.Reset()
		return len(p), nil
	}

	// Line buffering: Only flush when we see a newline,
	// unless the buffer is getting very large.
	for {
		curr := w.buffer.Bytes()
		nlIdx := bytes.IndexByte(curr, '\n')
		if nlIdx == -1 {
			break
		}
		// Flush one line
		if _, err := w.underlying.Write(w.buffer.Next(nlIdx + 1)); err != nil {
			return 0, err
		}
	}

	return len(p), nil
}

func (w *cwdFilteredWriter) Finalize() {
	w.mu.Lock()
	defer w.mu.Unlock()

	if !w.found && w.buffer.Len() > 0 {
		w.underlying.Write(w.buffer.Bytes())
		w.buffer.Reset()
	}
}
