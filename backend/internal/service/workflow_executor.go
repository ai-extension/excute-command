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
	activeExecs   sync.Map // map[uuid.UUID]context.CancelFunc
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
	// Create a cancellable context for this execution
	execCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	e.activeExecs.Store(execID, cancel)
	defer e.activeExecs.Delete(execID)

	return e.RunWithDepth(execCtx, workflowID, execID, inputs, scheduledID, pageID, triggerSource, 0, user)
}

func (e *WorkflowExecutor) StopExecution(execID uuid.UUID) error {
	if cancelVal, ok := e.activeExecs.Load(execID); ok {
		cancel := cancelVal.(context.CancelFunc)
		cancel()
		return nil
	}
	return fmt.Errorf("execution %s not found or already finished", execID)
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
		} else if execution.User == nil && execution.ExecutedBy != nil {
			// If we have an ID but still no user object (repo fallback/missing preload),
			// and we were passed a user, use it.
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

	// Apply Timeout if configured (> 0)
	if wf.TimeoutMinutes > 0 {
		timeoutCtx, cancelTimeout := context.WithTimeout(ctx, time.Duration(wf.TimeoutMinutes)*time.Minute)
		defer cancelTimeout()
		return e.Execute(timeoutCtx, workflowID, execution, depth)
	}

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

	// Create a log stream for this execution
	e.hub.CreateStream(execution.ID.String())
	defer e.hub.CloseStream(execution.ID.String())

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
	} else if execution.ExecutedBy != nil {
		// Fallback to ID string if user object is still missing despite having an ID
		executedBy = execution.ExecutedBy.String()
	}

	header := fmt.Sprintf("\033[1;36m▶ WORKFLOW: %s\033[0m\n", wf.Name)
	header += fmt.Sprintf("\033[36mUser: %s | Started: %s\033[0m\n", executedBy, execution.StartedAt.Format("2006-01-02 15:04:05"))

	// Log Inputs if available
	if execution.Inputs != "" && execution.Inputs != "{}" {
		var inputs map[string]string
		if err := json.Unmarshal([]byte(execution.Inputs), &inputs); err == nil && len(inputs) > 0 {
			header += "\033[36mInputs:\033[0m\n"
			for k, v := range inputs {
				header += fmt.Sprintf("  \033[90m- %s:\033[0m %s\n", k, v)
			}
		}
	}
	header += "\n"

	// Write to file
	fmt.Fprint(logFile, header)
	// Broadcast to hub (using workflow ID as target for global view)
	e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), header)

	wf.Status = domain.StatusRunning
	e.wfRepo.Update(wf)
	e.hub.BroadcastStatus(wf.ID.String(), execution.ID.String(), "workflow", string(domain.StatusRunning))

	// Reset groups and steps to PENDING for new execution visualization
	for i := range wf.Groups {
		wf.Groups[i].Status = domain.StatusPending
		e.groupRepo.Update(&wf.Groups[i])
		e.hub.BroadcastStatus(wf.Groups[i].ID.String(), execution.ID.String(), "group", string(domain.StatusPending))
		for j := range wf.Groups[i].Steps {
			e.hub.BroadcastStatus(wf.Groups[i].Steps[j].ID.String(), execution.ID.String(), "step", string(domain.StatusPending))
		}
	}

	// Initialize containers for interpolation
	groupResults := make(map[string]string)
	var inputsMap map[string]string
	if execution.Inputs != "" {
		json.Unmarshal([]byte(execution.Inputs), &inputsMap)
	}

	// 0. Execute BEFORE hooks
	if err := e.RunHooks(ctx, wf.Hooks, domain.HookTypeBefore, wf.NamespaceID, logFile, depth, execution.User, execution.ID); err != nil {
		runErr = fmt.Errorf("before hook failed: %w", err)
		e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), fmt.Sprintf("Error: %v", runErr))
		goto finalize
	}

	// 1. Transfer files to servers
	// Per user request: ONLY upload to the primary Workflow Default Server to avoid unintentional "local Mac" targeting
	if wf.DefaultServerID != nil {
		transferServerIDs = []uuid.UUID{*wf.DefaultServerID}
	} else {
		runErr = fmt.Errorf("no target server specified for workflow files")
		goto finalize
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
			e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), fmt.Sprintf("\033[34m→ Transferring %s\033[0m", f.FileName))

			sourcePath := f.LocalPath
			if f.UseVariableSubstitution {
				fmt.Fprintf(logFile, "\033[90m(Substitutions enabled)\033[0m ")
				// 1. Read file
				content, err := os.ReadFile(f.LocalPath)
				if err != nil {
					runErr = fmt.Errorf("failed to read file for substitution %s: %w", f.FileName, err)
					break
				}

				// 2. Render
				pcontext := e.getInterpolationContext(inputsMap, wf.Variables, groupResults, wf.NamespaceID, execution.User)
				rendered, err := e.renderTemplate(string(content), pcontext)
				if err != nil {
					runErr = fmt.Errorf("failed to substitute variables in %s: %w", f.FileName, err)
					break
				}

				// 3. Create temp file
				tmpDir := filepath.Join("data", "tmp", "substitutions")
				os.MkdirAll(tmpDir, 0755)
				tmpPath := filepath.Join(tmpDir, f.ID.String()+"_"+f.FileName)
				if err := os.WriteFile(tmpPath, []byte(rendered), 0644); err != nil {
					runErr = fmt.Errorf("failed to write substituted content for %s: %w", f.FileName, err)
					break
				}
				sourcePath = tmpPath
				defer os.Remove(tmpPath)
			}

			err := e.serverService.UploadFileToServers(ctx, transferServerIDs, sourcePath, targetPath, nil)
			if err != nil {
				runErr = fmt.Errorf("failed to transfer file %s: %w", f.FileName, err)
				fmt.Fprintf(logFile, "\033[1;31m✖ FAILED\033[0m\n")
				e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), fmt.Sprintf("\033[1;31m✖ Transfer failed: %s\033[0m", f.FileName))
				break
			} else {
				fmt.Fprintf(logFile, "\033[1;32mDONE\033[0m\n")
			}
		}
		fmt.Fprintf(logFile, "\n")
	}

	// Get all unique servers in this workflow for execution
	if wf.DefaultServerID != nil {
		serverSet[*wf.DefaultServerID] = true
	}
	for _, g := range wf.Groups {
		if g.DefaultServerID != nil {
			serverSet[*g.DefaultServerID] = true
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

	// 2. Execute workflow groups
	if runErr == nil {
		workingDirs := &sync.Map{}

		// Initialize baseline directories to prevent parallel race conditions in the first group
		// Baseline for local server (Nil UUID)
		if homeDir, err := os.UserHomeDir(); err == nil {
			workingDirs.Store(uuid.Nil, homeDir)
		}
		// Baseline for remote servers
		for id := range serverSet {
			// Get initial physical directory (resolving symlinks) on remote server without logging it
			out, err := e.serverService.ExecuteCommand(ctx, id, "pwd -P", execution.User)
			if err == nil {
				workingDirs.Store(id, filepath.Clean(strings.TrimSpace(out)))
			}
		}

		// Inputs already parsed as inputsMap above

		for i := range wf.Groups {
			// Check for cancellation before starting each group
			if err := ctx.Err(); err != nil {
				runErr = err
				goto finalize
			}

			g := wf.Groups[i]
			// Default server ID fallback:
			// 1. Group default server
			// 2. Workflow default server
			var groupDefaultServerID uuid.UUID
			if g.DefaultServerID != nil {
				groupDefaultServerID = *g.DefaultServerID
			} else if wf.DefaultServerID != nil {
				groupDefaultServerID = *wf.DefaultServerID
			}

			err := e.runGroup(ctx, &g, inputsMap, wf.Variables, groupResults, groupDefaultServerID, logFile, workflowID, execution.ID, wf.NamespaceID, execution.User, workingDirs)
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
				_, err := e.serverService.ExecuteCommand(ctx, serverID, cmdStr, nil) // Trusted: pass nil user
				if err != nil {
					fmt.Fprintf(logFile, "\033[1;31m✖ Failed: %s (%v)\033[0m\n", path, err)
				}
			}
			fmt.Fprintf(logFile, "\033[34m✔ Cleaned: %s\033[0m\n", path)
		}
	}

	e.hub.BroadcastStatus(wf.ID.String(), execution.ID.String(), "workflow", string(wf.Status))

finalize:
	finishedAt := time.Now()
	execution.FinishedAt = &finishedAt

	if runErr != nil {
		if ctx.Err() == context.Canceled {
			// Cancelled explicitly by user
			wf.Status = domain.StatusCancelled
			execution.Status = domain.StatusCancelled
			fmt.Fprintf(logFile, "\n\033[1;33m⏹ WORKFLOW CANCELLED: %v\033[0m\n", runErr)
			e.hub.BroadcastLog(wf.ID.String(), execution.ID.String(), "\n\033[1;33m⏹ WORKFLOW CANCELLED\033[0m")
			// We intentionally skip AFTER_FAILED hooks on cancellation as per requirements
		} else if ctx.Err() == context.DeadlineExceeded {
			// Timeout
			wf.Status = domain.StatusFailed
			execution.Status = domain.StatusFailed
			fmt.Fprintf(logFile, "\n\033[1;31m✖ WORKFLOW TIMED OUT (Exceeded %d minutes)\033[0m\n", wf.TimeoutMinutes)
			e.hub.BroadcastLog(wf.ID.String(), execution.ID.String(), fmt.Sprintf("\n\033[1;31m✖ WORKFLOW TIMED OUT (Exceeded %d minutes)\033[0m", wf.TimeoutMinutes))

			// Execute AFTER_FAILED hooks
			e.RunHooks(context.Background(), wf.Hooks, domain.HookTypeAfterFailed, wf.NamespaceID, logFile, depth, execution.User, execution.ID)
		} else {
			// Actual failure
			wf.Status = domain.StatusFailed
			execution.Status = domain.StatusFailed
			fmt.Fprintf(logFile, "\n\033[1;31m✖ WORKFLOW FAILED: %v\033[0m\n", runErr)
			e.hub.BroadcastLog(wf.ID.String(), execution.ID.String(), fmt.Sprintf("\n\033[1;31m✖ WORKFLOW FAILED: %v\033[0m", runErr))

			// Execute AFTER_FAILED hooks
			e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterFailed, wf.NamespaceID, logFile, depth, execution.User, execution.ID)
		}
	} else {
		wf.Status = domain.StatusSuccess
		execution.Status = domain.StatusSuccess
		fmt.Fprintf(logFile, "\n\033[1;32m✔ WORKFLOW SUCCESS\033[0m\n")
		e.hub.BroadcastLog(wf.ID.String(), execution.ID.String(), "\n\033[1;32m✔ WORKFLOW SUCCESS\033[0m")

		// Execute AFTER_SUCCESS hooks
		e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterSuccess, wf.NamespaceID, logFile, depth, execution.User, execution.ID)
	}

	e.execRepo.Update(execution)
	e.wfRepo.Update(wf)
	e.hub.BroadcastStatus(wf.ID.String(), execution.ID.String(), "workflow", string(wf.Status))

	return runErr
}

