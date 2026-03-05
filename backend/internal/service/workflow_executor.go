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

	"github.com/flosch/pongo2/v6"
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

func (e *WorkflowExecutor) Run(ctx context.Context, workflowID uuid.UUID, execID uuid.UUID, inputs map[string]string, scheduledID *uuid.UUID, pageID *uuid.UUID, triggerSource string, user *domain.User) error {
	return e.RunWithDepth(ctx, workflowID, execID, inputs, scheduledID, pageID, triggerSource, 0, user)
}

func (e *WorkflowExecutor) RunWithDepth(ctx context.Context, workflowID uuid.UUID, execID uuid.UUID, inputs map[string]string, scheduledID *uuid.UUID, pageID *uuid.UUID, triggerSource string, depth int, user *domain.User) error {
	if depth > 3 {
		return fmt.Errorf("maximum hook depth exceeded (circular dependency?)")
	}

	var scope *domain.PermissionScope
	if depth == 0 {
		if user == nil {
			scope = &domain.PermissionScope{IsGlobal: true}
		} else {
			s := domain.GetPermissionScope(user, "workflows", "EXECUTE")
			scope = &s
		}
	}

	wf, err := e.wfRepo.GetByID(workflowID, scope)
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
			ID:            execID,
			WorkflowID:    workflowID,
			Status:        domain.StatusRunning,
			Inputs:        string(inputsJSON),
			StartedAt:     time.Now(),
			ScheduledID:   scheduledID,
			PageID:        pageID,
			TriggerSource: triggerSource,
		}
		if user != nil {
			execution.ExecutedBy = &user.ID
			execution.User = user
		}
		e.execRepo.Create(execution)
	} else {
		// Even if record exists, update with trigger info if missing
		execution.PageID = pageID
		execution.TriggerSource = triggerSource
		if scheduledID != nil {
			execution.ScheduledID = scheduledID
		}
	}

	// Update with log path
	execution.LogPath = mainLogPath
	e.execRepo.Update(execution)

	return e.Execute(ctx, workflowID, execution, depth)
}