func (e *WorkflowExecutor) RunHooks(ctx context.Context, hooks []domain.WorkflowHook, hookType domain.HookType, namespaceID uuid.UUID, logFile *os.File, depth int, user *domain.User, executionID uuid.UUID) error {
	for _, hook := range hooks {
		if err := ctx.Err(); err != nil {
			return err
		}
		if hook.HookType != hookType {
			continue
		}

		if logFile != nil {
			fmt.Fprintf(logFile, "\n\033[1;34m↪ TRIGGER HOOK: %s\033[0m\n", hookType)
		}
		if hook.WorkflowID != nil {
			e.hub.BroadcastLog(hook.WorkflowID.String(), executionID.String(), fmt.Sprintf("\033[1;34m↪ Hook: %s (Running in background)\033[0m", hookType))
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
					e.hub.BroadcastLog(h.WorkflowID.String(), executionID.String(), errMsg)
				}
			} else {
				if h.WorkflowID != nil {
					e.hub.BroadcastLog(h.WorkflowID.String(), executionID.String(), fmt.Sprintf("\033[1;32m✔ %s HOOK SUCCESS\033[0m", hookType))
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

		if input.Required && strings.TrimSpace(val) == "" {
			return fmt.Errorf("field %s is required", input.Label)
		}

		if val == "" {
			continue // Allow empty if not required and no default
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
		e.hub.BroadcastLog(workflowID.String(), executionID.String(), errStr)
		return fmt.Errorf("group %q condition error: %w", group.Name, err)
	} else if !shouldRun {
		msg := fmt.Sprintf("\n\033[1;33m⏭ GROUP SKIPPED: %s\033[0m \033[90m(Condition returned false)\033[0m\n", group.Name)
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)
		group.Status = "SKIPPED"
		e.groupRepo.Update(group)
		e.hub.BroadcastStatus(group.ID.String(), executionID.String(), "group", "SKIPPED")
		return nil
	}

	msg := fmt.Sprintf("\n\n\033[1;35m❖ GROUP START: %s\033[0m \033[90m[Parallel: %v]\033[0m\n", group.Name, group.IsParallel)
	fmt.Fprint(logFile, msg)
	e.hub.BroadcastLog(group.WorkflowID.String(), executionID.String(), msg)

	effectiveServerID := defaultServerID
	if group.DefaultServerID != nil {
		effectiveServerID = *group.DefaultServerID
	}

	maxAttempts := 1
	if group.RetryEnabled && group.RetryLimit > 0 {
		maxAttempts = group.RetryLimit + 1
	}

	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		// Check for cancellation before each attempt
		if err := ctx.Err(); err != nil {
			return err
		}

		if attempt > 1 {
			msg := fmt.Sprintf("\n\033[1;33m↻ GROUP RETRY ATTEMPT %d/%d (Delay: %ds): %s\033[0m\n", attempt-1, group.RetryLimit, group.RetryDelay, group.Name)
			fmt.Fprint(logFile, msg)
			e.hub.BroadcastLog(group.WorkflowID.String(), executionID.String(), msg)

			if group.RetryDelay > 0 {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(time.Duration(group.RetryDelay) * time.Second):
				}
			}

			// Reset step statuses for visual clarity in UI
			for i := range group.Steps {
				e.hub.BroadcastStatus(group.Steps[i].ID.String(), executionID.String(), "step", string(domain.StatusPending))
			}
		}

		group.Status = domain.StatusRunning
		e.groupRepo.Update(group)
		e.hub.BroadcastStatus(group.ID.String(), executionID.String(), "group", string(domain.StatusRunning))

		lastErr = e.runGroupAttempt(ctx, group, inputs, variables, groupResults, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs)

		if lastErr == nil {
			group.Status = domain.StatusSuccess
			e.hub.BroadcastStatus(group.ID.String(), executionID.String(), "group", string(domain.StatusSuccess))
			return e.groupRepo.Update(group)
		}

		// Handle cancellation immediately
		if ctx.Err() != nil {
			group.Status = domain.StatusCancelled
			e.groupRepo.Update(group)
			e.hub.BroadcastStatus(group.ID.String(), executionID.String(), "group", string(domain.StatusCancelled))
			msg := fmt.Sprintf("\n\033[1;33m⏹ GROUP CANCELLED: %s\033[0m\n", group.Name)
			fmt.Fprint(logFile, msg)
			e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)
			return lastErr
		}

		if attempt < maxAttempts {
			continue
		}

		// Final failure after all retries
		group.Status = domain.StatusFailed
		e.groupRepo.Update(group)
		e.hub.BroadcastStatus(group.ID.String(), executionID.String(), "group", string(domain.StatusFailed))

		if group.ContinueOnFailure {
			msg := fmt.Sprintf("\n\033[1;33m⚠ GROUP FAILED AFTER %d ATTEMPTS BUT CONTINUING:\033[0m %s (Continue on Failure enabled)\n", attempt, group.Name)
			fmt.Fprint(logFile, msg)
			e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)
			return nil
		}
		return fmt.Errorf("group %q failed after %d attempts: %w", group.Name, attempt, lastErr)
	}

	return nil
}

func (e *WorkflowExecutor) runGroupAttempt(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, effectiveServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID, user *domain.User, workingDirs *sync.Map) error {
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
				return err
			}
		}
	} else {
		for i := range group.Steps {
			// Check for cancellation before each step
			if err := ctx.Err(); err != nil {
				return err
			}

			if err := e.runStep(ctx, &group.Steps[i], inputs, variables, groupResults, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs); err != nil {
				return err
			}
			// Sequential Step Delay: 200ms gap between steps to prevent race conditions
			if i < len(group.Steps)-1 {
				time.Sleep(200 * time.Millisecond)
			}
		}
	}

	// Perform relay copy if configured
	if group.IsCopyEnabled {
		msg := fmt.Sprintf("\033[90m⚙ Relay copy enabled for group %q\033[0m\n", group.Name)
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)

		if group.CopySourcePath != "" && group.CopyTargetPath != "" {
			if err := e.relayCopy(ctx, group, inputs, variables, groupResults, namespaceID, effectiveServerID, logFile, workflowID, executionID, user); err != nil {
				return fmt.Errorf("relay copy failed: %w", err)
			}
		} else {
			msg := "\033[90m⚙ Relay copy skipped: missing paths\033[0m\n"
			fmt.Fprint(logFile, msg)
			e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)
		}
	} else {
		msg := fmt.Sprintf("\033[90m⚙ Relay copy disabled for group %q\033[0m\n", group.Name)
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)
	}

	return nil
}