func (e *WorkflowExecutor) Execute(ctx context.Context, workflowID uuid.UUID, execution *domain.WorkflowExecution, depth int) error {
	var runErr error
	var serverIDs []uuid.UUID
	var transferServerIDs []uuid.UUID
	var cleanupPaths []string
	serverSet := make(map[uuid.UUID]bool)

	wf, err := e.wfRepo.GetByID(workflowID, nil)
	if err != nil {
		return fmt.Errorf("failed to get workflow: %w", err)
	}

	logFile, err := os.OpenFile(execution.LogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	defer logFile.Close()

	// Determine who is running the workflow
	executedBy := "System"
	if execution.User != nil {
		if execution.User.FullName != "" {
			executedBy = execution.User.FullName
		} else {
			executedBy = execution.User.Username
		}
	} else if execution.ExecutedBy == nil {
		executedBy = "System"
	}

	fmt.Fprintf(logFile, "\033[1;36m▶ WORKFLOW: %s\033[0m\n", wf.Name)
	fmt.Fprintf(logFile, "\033[36mUser: %s | Started: %s\033[0m\n", executedBy, execution.StartedAt.Format("2006-01-02 15:04:05"))

	// Log Inputs if available
	if execution.Inputs != "" && execution.Inputs != "{}" {
		var inputs map[string]string
		if err := json.Unmarshal([]byte(execution.Inputs), &inputs); err == nil && len(inputs) > 0 {
			fmt.Fprintf(logFile, "\033[36mInputs:\033[0m\n")
			for k, v := range inputs {
				fmt.Fprintf(logFile, "  \033[90m- %s:\033[0m %s\n", k, v)
			}
		}
	}
	fmt.Fprintf(logFile, "\n")

	e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("\033[1;36m▶ WORKFLOW STARTED: %s (by %s)\033[0m", wf.Name, executedBy))

	wf.Status = domain.StatusRunning
	e.wfRepo.Update(wf)
	e.hub.BroadcastStatus(wf.ID.String(), "workflow", string(domain.StatusRunning))

	// Reset groups and steps to PENDING for new execution visualization
	for i := range wf.Groups {
		wf.Groups[i].Status = domain.StatusPending
		e.groupRepo.Update(&wf.Groups[i])
		e.hub.BroadcastStatus(wf.Groups[i].ID.String(), "group", string(domain.StatusPending))
		for j := range wf.Groups[i].Steps {
			wf.Groups[i].Steps[j].Status = domain.StatusPending
			e.stepRepo.Update(&wf.Groups[i].Steps[j])
			e.hub.BroadcastStatus(wf.Groups[i].Steps[j].ID.String(), "step", string(domain.StatusPending))
		}
	}

	// 0. Execute BEFORE hooks
	if err := e.RunHooks(ctx, wf.Hooks, domain.HookTypeBefore, wf.NamespaceID, logFile, depth, execution.User); err != nil {
		runErr = fmt.Errorf("before hook failed: %w", err)
		e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("Error: %v", runErr))
		goto finalize
	}

	// 1. Transfer files to servers
	// Per user request: ONLY upload to the primary Workflow Default Server to avoid unintentional "local Mac" targeting
	if wf.DefaultServerID != uuid.Nil {
		transferServerIDs = []uuid.UUID{wf.DefaultServerID}
	} else {
		transferServerIDs = []uuid.UUID{domain.LocalServerID}
	}

	if len(wf.Files) > 0 {
		fmt.Fprintf(logFile, "\033[1;34m📁 FILE OPERATION (%d files)\033[0m\n", len(wf.Files))
		for _, f := range wf.Files {
			targetPath := f.TargetPath
			if wf.TargetFolder != "" {
				targetPath = filepath.Join(wf.TargetFolder, f.FileName)
			}
			cleanupPaths = append(cleanupPaths, targetPath)

			fmt.Fprintf(logFile, "\033[34m→ %s: \033[0m", f.FileName)
			e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("\033[34m→ Transferring %s\033[0m", f.FileName))

			err := e.serverService.UploadFileToServers(ctx, transferServerIDs, f.LocalPath, targetPath, nil)
			if err != nil {
				runErr = fmt.Errorf("failed to transfer file %s: %w", f.FileName, err)
				fmt.Fprintf(logFile, "\033[1;31m✖ FAILED\033[0m\n")
				e.hub.BroadcastLog(workflowID.String(), fmt.Sprintf("\033[1;31m✖ Transfer failed: %s\033[0m", f.FileName))
				break
			} else {
				fmt.Fprintf(logFile, "\033[1;32mDONE\033[0m\n")
			}
		}
		fmt.Fprintf(logFile, "\n")
	}

	// Get all unique servers in this workflow for execution
	if wf.DefaultServerID != uuid.Nil {
		serverSet[wf.DefaultServerID] = true
	} else {
		serverSet[domain.LocalServerID] = true
	}
	for _, g := range wf.Groups {
		if g.DefaultServerID != uuid.Nil {
			serverSet[g.DefaultServerID] = true
		}
		for _, s := range g.Steps {
			if s.ServerID != uuid.Nil {
				serverSet[s.ServerID] = true
			} else {
				serverSet[domain.LocalServerID] = true
			}
		}
	}

	for id := range serverSet {
		serverIDs = append(serverIDs, id)
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

		// Re-parse inputs from execution.Inputs for runGroup
		var inputsMap map[string]string
		json.Unmarshal([]byte(execution.Inputs), &inputsMap)

		for i := range wf.Groups {
			err := e.runGroup(ctx, &wf.Groups[i], inputsMap, wf.Variables, groupResults, wf.DefaultServerID, logFile, workflowID, execution.ID, wf.NamespaceID, execution.User, workingDirs)
			groupResults[wf.Groups[i].Key] = string(wf.Groups[i].Status)
			if err != nil {
				runErr = err
				break
			}
			// Strict Group Boundary: Small gap to let SSH connections and buffers settle,
			// and ensures clear log separation.
			time.Sleep(300 * time.Millisecond)
		}
	}

	if wf.CleanupFiles && len(cleanupPaths) > 0 && len(serverIDs) > 0 {
		fmt.Fprintf(logFile, "\n\033[1;34m🗑 CLEANUP OPERATION\033[0m\n")
		for _, path := range cleanupPaths {
			cmdStr := fmt.Sprintf("rm -f %s", path)
			for _, serverID := range serverIDs {
				_, err := e.serverService.ExecuteCommand(serverID, cmdStr, nil, nil, nil) // Trusted: pass nil user
				if err != nil {
					fmt.Fprintf(logFile, "\033[1;31m✖ Failed: %s (%v)\033[0m\n", path, err)
				}
			}
			fmt.Fprintf(logFile, "\033[34m✔ Cleaned: %s\033[0m\n", path)
		}
	}

	e.hub.BroadcastStatus(wf.ID.String(), "workflow", string(wf.Status))