func (e *WorkflowExecutor) relayCopy(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID, sourceServerID uuid.UUID, logFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, user *domain.User) error {
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
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), msgRef)
	fmt.Fprintf(logFile, "\033[34mStarting relay copy...\033[0m\n")
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), "\033[34mStarting relay copy...\033[0m\n")

	// 1. Create tarball on source server
	tmpTarName := fmt.Sprintf("relay_%s.tar.gz", uuid.New().String())
	sourceDir := filepath.Dir(sourcePath)
	sourceBase := filepath.Base(sourcePath)

	// Use tar -czf to create a compressed archive. Use -C to change directory so the path in tar is relative.
	tarCmd := fmt.Sprintf("tar -czf /tmp/%s -C %s %s", tmpTarName, strconv.Quote(sourceDir), strconv.Quote(sourceBase))
	_, err = e.serverService.ExecuteCommand(ctx, sourceServerID, tarCmd, nil) // Trusted: pass nil user
	if err != nil {
		return fmt.Errorf("failed to create tarball on source: %w", err)
	}
	defer e.serverService.ExecuteCommand(context.Background(), sourceServerID, fmt.Sprintf("rm -f /tmp/%s", tmpTarName), nil) // Trusted: pass nil user

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
	err = e.serverService.UploadFileToServers(ctx, []uuid.UUID{*group.CopyTargetServerID}, localTarPath, "/tmp/"+tmpTarName, nil) // Trusted: pass nil user
	if err != nil {
		return fmt.Errorf("failed to upload tarball to target: %w", err)
	}
	defer e.serverService.ExecuteCommand(context.Background(), *group.CopyTargetServerID, fmt.Sprintf("rm -f /tmp/%s", tmpTarName), nil) // Trusted: pass nil user

	// 4. Extract tarball on target server
	mkdirCmd := fmt.Sprintf("mkdir -p %s", strconv.Quote(targetPath))
	e.serverService.ExecuteCommand(ctx, *group.CopyTargetServerID, mkdirCmd, nil) // Trusted: pass nil user

	extractCmd := fmt.Sprintf("tar -xzf /tmp/%s -C %s", tmpTarName, strconv.Quote(targetPath))
	_, err = e.serverService.ExecuteCommand(ctx, *group.CopyTargetServerID, extractCmd, nil) // Trusted: pass nil user
	if err != nil {
		return fmt.Errorf("failed to extract tarball on target: %w", err)
	}

	successMsg := "\033[1;32m✔ RELAY COPY SUCCESS\033[0m\n"
	fmt.Fprint(logFile, successMsg)
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), successMsg)
	return nil
}

func (e *WorkflowExecutor) runStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, defaultServerID uuid.UUID, mainLogFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID, user *domain.User, workingDirs *sync.Map) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	e.hub.BroadcastStatus(step.ID.String(), executionID.String(), "step", string(domain.StatusRunning))

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

	e.hub.BroadcastLog(step.ID.String(), executionID.String(), msg)
	e.hub.BroadcastLog(step.GroupID.String(), executionID.String(), msg)
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)

	var output string
	var err error

	// Dispatch based on action type
	if step.ActionType == "WORKFLOW" {
		output, err = e.runWorkflowStep(ctx, step, inputs, variables, groupResults, namespaceID, mainLogFile, stepLogFile, workflowID, executionID, user)
	} else {
		// Default: COMMAND action type
		if step.CommandText == "" {
			emptyMsg := "\033[90m(No command to execute)\033[0m\n"
			fmt.Fprint(mainLogFile, emptyMsg)
			fmt.Fprint(stepLogFile, emptyMsg)
			e.hub.BroadcastStatus(step.ID.String(), executionID.String(), "step", string(domain.StatusSuccess))
			return nil
		}

		// 1. Resolve variables using Pongo2
		pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)
		command, renderErr := e.renderTemplate(step.CommandText, pcontext)
		if renderErr != nil {
			errMsg := fmt.Sprintf("\033[1;31m✖ Interpolation error: %v\033[0m\n", renderErr)
			fmt.Fprint(mainLogFile, errMsg)
			fmt.Fprint(stepLogFile, errMsg)
			return fmt.Errorf("interpolation error: %w", renderErr)
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
					command = fmt.Sprintf("cd %s && { %s; }", strconv.Quote(startingDir), command)
				}
			}
			command = fmt.Sprintf("%s; printf '%s' && pwd -P", command, cwdMarker)
		}

		if targetServerID != uuid.Nil {
			var out bytes.Buffer
			mw := io.MultiWriter(
				&wsWriter{hub: e.hub, targetID: step.ID.String(), executionID: executionID.String(), buffer: &out},
				&wsWriter{hub: e.hub, targetID: workflowID.String(), executionID: executionID.String(), buffer: mainLogFile},
				&fileWriter{file: stepLogFile},
			)
			filter := &cwdFilteredWriter{
				underlying: mw,
				marker:     cwdMarker,
			}
			_, err = e.serverService.ExecuteCommand(ctx, targetServerID, command, nil, filter)
			filter.Finalize()
			output = out.String()
			if filter.found {
				newDir := filepath.Clean(strings.TrimSpace(filter.cwdBuffer.String()))
				if newDir != "" && newDir != filepath.Clean(startingDir) {
					workingDirs.Store(targetServerID, newDir)
				}
			}
		} else {
			output, err = e.runLocalStep(ctx, step, command, mainLogFile, stepLogFile, workflowID, executionID, workingDirs)
		}
	}

	if err != nil {
		if ctx.Err() != nil {
			e.hub.BroadcastStatus(step.ID.String(), executionID.String(), "step", string(domain.StatusCancelled))

			stepExec.Status = domain.StatusCancelled
			stepExec.Output = output
			finishedAt := time.Now()
			stepExec.FinishedAt = &finishedAt
			e.execRepo.CreateStepResult(stepExec)
			return err
		}
		e.hub.BroadcastStatus(step.ID.String(), executionID.String(), "step", string(domain.StatusFailed))

		stepExec.Status = domain.StatusFailed
		stepExec.Output = output
		finishedAt := time.Now()
		stepExec.FinishedAt = &finishedAt
		e.execRepo.CreateStepResult(stepExec)
		return err
	}

	e.hub.BroadcastStatus(step.ID.String(), executionID.String(), "step", string(domain.StatusSuccess))

	// Finalize execution step record
	stepExec.Status = domain.StatusSuccess
	stepExec.Output = output
	finishedAt := time.Now()
	stepExec.FinishedAt = &finishedAt
	e.execRepo.CreateStepResult(stepExec)

	return nil
}