finalize:
	finishedAt := time.Now()
	execution.FinishedAt = &finishedAt

	if runErr != nil {
		wf.Status = domain.StatusFailed
		execution.Status = domain.StatusFailed
		fmt.Fprintf(logFile, "\n\033[1;31m✖ WORKFLOW FAILED: %v\033[0m\n", runErr)
		e.hub.BroadcastLog(wf.ID.String(), fmt.Sprintf("\n\033[1;31m✖ WORKFLOW FAILED: %v\033[0m", runErr))

		// Execute AFTER_FAILED hooks
		e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterFailed, wf.NamespaceID, logFile, depth, execution.User)
	} else {
		wf.Status = domain.StatusSuccess
		execution.Status = domain.StatusSuccess
		fmt.Fprintf(logFile, "\n\033[1;32m✔ WORKFLOW SUCCESS\033[0m\n")
		e.hub.BroadcastLog(wf.ID.String(), "\n\033[1;32m✔ WORKFLOW SUCCESS\033[0m")

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
			fmt.Fprintf(logFile, "\n\033[1;34m↪ TRIGGER HOOK: %s\033[0m\n", hookType)
		}
		if hook.WorkflowID != nil {
			e.hub.BroadcastLog(hook.WorkflowID.String(), fmt.Sprintf("\033[1;34m↪ Hook: %s (Running in background)\033[0m", hookType))
		}

		var hookInputs map[string]string
		if hook.Inputs != "" {
			json.Unmarshal([]byte(hook.Inputs), &hookInputs)
		}

		hookExecID := uuid.New()

		// Run hook asynchronously so it doesn't block the progress of the workflow/schedule
		go func(h domain.WorkflowHook, execID uuid.UUID, inputs map[string]string) {
			bgCtx := context.Background()
			err := e.RunWithDepth(bgCtx, h.TargetWorkflowID, execID, inputs, nil, nil, "HOOK", depth+1, user)
			if err != nil {
				errMsg := fmt.Sprintf("\033[1;33m⚠ Warning: %s hook failed (%v)\033[0m", hookType, err)
				if h.WorkflowID != nil {
					e.hub.BroadcastLog(h.WorkflowID.String(), errMsg)
				}
			} else {
				if h.WorkflowID != nil {
					e.hub.BroadcastLog(h.WorkflowID.String(), fmt.Sprintf("\033[1;32m✔ %s HOOK SUCCESS\033[0m", hookType))
				}
			}
		}(hook, hookExecID, hookInputs)
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
			// Whitelist approach: only allow alphabetic characters (including Unicode), digits, spaces, and basic symbols used in paths/params
			// We block shell metacharacters: ; & | $ ` > < ( ) etc.
			matched, _ := regexp.MatchString(`^[\pL0-9_\-\.\ \/]+$`, val)
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

	// 1. Resolve variables using Pongo2
	pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)
	resolved, err := e.renderTemplate(condition, pcontext)
	if err != nil {
		return false, fmt.Errorf("failed to interpolate condition: %w", err)
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
		errStr := fmt.Sprintf("\n\033[1;31m✖ GROUP CONDITION ERROR: %s\033[0m\n\033[31mCondition: %s\nError: %v\033[0m\n", group.Name, group.Condition, err)
		fmt.Fprint(logFile, errStr)
		e.hub.BroadcastLog(workflowID.String(), errStr)
		return fmt.Errorf("group %q condition error: %w", group.Name, err)
	} else if !shouldRun {
		msg := fmt.Sprintf("\n\033[1;33m⏭ GROUP SKIPPED: %s\033[0m \033[90m(Condition returned false)\033[0m\n", group.Name)
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), msg)
		group.Status = "SKIPPED"
		e.groupRepo.Update(group)
		e.hub.BroadcastStatus(group.ID.String(), "group", "SKIPPED")
		return nil
	}

	msg := fmt.Sprintf("\n\n\033[1;35m❖ GROUP START: %s\033[0m \033[90m[Parallel: %v]\033[0m\n", group.Name, group.IsParallel)
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
				if err := e.runStep(ctx, step, inputs, variables, groupResults, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs); err != nil {
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
				if group.ContinueOnFailure {
					msg := fmt.Sprintf("\n\033[1;33m⚠ GROUP FAILED BUT CONTINUING:\033[0m %s (Continue on Failure enabled)\n", group.Name)
					fmt.Fprint(logFile, msg)
					e.hub.BroadcastLog(workflowID.String(), msg)
					return nil
				}
				return err
			}
		}
	} else {
		for i := range group.Steps {
			if err := e.runStep(ctx, &group.Steps[i], inputs, variables, groupResults, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs); err != nil {
				group.Status = domain.StatusFailed
				e.groupRepo.Update(group)
				e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusFailed))
				if group.ContinueOnFailure {
					msg := fmt.Sprintf("\n\033[1;33m⚠ GROUP FAILED BUT CONTINUING:\033[0m %s (Continue on Failure enabled)\n", group.Name)
					fmt.Fprint(logFile, msg)
					e.hub.BroadcastLog(workflowID.String(), msg)
					return nil
				}
				return err
			}
			// Sequential Step Delay: 200ms gap between steps to prevent race conditions
			// or overwhelming the target server.
			if i < len(group.Steps)-1 {
				time.Sleep(200 * time.Millisecond)
			}
		}
	}
	// Perform relay copy if configured before marking group as SUCCESS
	if group.IsCopyEnabled {
		msg := fmt.Sprintf("\033[90m⚙ Relay copy enabled for group %q\033[0m\n", group.Name)
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), msg)

		if group.CopySourcePath != "" && group.CopyTargetPath != "" {
			if err := e.relayCopy(ctx, group, inputs, variables, groupResults, namespaceID, effectiveServerID, logFile, workflowID, user); err != nil {
				errMsg := fmt.Sprintf("\033[1;31m✖ Relay copy failed: %v\033[0m\n", err)
				fmt.Fprint(logFile, errMsg)
				e.hub.BroadcastLog(workflowID.String(), errMsg)
				group.Status = domain.StatusFailed
				e.groupRepo.Update(group)
				e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusFailed))
				if group.ContinueOnFailure {
					msg := fmt.Sprintf("\033[1;33m⚠ RELAY COPY FAILED BUT CONTINUING:\033[0m %s (Continue on Failure enabled)\n", group.Name)
					fmt.Fprint(logFile, msg)
					e.hub.BroadcastLog(workflowID.String(), msg)
					return nil
				}
				return fmt.Errorf("relay copy failed: %w", err)
			}
		} else {
			msg := "\033[90m⚙ Relay copy skipped: missing paths\033[0m\n"
			fmt.Fprint(logFile, msg)
			e.hub.BroadcastLog(workflowID.String(), msg)
		}
	} else {
		msg := fmt.Sprintf("\033[90m⚙ Relay copy disabled for group %q\033[0m\n", group.Name)
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), msg)
	}

	group.Status = domain.StatusSuccess
	e.hub.BroadcastStatus(group.ID.String(), "group", string(domain.StatusSuccess))

	return e.groupRepo.Update(group)
}