// runWorkflowStep handles a step of action_type=WORKFLOW, running a target workflow either
// synchronously (WaitToFinish=true) or asynchronously as a spawned goroutine.
func (e *WorkflowExecutor) runWorkflowStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID, mainLogFile *os.File, stepLogFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, user *domain.User) (string, error) {
	if step.TargetWorkflowID == nil {
		return "", fmt.Errorf("step %q has action_type=WORKFLOW but no target_workflow_id set", step.Name)
	}

	// Interpolate the target workflow inputs
	var rawInputs map[string]string
	if step.TargetWorkflowInputs != "" {
		json.Unmarshal([]byte(step.TargetWorkflowInputs), &rawInputs)
	}

	// Interpolate each input value through the current workflow context
	pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)
	resolvedInputs := make(map[string]string)
	for k, v := range rawInputs {
		rendered, err := e.renderTemplate(v, pcontext)
		if err != nil {
			rendered = v // fallback to raw value on error
		}
		resolvedInputs[k] = rendered
	}

	hookExecID := uuid.New()
	logMsg := fmt.Sprintf("\033[1;34m↪ RUN WORKFLOW: %s\033[0m\n", step.TargetWorkflowID)
	fmt.Fprint(mainLogFile, logMsg)
	fmt.Fprint(stepLogFile, logMsg)
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), logMsg)

	if step.WaitToFinish != nil && !*step.WaitToFinish {
		// Async: spawn the workflow and immediately return success
		go func(targetID uuid.UUID, execID uuid.UUID, in map[string]string) {
			bgCtx := context.Background()
			err := e.RunWithDepth(bgCtx, targetID, execID, in, nil, nil, "STEP", 1, user)
			if err != nil {
				e.hub.BroadcastLog(workflowID.String(), executionID.String(), fmt.Sprintf("\033[1;33m⚠ Async workflow %s failed: %v\033[0m", targetID, err))
			} else {
				e.hub.BroadcastLog(workflowID.String(), executionID.String(), fmt.Sprintf("\033[1;32m✔ Async workflow %s succeeded\033[0m", targetID))
			}
		}(*step.TargetWorkflowID, hookExecID, resolvedInputs)
		asyncMsg := "\033[90m⚡ Workflow spawned asynchronously, continuing...\033[0m\n"
		fmt.Fprint(mainLogFile, asyncMsg)
		fmt.Fprint(stepLogFile, asyncMsg)
		return "async", nil
	}

	// Synchronous: wait for the target workflow to complete
	err := e.RunWithDepth(ctx, *step.TargetWorkflowID, hookExecID, resolvedInputs, nil, nil, "STEP", 1, user)
	if err != nil {
		return "", fmt.Errorf("target workflow %s failed: %w", step.TargetWorkflowID, err)
	}
	successMsg := "\033[1;32m✔ Workflow step completed successfully\033[0m\n"
	fmt.Fprint(mainLogFile, successMsg)
	fmt.Fprint(stepLogFile, successMsg)
	return "success", nil
}

func (e *WorkflowExecutor) runLocalStep(ctx context.Context, step *domain.WorkflowStep, command string, mainLogFile *os.File, stepLogFile *os.File, workflowID uuid.UUID, executionID uuid.UUID, workingDirs *sync.Map) (string, error) {
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
		&wsWriter{hub: e.hub, targetID: step.ID.String(), executionID: executionID.String(), buffer: &out},
		&wsWriter{hub: e.hub, targetID: workflowID.String(), executionID: executionID.String(), buffer: mainLogFile},
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
	hub         *Hub
	targetID    string
	executionID string
	buffer      io.Writer
}

func (w *wsWriter) Write(p []byte) (n int, err error) {
	n, err = w.buffer.Write(p)
	w.hub.BroadcastLog(w.targetID, w.executionID, string(p))
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