func (e *WorkflowExecutor) relayCopy(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID, sourceServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, user *domain.User) error {
	sourcePath := filepath.Clean(group.CopySourcePath)
	targetPath := filepath.Clean(group.CopyTargetPath)

	// Perform variable substitution
	substitute := func(val string) (string, error) {
		pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)
		return e.renderTemplate(val, pcontext)
	}

	var err error
	sourcePath, err = substitute(sourcePath)
	if err != nil {
		return err
	}
	targetPath, err = substitute(targetPath)
	if err != nil {
		return err
	}

	msgRef := fmt.Sprintf("\033[1;34m📦 RELAY COPY: %s -> Server(%s):%s\033[0m\n", sourcePath, group.CopyTargetServerID, targetPath)
	fmt.Fprint(logFile, msgRef)
	e.hub.BroadcastLog(workflowID.String(), msgRef)
	fmt.Fprintf(logFile, "\033[34mStarting relay copy...\033[0m\n")
	e.hub.BroadcastLog(workflowID.String(), "\033[34mStarting relay copy...\033[0m\n")

	// 1. Create tarball on source server
	tmpTarName := fmt.Sprintf("relay_%s.tar.gz", uuid.New().String())
	sourceDir := filepath.Dir(sourcePath)
	sourceBase := filepath.Base(sourcePath)

	// Use tar -czf to create a compressed archive. Use -C to change directory so the path in tar is relative.
	tarCmd := fmt.Sprintf("tar -czf /tmp/%s -C %s %s", tmpTarName, strconv.Quote(sourceDir), strconv.Quote(sourceBase))
	_, err = e.serverService.ExecuteCommand(sourceServerID, tarCmd, nil) // Trusted: pass nil user
	if err != nil {
		return fmt.Errorf("failed to create tarball on source: %w", err)
	}
	defer e.serverService.ExecuteCommand(sourceServerID, fmt.Sprintf("rm -f /tmp/%s", tmpTarName), nil) // Trusted: pass nil user

	// 2. Download tarball to backend
	localTmpDir := filepath.Join("data", "tmp", "relay")
	if err := os.MkdirAll(localTmpDir, 0755); err != nil {
		return fmt.Errorf("failed to create local relay directory: %w", err)
	}
	localTarPath := filepath.Join(localTmpDir, tmpTarName)
	err = e.serverService.DownloadFileFromServer(ctx, sourceServerID, "/tmp/"+tmpTarName, localTarPath, nil) // Trusted: pass nil user
	if err != nil {
		return fmt.Errorf("failed to download tarball to backend: %w", err)
	}
	defer os.Remove(localTarPath)

	// 3. Upload tarball to target server
	err = e.serverService.UploadFileToServers(ctx, []uuid.UUID{group.CopyTargetServerID}, localTarPath, "/tmp/"+tmpTarName, nil) // Trusted: pass nil user
	if err != nil {
		return fmt.Errorf("failed to upload tarball to target: %w", err)
	}
	defer e.serverService.ExecuteCommand(group.CopyTargetServerID, fmt.Sprintf("rm -f /tmp/%s", tmpTarName), nil) // Trusted: pass nil user

	// 4. Extract tarball on target server
	mkdirCmd := fmt.Sprintf("mkdir -p %s", strconv.Quote(targetPath))
	e.serverService.ExecuteCommand(group.CopyTargetServerID, mkdirCmd, nil) // Trusted: pass nil user

	extractCmd := fmt.Sprintf("tar -xzf /tmp/%s -C %s", tmpTarName, strconv.Quote(targetPath))
	_, err = e.serverService.ExecuteCommand(group.CopyTargetServerID, extractCmd, nil) // Trusted: pass nil user
	if err != nil {
		return fmt.Errorf("failed to extract tarball on target: %w", err)
	}

	successMsg := "\033[1;32m✔ RELAY COPY SUCCESS\033[0m\n"
	fmt.Fprint(logFile, successMsg)
	e.hub.BroadcastLog(workflowID.String(), successMsg)
	return nil
}

func (e *WorkflowExecutor) runStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, defaultServerID uuid.UUID, mainLogFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID, user *domain.User, workingDirs *sync.Map) error {
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

	msg := fmt.Sprintf("\033[1;36m>> STEP: %s\033[0m\n", step.Name)
	fmt.Fprint(mainLogFile, msg)
	fmt.Fprint(stepLogFile, msg)

	e.hub.BroadcastLog(step.ID.String(), msg)
	e.hub.BroadcastLog(step.GroupID.String(), msg)
	e.hub.BroadcastLog(workflowID.String(), msg)

	if step.CommandText == "" {
		emptyMsg := "\033[90m(No command to execute)\033[0m\n"
		fmt.Fprint(mainLogFile, emptyMsg)
		fmt.Fprint(stepLogFile, emptyMsg)
		step.Status = domain.StatusSuccess
		e.stepRepo.Update(step)
		e.hub.BroadcastStatus(step.ID.String(), "step", string(domain.StatusSuccess))
		return nil
	}
	var output string
	var err error

	// 1. Resolve variables using Pongo2
	pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)
	command, err := e.renderTemplate(step.CommandText, pcontext)
	if err != nil {
		errMsg := fmt.Sprintf("\033[1;31m✖ Interpolation error: %v\033[0m\n", err)
		fmt.Fprint(mainLogFile, errMsg)
		fmt.Fprint(stepLogFile, errMsg)
		return fmt.Errorf("interpolation error: %w", err)
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

		_, err = e.serverService.ExecuteCommand(targetServerID, command, nil, filter) // Trusted: pass nil user
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

func (e *WorkflowExecutor) renderTemplate(templateStr string, ctx pongo2.Context) (string, error) {
	tpl, err := pongo2.FromString(templateStr)
	if err != nil {
		return "", fmt.Errorf("template syntax error: %w", err)
	}
	return tpl.Execute(ctx)
}

func (e *WorkflowExecutor) getInterpolationContext(inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID, user *domain.User) pongo2.Context {
	ctx := make(pongo2.Context)
	securityRegex := regexp.MustCompile(`^[\pL0-9_\-\.\ \/]+$`)

	// 1. Global Variables: global.key
	global := make(map[string]string)
	if e.globalVarRepo != nil {
		scope := domain.PermissionScope{IsGlobal: true}
		gvs, _ := e.globalVarRepo.List(namespaceID, &scope)
		for _, v := range gvs {
			if v.Value == "" || securityRegex.MatchString(v.Value) {
				global[v.Key] = v.Value
			}
		}
	}
	ctx["global"] = global

	// 2. Variables: variable.key
	vars := make(map[string]string)
	for _, v := range variables {
		if v.Value == "" || securityRegex.MatchString(v.Value) {
			vars[v.Key] = v.Value
		}
	}
	ctx["variable"] = vars

	// 3. Inputs: input.key
	in := make(map[string]string)
	for k, v := range inputs {
		if v == "" || securityRegex.MatchString(v) {
			in[k] = v
		}
	}
	ctx["input"] = in

	// 4. Step/Group Status: step.key.status
	steps := make(map[string]interface{})
	for k, v := range groupResults {
		if v == "" || securityRegex.MatchString(v) {
			steps[k] = map[string]string{"status": v}
		}
	}
	ctx["step"] = steps

	return ctx
}
