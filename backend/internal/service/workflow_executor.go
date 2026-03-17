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

var (
	// SecurityRegex blocks dangerous shell metacharacters: $, (, ), `, ;, &, |, <, >, *, ^
	SecurityRegex = regexp.MustCompile(`^[\pL0-9_\-\.\ \/\:\[\]\{\}\"\'\,\@\#\%\!\+\=\?]*$`)
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
	// Register custom pongo2 filters
	pongo2.RegisterFilter("json", func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
		b, err := json.Marshal(in.Interface())
		if err != nil {
			return nil, &pongo2.Error{
				Sender:    "filter:json",
				OrigError: err,
			}
		}
		return pongo2.AsSafeValue(string(b)), nil
	})

	pongo2.RegisterFilter("shellquote", func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
		s := in.String()
		// Basic POSIX shell quoting: wrap in single quotes, escape single quotes
		quoted := "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
		return pongo2.AsSafeValue(quoted), nil
	})

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

func (e *WorkflowExecutor) Run(ctx context.Context, workflowID uuid.UUID, execID uuid.UUID, inputs map[string]string, scheduledID *uuid.UUID, pageID *uuid.UUID, triggerSource string, user *domain.User, startGroupID, startStepID, fromExecutionID *uuid.UUID) error {
	// Create a cancellable context for this execution
	execCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	e.activeExecs.Store(execID, cancel)
	defer e.activeExecs.Delete(execID)

	return e.RunWithDepth(execCtx, workflowID, execID, inputs, scheduledID, pageID, triggerSource, 0, user, startGroupID, startStepID, fromExecutionID, false)
}

func (e *WorkflowExecutor) RunTestGroup(transientID uuid.UUID, namespaceID uuid.UUID, workflowID uuid.UUID, defaultServerID *uuid.UUID, group domain.WorkflowGroup, steps []domain.WorkflowStep, inputs map[string]string, user *domain.User) error {
	// 1. Create stream
	e.hub.CreateStream(transientID.String(), nil)
	// For test runs, we delay closing the stream to ensure the frontend has time to catch up
	// and connect. The hub handles long-term cleanup of orphaned streams.
	defer func() {
		go func(id uuid.UUID) {
			time.Sleep(15 * time.Second)
			e.hub.CloseStream(id.String())
		}(transientID)
	}()

	// 2. Setup group structure
	group.Steps = steps
	groupResults := make(map[string]string)

	// 3. Initialize working dirs
	workingDirs := &sync.Map{}
	if homeDir, err := os.UserHomeDir(); err == nil {
		workingDirs.Store(uuid.Nil, homeDir)
	}

	// 4. Default server fallback
	var effDefaultServerID uuid.UUID
	if defaultServerID != nil {
		effDefaultServerID = *defaultServerID
	}

	// 5. Run group with isTest = true
	// Use io.Discard for file logging as we only want WebSocket broadcast
	return e.runGroup(context.Background(), &group, inputs, nil, groupResults, effDefaultServerID, io.Discard, workflowID, transientID, namespaceID, user, workingDirs, nil, nil, nil, true)
}

func (e *WorkflowExecutor) StopExecution(execID uuid.UUID) error {
	if cancelVal, ok := e.activeExecs.Load(execID); ok {
		cancel := cancelVal.(context.CancelFunc)
		cancel()
		return nil
	}
	return fmt.Errorf("execution %s not found or already finished", execID)
}

func (e *WorkflowExecutor) RunWithDepth(ctx context.Context, workflowID uuid.UUID, execID uuid.UUID, inputs map[string]string, scheduledID *uuid.UUID, pageID *uuid.UUID, triggerSource string, depth int, user *domain.User, startGroupID, startStepID, fromExecutionID *uuid.UUID, isTest bool) error {
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

	var execution *domain.WorkflowExecution
	var mainLogPath string

	if !isTest {
		// Setup log directory
		baseDir, _ := os.Getwd()
		execLogDir := filepath.Join(baseDir, "data", "logs", "executions", execID.String())
		if err := os.MkdirAll(execLogDir, 0755); err != nil {
			return fmt.Errorf("failed to create log directory: %w", err)
		}
		mainLogPath = filepath.Join(execLogDir, "workflow.log")

		// Get existing execution record (created by handler to avoid race condition)
		execution, err = e.execRepo.GetByID(execID, nil)
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
			if fromExecutionID != nil {
				execution.ParentExecutionID = fromExecutionID
			}
			e.execRepo.Create(execution)
		} else {
			// Even if record exists, update with trigger info if missing
			execution.PageID = pageID
			execution.TriggerSource = triggerSource
			if scheduledID != nil {
				execution.ScheduledID = scheduledID
			}
			if fromExecutionID != nil {
				execution.ParentExecutionID = fromExecutionID
			}
		}

		// Update with log path
		execution.LogPath = mainLogPath
		e.execRepo.Update(execution)
	} else {
		// Mock execution for test
		inputsJSON, _ := json.Marshal(inputs)
		execution = &domain.WorkflowExecution{
			ID:            execID,
			WorkflowID:    workflowID,
			Status:        domain.StatusRunning,
			Inputs:        string(inputsJSON),
			StartedAt:     time.Now(),
			TriggerSource: "TEST",
			User:          user,
		}
	}

	// Apply Timeout if configured (> 0)
	if wf.TimeoutMinutes > 0 {
		timeoutCtx, cancelTimeout := context.WithTimeout(ctx, time.Duration(wf.TimeoutMinutes)*time.Minute)
		defer cancelTimeout()
		return e.Execute(timeoutCtx, workflowID, execution, depth, startGroupID, startStepID, fromExecutionID, isTest)
	}

	return e.Execute(ctx, workflowID, execution, depth, startGroupID, startStepID, fromExecutionID, isTest)
}

func (e *WorkflowExecutor) Execute(ctx context.Context, workflowID uuid.UUID, execution *domain.WorkflowExecution, depth int, startGroupID, startStepID, fromExecutionID *uuid.UUID, isTest bool) error {
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
	e.hub.CreateStream(execution.ID.String(), execution.PageID)
	defer e.hub.CloseStream(execution.ID.String())

	var logFile io.Writer = io.Discard
	if !isTest && execution.LogPath != "" {
		if f, err := os.OpenFile(execution.LogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			defer f.Close()
			logFile = f
		}
	}

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

	if !isTest {
		wf.Status = domain.StatusRunning
		e.wfRepo.UpdateStatus(wf.ID, domain.StatusRunning)
	}
	e.hub.BroadcastStatus(wf.ID.String(), execution.ID.String(), "workflow", string(domain.StatusRunning))

	// Reset groups and steps to PENDING for new execution visualization
	for i := range wf.Groups {
		if !isTest {
			wf.Groups[i].Status = domain.StatusRunning
			e.groupRepo.UpdateStatus(wf.Groups[i].ID, domain.StatusRunning)
		}
		e.hub.BroadcastStatus(wf.Groups[i].ID.String(), execution.ID.String(), "group", string(domain.StatusRunning))
		for j := range wf.Groups[i].Steps {
			e.hub.BroadcastStatus(wf.Groups[i].Steps[j].ID.String(), execution.ID.String(), "step", string(domain.StatusPending))
		}
	}

	// Get old step working directories for partial reruns
	oldStepDirs := make(map[uuid.UUID]string)
	if !isTest && fromExecutionID != nil {
		oldExec, err := e.execRepo.GetByID(*fromExecutionID, nil)
		if err == nil {
			for _, step := range oldExec.Steps {
				if step.WorkingDir != "" {
					oldStepDirs[step.StepID] = step.WorkingDir
				}
			}
		}
	}

	// Initialize containers for interpolation
	groupResults := make(map[string]string)
	var inputsMap map[string]string
	if execution.Inputs != "" {
		json.Unmarshal([]byte(execution.Inputs), &inputsMap)
	}

	// 0. Execute BEFORE hooks
	if err := e.RunHooks(ctx, wf.Hooks, domain.HookTypeBefore, wf.NamespaceID, logFile, depth, execution.User, execution.ID, fromExecutionID, inputsMap, wf.Variables, groupResults, isTest); err != nil {
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
		isSkipping := startGroupID != nil

		for i := range wf.Groups {
			g := wf.Groups[i]

			// Check if we reached the starting group
			if isSkipping && startGroupID != nil && g.ID == *startGroupID {
				isSkipping = false
				msg := fmt.Sprintf("\033[1;33m▶ RERUN STARTING FROM GROUP: %s\033[0m\n", g.Name)
				fmt.Fprint(logFile, msg)
				e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), msg)
			}

			// Check for cancellation before starting each group
			if err := ctx.Err(); err != nil {
				runErr = err
				goto finalize
			}

			if isSkipping {
				msg := fmt.Sprintf("\033[90m⏭ SKIPPING GROUP (Partial Rerun): %s\033[0m\n", g.Name)
				fmt.Fprint(logFile, msg)
				e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), msg)
				if !isTest {
					wf.Groups[i].Status = "SKIPPED"
					e.groupRepo.UpdateStatus(wf.Groups[i].ID, "SKIPPED")
				}
				e.hub.BroadcastStatus(wf.Groups[i].ID.String(), execution.ID.String(), "group", "SKIPPED")

				// Simulate directory updates for skipped steps
				for _, step := range g.Steps {
					if dir, ok := oldStepDirs[step.ID]; ok {
						effID := step.ServerID
						if effID == uuid.Nil {
							if g.DefaultServerID != nil {
								effID = *g.DefaultServerID
							} else if wf.DefaultServerID != nil {
								effID = *wf.DefaultServerID
							}
						}
						workingDirs.Store(effID, dir)
					}
				}

				continue
			}

			// Default server ID fallback:
			// 1. Group default server
			// 2. Workflow default server
			var groupDefaultServerID uuid.UUID
			if g.DefaultServerID != nil {
				groupDefaultServerID = *g.DefaultServerID
			} else if wf.DefaultServerID != nil {
				groupDefaultServerID = *wf.DefaultServerID
			}

			var groupStartStepID *uuid.UUID
			if startStepID != nil && !isSkipping && g.ID == *startGroupID {
				groupStartStepID = startStepID
			}

			err := e.runGroup(ctx, &g, inputsMap, wf.Variables, groupResults, groupDefaultServerID, logFile, workflowID, execution.ID, wf.NamespaceID, execution.User, workingDirs, groupStartStepID, fromExecutionID, oldStepDirs, isTest)
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

finalize:
	finalStatus := domain.StatusSuccess
	if runErr != nil {
		if ctx.Err() == context.Canceled {
			finalStatus = domain.StatusCancelled
			msg := fmt.Sprintf("\n\033[1;33m⏹ WORKFLOW CANCELLED: %v\033[0m\n", runErr)
			fmt.Fprint(logFile, msg)
			e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), "\n\033[1;33m⏹ WORKFLOW CANCELLED\033[0m")
		} else if ctx.Err() == context.DeadlineExceeded {
			finalStatus = domain.StatusFailed
			msg := fmt.Sprintf("\n\033[1;31m✖ WORKFLOW TIMED OUT (Exceeded %d minutes)\033[0m\n", wf.TimeoutMinutes)
			fmt.Fprint(logFile, msg)
			e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), fmt.Sprintf("\n\033[1;31m✖ WORKFLOW TIMED OUT (Exceeded %d minutes)\033[0m", wf.TimeoutMinutes))
		} else {
			finalStatus = domain.StatusFailed
			msg := fmt.Sprintf("\n\033[1;31m✖ WORKFLOW FAILED: %v\033[0m\n", runErr)
			fmt.Fprint(logFile, msg)
			e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), fmt.Sprintf("\n\033[1;31m✖ WORKFLOW FAILED: %v\033[0m", runErr))
		}
	} else {
		finalStatus = domain.StatusSuccess
		msg := "\n\033[1;32m✔ WORKFLOW SUCCESS\033[0m\n"
		fmt.Fprint(logFile, msg)
		e.hub.BroadcastLog(workflowID.String(), execution.ID.String(), "\n\033[1;32m✔ WORKFLOW SUCCESS\033[0m")
	}

	if !isTest {
		finishedAt := time.Now()
		execution.Status = finalStatus
		execution.FinishedAt = &finishedAt
		e.execRepo.Update(execution)

		wf.Status = finalStatus
		e.wfRepo.UpdateStatus(wf.ID, finalStatus)
	}

	e.hub.BroadcastStatus(wf.ID.String(), execution.ID.String(), "workflow", string(finalStatus))

	// Post-execution cleanup
	if wf.CleanupFiles && len(cleanupPaths) > 0 && len(serverIDs) > 0 {
		fmt.Fprintf(logFile, "\n\033[1;34m🗑 CLEANUP OPERATION\033[0m\n")
		for _, path := range cleanupPaths {
			cmdStr := fmt.Sprintf("rm -f %s", path)
			for _, serverID := range serverIDs {
				_, err := e.serverService.ExecuteCommand(context.Background(), serverID, cmdStr, nil) // Trusted: pass nil user
				if err != nil {
					fmt.Fprintf(logFile, "\033[1;31m✖ Failed: %s (%v)\033[0m\n", path, err)
				}
			}
			fmt.Fprintf(logFile, "\033[34m✔ Cleaned: %s\033[0m\n", path)
		}
	}

	// 3. Run hooks based on result
	if finalStatus == domain.StatusSuccess {
		e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterSuccess, wf.NamespaceID, logFile, depth, execution.User, execution.ID, fromExecutionID, inputsMap, wf.Variables, groupResults, isTest)
	} else if finalStatus == domain.StatusFailed {
		e.RunHooks(ctx, wf.Hooks, domain.HookTypeAfterFailed, wf.NamespaceID, logFile, depth, execution.User, execution.ID, fromExecutionID, inputsMap, wf.Variables, groupResults, isTest)
	}

	return runErr
}

func (e *WorkflowExecutor) RunHooks(ctx context.Context, hooks []domain.WorkflowHook, hookType domain.HookType, namespaceID uuid.UUID, logFile io.Writer, depth int, user *domain.User, executionID uuid.UUID, fromExecutionID *uuid.UUID, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, isTest bool) error {
	relevantHooks := make([]domain.WorkflowHook, 0)
	for _, h := range hooks {
		if h.HookType == hookType {
			relevantHooks = append(relevantHooks, h)
		}
	}

	if len(relevantHooks) == 0 {
		return nil
	}

	fmt.Fprintf(logFile, "\033[1;34m⚓ RUNNING %s HOOKS (%d)\033[0m\n", hookType, len(relevantHooks))

	for _, hook := range relevantHooks {
		// Interpolate hook inputs
		hookInputs := make(map[string]string)
		if hook.Inputs != "" {
			var rawInputs map[string]string
			if err := json.Unmarshal([]byte(hook.Inputs), &rawInputs); err == nil {
				pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)
				for k, v := range rawInputs {
					rendered, _ := e.renderTemplate(v, pcontext)
					hookInputs[k] = rendered
				}
			}
		}

		fmt.Fprintf(logFile, "\033[34m→ Hook Workflow: %s\033[0m\n", hook.TargetWorkflowID)
		hookExecID := uuid.New()
		err := e.RunWithDepth(ctx, hook.TargetWorkflowID, hookExecID, hookInputs, nil, nil, "HOOK", depth+1, user, nil, nil, fromExecutionID, isTest)
		if err != nil {
			fmt.Fprintf(logFile, "\033[1;31m✖ Hook failed: %v\033[0m\n", err)
			return err
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
		case "multi-select":
			// Try JSON first, fallback to comma separated
			var selected []string
			decoder := json.NewDecoder(strings.NewReader(val))
			decoder.UseNumber()
			if err := decoder.Decode(&selected); err != nil {
				// Fallback
				parts := strings.Split(val, ",")
				for _, p := range parts {
					selected = append(selected, strings.TrimSpace(p))
				}
			}

			options := strings.Split(input.DefaultValue, ",")
			trimmedOptions := make([]string, 0, len(options))
			for _, opt := range options {
				trimmedOptions = append(trimmedOptions, strings.TrimSpace(opt))
			}

			for _, s := range selected {
				if s == "" {
					continue
				}
				valid := false
				for _, opt := range trimmedOptions {
					if opt == s {
						valid = true
						break
					}
				}
				if !valid {
					return fmt.Errorf("field %s has invalid option: %s", input.Label, s)
				}
			}
		case "multi-input":
			var rows []map[string]interface{}
			decoder := json.NewDecoder(strings.NewReader(val))
			decoder.UseNumber()
			if err := decoder.Decode(&rows); err != nil {
				// Fallback for simple comma-separated (non-multi-key)
				values := strings.Split(val, ",")
				for _, v := range values {
					v = strings.TrimSpace(v)
					if v == "" {
						continue
					}
					if !SecurityRegex.MatchString(v) {
						return fmt.Errorf("field %s contains invalid characters in value '%s'", input.Label, v)
					}
				}
			} else {
				for _, row := range rows {
					for k, v := range row {
						strV := fmt.Sprintf("%v", v)
						if strV == "" {
							continue
						}
						if !SecurityRegex.MatchString(strV) {
							return fmt.Errorf("field %s contains invalid characters in field '%s': '%s'", input.Label, k, strV)
						}
					}
				}
			}
		default: // "input"
			if !SecurityRegex.MatchString(val) {
				return fmt.Errorf("field %s contains invalid characters", input.Label)
			}
		}
	}
	return nil
}

func (e *WorkflowExecutor) evaluateCondition(condition string, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID, user *domain.User) (bool, error) {
	if strings.TrimSpace(condition) == "" {
		return true, nil // Empty condition = always run
	}

	pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)

	// Wrap the condition in an if block to evaluate it as a boolean expression
	// We use a unique marker to detect if the block was executed and the result
	tmpl := fmt.Sprintf("{%% if %s %%}TRUE{%% else %%}FALSE{%% endif %%}", condition)

	rendered, err := e.renderTemplate(tmpl, pcontext)
	if err != nil {
		return false, fmt.Errorf("failed to evaluate condition logic: %w", err)
	}

	return strings.TrimSpace(rendered) == "TRUE", nil
}

func (e *WorkflowExecutor) runGroup(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, defaultServerID uuid.UUID, logFile io.Writer, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID, user *domain.User, workingDirs *sync.Map, startStepID, fromExecutionID *uuid.UUID, oldStepDirs map[uuid.UUID]string, isTest bool) error {
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
		e.groupRepo.UpdateStatus(group.ID, "SKIPPED")
		e.hub.BroadcastStatus(group.ID.String(), executionID.String(), "group", "SKIPPED")
		return nil
	}

	groupHeader := fmt.Sprintf("\n\n\033[1;35m❖ GROUP START: %s\033[0m \033[90m[Parallel: %v]\033[0m\n", group.Name, group.IsParallel)
	fmt.Fprint(logFile, groupHeader)
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), groupHeader)

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
			retryMsg := fmt.Sprintf("\n\033[1;33m↻ RETRYING GROUP %q (Attempt %d/%d) in %ds...\033[0m\n", group.Name, attempt, maxAttempts, group.RetryDelay)
			fmt.Fprint(logFile, retryMsg)
			e.hub.BroadcastLog(workflowID.String(), executionID.String(), retryMsg)
			time.Sleep(time.Duration(group.RetryDelay) * time.Second)
		}

		lastErr = e.runGroupAttempt(ctx, group, inputs, variables, groupResults, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs, startStepID, fromExecutionID, oldStepDirs, isTest)
		if lastErr == nil {
			if !isTest {
				group.Status = domain.StatusSuccess
				e.groupRepo.UpdateStatus(group.ID, domain.StatusSuccess)
			}
			e.hub.BroadcastStatus(group.ID.String(), executionID.String(), "group", string(domain.StatusSuccess))
			return nil
		}

		if ctx.Err() != nil {
			if !isTest {
				group.Status = domain.StatusCancelled
				e.groupRepo.UpdateStatus(group.ID, domain.StatusCancelled)
			}
			e.hub.BroadcastStatus(group.ID.String(), executionID.String(), "group", string(domain.StatusCancelled))
			return lastErr
		}

		if attempt < maxAttempts {
			continue
		}

		// Final failure after all retries
		if !isTest {
			group.Status = domain.StatusFailed
			e.groupRepo.UpdateStatus(group.ID, domain.StatusFailed)
		}
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

func (e *WorkflowExecutor) runGroupAttempt(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, effectiveServerID uuid.UUID, logFile io.Writer, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID, user *domain.User, workingDirs *sync.Map, startStepID, fromExecutionID *uuid.UUID, oldStepDirs map[uuid.UUID]string, isTest bool) error {
	if group.IsParallel {
		// Parralel groups don't support partial reruns from steps as easily, usually it's better to rerun the whole group
		// For simplicity, if a startStepID is provided in a parallel group, we just run all steps (or we could filter, but let's stick to simple logic)
		var wg sync.WaitGroup
		errs := make(chan error, len(group.Steps))

		for i := range group.Steps {
			wg.Add(1)
			go func(step *domain.WorkflowStep) {
				defer wg.Done()
				if err := e.runStep(ctx, step, inputs, variables, groupResults, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs, fromExecutionID, isTest); err != nil {
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
		isSkippingStep := startStepID != nil
		for i := range group.Steps {
			step := &group.Steps[i]

			// Check if we reached the starting step
			if isSkippingStep && startStepID != nil && step.ID == *startStepID {
				isSkippingStep = false
				msg := fmt.Sprintf("\033[1;33m▶ RERUN STARTING FROM STEP: %s\033[0m\n", step.Name)
				fmt.Fprint(logFile, msg)
				e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)
			}

			// Check for cancellation before each step
			if err := ctx.Err(); err != nil {
				return err
			}

			if isSkippingStep {
				msg := fmt.Sprintf("\033[90m⏭ SKIPPING STEP (Partial Rerun): %s\033[0m\n", step.Name)
				fmt.Fprint(logFile, msg)
				e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)
				e.hub.BroadcastStatus(step.ID.String(), executionID.String(), "step", "SKIPPED")

				// Update working directory state from skipped step
				if dir, ok := oldStepDirs[step.ID]; ok {
					targetServerID := step.ServerID
					if targetServerID == uuid.Nil {
						targetServerID = effectiveServerID
					}
					workingDirs.Store(targetServerID, dir)
				}

				continue
			}

			if err := e.runStep(ctx, step, inputs, variables, groupResults, effectiveServerID, logFile, workflowID, executionID, namespaceID, user, workingDirs, fromExecutionID, isTest); err != nil {
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
			if err := e.relayCopy(ctx, group, inputs, variables, groupResults, namespaceID, effectiveServerID, logFile, workflowID, executionID, user, isTest); err != nil {
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

func (e *WorkflowExecutor) relayCopy(ctx context.Context, group *domain.WorkflowGroup, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID, sourceServerID uuid.UUID, logFile io.Writer, workflowID uuid.UUID, executionID uuid.UUID, user *domain.User, isTest bool) error {
	// 1. Interpolate paths
	pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)
	sourcePath, err := e.renderTemplate(group.CopySourcePath, pcontext)
	if err != nil {
		return fmt.Errorf("failed to interpolate source path: %w", err)
	}
	targetPath, err := e.renderTemplate(group.CopyTargetPath, pcontext)
	if err != nil {
		return fmt.Errorf("failed to interpolate target path: %w", err)
	}

	msg := fmt.Sprintf("\033[34m➡ Relay copy: %s:%s -> %s:%s\033[0m\n", sourceServerID, sourcePath, group.CopyTargetServerID, targetPath)
	fmt.Fprint(logFile, msg)
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)

	// 2. Local temporary path
	tmpTarName := fmt.Sprintf("relay_%s.tar.gz", executionID.String())
	localTmpDir := filepath.Join("data", "tmp", "relay")
	os.MkdirAll(localTmpDir, 0755)
	localTarPath := filepath.Join(localTmpDir, tmpTarName)
	defer os.Remove(localTarPath) // Clean up local tarball

	// 3. Create tarball on source server and download to backend
	// Use tar -czf - -C <source_dir> . to create a tarball of the directory content
	// and stream it to stdout, then capture that stdout to a local file.
	// This handles both files and directories correctly.
	f, err := os.Create(localTarPath)
	if err != nil {
		return fmt.Errorf("failed to create local file: %w", err)
	}
	defer f.Close()

	tarCmd := fmt.Sprintf("tar -czf - -C %s %s", strconv.Quote(filepath.Dir(sourcePath)), strconv.Quote(filepath.Base(sourcePath)))
	_, err = e.serverService.ExecuteCommand(ctx, sourceServerID, tarCmd, nil, f)
	if err != nil {
		return fmt.Errorf("failed to create and download tarball from source: %w", err)
	}
	f.Close() // Ensure flushed

	// 4. Upload tarball to target server
	remoteTmpTarPath := "/tmp/" + tmpTarName
	err = e.serverService.UploadFileToServers(ctx, []uuid.UUID{*group.CopyTargetServerID}, localTarPath, remoteTmpTarPath, nil) // Trusted: pass nil user
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

func (e *WorkflowExecutor) runStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, defaultServerID uuid.UUID, mainLogFile io.Writer, workflowID uuid.UUID, executionID uuid.UUID, namespaceID uuid.UUID, user *domain.User, workingDirs *sync.Map, fromExecutionID *uuid.UUID, isTest bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	e.hub.BroadcastStatus(step.ID.String(), executionID.String(), "step", string(domain.StatusRunning))

	var stepExec *domain.WorkflowExecutionStep
	var stepLogFile io.Writer = io.Discard

	if !isTest {
		// Create execution step record
		stepExec = &domain.WorkflowExecutionStep{
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
		if f, err := os.OpenFile(stepLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644); err == nil {
			defer f.Close()
			stepLogFile = f
		}
	}

	msg := fmt.Sprintf("\033[1;36m>> STEP: %s\033[0m\n", step.Name)
	fmt.Fprint(mainLogFile, msg)
	fmt.Fprint(stepLogFile, msg)

	// Broadcast to the master log buffer ONLY, to prevent duplicating entries under the same execution ID
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), msg)

	var output string
	var err error

	// Dispatch based on action type
	if step.ActionType == "WORKFLOW" {
		output, err = e.runWorkflowStep(ctx, step, inputs, variables, groupResults, namespaceID, mainLogFile, stepLogFile, workflowID, executionID, user, fromExecutionID, isTest)
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
			outWriter := io.Writer(&out) // capture output without broadcasting
			mw := io.MultiWriter(
				&wsWriter{hub: e.hub, targetID: workflowID.String(), executionID: executionID.String(), buffer: mainLogFile},
				stepLogFile,
				outWriter,
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
				if newDir != "" {
					workingDirs.Store(targetServerID, newDir)
					if !isTest && stepExec != nil {
						stepExec.WorkingDir = newDir // Persist for reruns
					}
				}
			}
		} else {
			var localNewDir string
			output, localNewDir, err = e.runLocalStep(ctx, step, command, mainLogFile, stepLogFile, workflowID, executionID, workingDirs, isTest)
			if localNewDir != "" && !isTest && stepExec != nil {
				stepExec.WorkingDir = localNewDir
			}
		}
	}

	finalStatus := domain.StatusSuccess
	if err != nil {
		if ctx.Err() != nil {
			finalStatus = domain.StatusCancelled
		} else {
			finalStatus = domain.StatusFailed
		}
	}

	e.hub.BroadcastStatus(step.ID.String(), executionID.String(), "step", string(finalStatus))

	if !isTest && stepExec != nil {
		stepExec.Status = finalStatus
		stepExec.Output = output
		finishedAt := time.Now()
		stepExec.FinishedAt = &finishedAt
		e.execRepo.CreateStepResult(stepExec)
	}

	return err
}

// runWorkflowStep handles a step of action_type=WORKFLOW, running a target workflow either
// synchronously (WaitToFinish=true) or asynchronously as a spawned goroutine.
func (e *WorkflowExecutor) runWorkflowStep(ctx context.Context, step *domain.WorkflowStep, inputs map[string]string, variables []domain.WorkflowVariable, groupResults map[string]string, namespaceID uuid.UUID, mainLogFile io.Writer, stepLogFile io.Writer, workflowID uuid.UUID, executionID uuid.UUID, user *domain.User, fromExecutionID *uuid.UUID, isTest bool) (string, error) {
	if step.TargetWorkflowID == nil {
		return "", fmt.Errorf("step %q has action_type=WORKFLOW but no target_workflow_id set", step.Name)
	}

	// Interpolate the target workflow inputs
	var rawInputs map[string]interface{}
	if step.TargetWorkflowInputs != "" {
		if err := json.Unmarshal([]byte(step.TargetWorkflowInputs), &rawInputs); err != nil {
			fmt.Fprintf(mainLogFile, "\033[1;31m✖ Failed to unmarshal TargetWorkflowInputs: %v\033[0m\n", err)
		}
	}

	// NEW: Fetch target workflow to get its default inputs
	targetWf, err := e.wfRepo.GetByID(*step.TargetWorkflowID, nil)
	if err != nil {
		fmt.Fprintf(mainLogFile, "\033[1;31m✖ Failed to fetch target workflow %s for defaults: %v\033[0m\n", step.TargetWorkflowID, err)
	}

	// Interpolate each input value through the current workflow context
	pcontext := e.getInterpolationContext(inputs, variables, groupResults, namespaceID, user)
	resolvedInputs := make(map[string]string)

	// 1. First, populate with target workflow default values
	if targetWf != nil {
		for _, in := range targetWf.Inputs {
			resolvedInputs[in.Key] = in.DefaultValue
		}
	}

	// 2. Then, apply overrides from step inputs
	for k, vRaw := range rawInputs {
		v := ""
		if s, ok := vRaw.(string); ok {
			v = s
		} else {
			// If it's already an object/array, stringify it so the Foreach/Render logic can handle it
			b, _ := json.Marshal(vRaw)
			v = string(b)
		}
		isForeach := false
		// New JSON-based Foreach logic
		var foreachData struct {
			Type     string      `json:"_type"`
			Source   string      `json:"source"`
			Template interface{} `json:"template"`
		}
		trimmedV := strings.TrimSpace(v)
		if strings.HasPrefix(trimmedV, "{") {
			unmarshalErr := json.Unmarshal([]byte(v), &foreachData)
			if unmarshalErr == nil && foreachData.Type == "foreach" {
				isForeach = true
			} else {
				limit := 15
				if len(trimmedV) < limit {
					limit = len(trimmedV)
				}
			}
		}

		if isForeach {
			// 1. Render source variable to get the array
			// If the source is a simple template like {{...}}, wrap it in |json filter to ensure valid JSON representation of maps/slices
			renderSource := foreachData.Source
			if strings.HasPrefix(strings.TrimSpace(renderSource), "{{") && strings.HasSuffix(strings.TrimSpace(renderSource), "}}") && !strings.Contains(renderSource, "|json") {
				inner := strings.TrimSuffix(strings.TrimPrefix(strings.TrimSpace(renderSource), "{{"), "}}")
				renderSource = fmt.Sprintf("{{ %s | json }}", strings.TrimSpace(inner))
			}

			sourceJson, err := e.renderTemplate(renderSource, pcontext)
			if err != nil {
				fmt.Fprintf(mainLogFile, "\033[1;31m✖ Failed to render source [%s] with template [%s]: %v\033[0m\n", k, renderSource, err)
				resolvedInputs[k] = "[]"
				continue
			}

			// 2. Parse sourceJson as array or single item (robustly)
			var items []interface{}
			var parseJsonItems func(string) []interface{}
			parseJsonItems = func(js string) []interface{} {
				js = strings.TrimSpace(js)
				if js == "" {
					return nil
				}
				// Try straight array unmarshal
				var list []interface{}
				if err := json.Unmarshal([]byte(js), &list); err == nil {
					return list
				}
				// Try as a single value (could be a double-encoded JSON string)
				var single interface{}
				if err := json.Unmarshal([]byte(js), &single); err == nil {
					if s, ok := single.(string); ok {
						// If the string itself is a JSON array/object, recurse
						trimmedS := strings.TrimSpace(s)
						if strings.HasPrefix(trimmedS, "[") || strings.HasPrefix(trimmedS, "{") {
							return parseJsonItems(s)
						}
						// Comma separated fallback
						if strings.Contains(s, ",") {
							parts := strings.Split(s, ",")
							var res []interface{}
							for _, p := range parts {
								res = append(res, strings.TrimSpace(p))
							}
							return res
						}
						return []interface{}{s}
					}
					return []interface{}{single}
				}
				// Final raw fallback for non-JSON strings
				if strings.Contains(js, ",") {
					parts := strings.Split(js, ",")
					var res []interface{}
					for _, p := range parts {
						res = append(res, strings.TrimSpace(p))
					}
					return res
				}
				return []interface{}{js}
			}

			items = parseJsonItems(sourceJson)

			// 3. Render template for each item
			var results []interface{}
			for i, item := range items {
				// Create sub-context
				subContext := make(pongo2.Context)
				for pk, pv := range pcontext {
					subContext[pk] = pv
				}
				subContext["item"] = item

				// Determine template string based on type (string for multi-select, map for multi-input)
				switch t := foreachData.Template.(type) {
				case string:
					rendered, err := e.renderTemplate(t, subContext)
					if err != nil {
						fmt.Fprintf(mainLogFile, "\033[1;31m✖ Failed to render template for input key [%s], item index [%d]: %v\033[0m\n", k, i, err)
						results = append(results, item) // Fallback to original item on error
					} else if strings.TrimSpace(rendered) == "" {
						results = append(results, item)
					} else {
						results = append(results, strings.TrimSpace(rendered))
					}
				case map[string]interface{}:
					// For multi-input, we iterate over keys and render each
					row := make(map[string]interface{})
					for tk, tv := range t {
						if tvStr, ok := tv.(string); ok {
							rendered, err := e.renderTemplate(tvStr, subContext)
							if err != nil {
								fmt.Fprintf(mainLogFile, "\033[1;31m✖ Failed to render template for row key [%s], item [%d]: %v\033[0m\n", tk, i, err)
								row[tk] = tvStr
							} else {
								row[tk] = strings.TrimSpace(rendered)
							}
						} else {
							row[tk] = tv
						}
					}
					results = append(results, row)
				default:
					results = append(results, item)
				}
			}
			finalJson, _ := json.Marshal(results)
			resolvedInputs[k] = string(finalJson)
		} else {
			rendered, err := e.renderTemplate(v, pcontext)
			if err != nil {
				fmt.Fprintf(mainLogFile, "\033[1;31m✖ Failed to render input [%s]: %v\033[0m\n", k, err)
				rendered = v // fallback to raw value on error
			}
			resolvedInputs[k] = rendered
		}
	}

	logMsg := fmt.Sprintf("\033[1;34m↪ RUN WORKFLOW: %s\033[0m\n", step.TargetWorkflowID)
	fmt.Fprint(mainLogFile, logMsg)
	fmt.Fprint(stepLogFile, logMsg)
	e.hub.BroadcastLog(workflowID.String(), executionID.String(), logMsg)

	if step.WaitToFinish != nil && !*step.WaitToFinish {
		// Async: spawn the workflow and immediately return success
		go func(targetID uuid.UUID, in map[string]string) {
			bgCtx := context.Background()
			hookExecID := uuid.New()
			err := e.RunWithDepth(bgCtx, targetID, hookExecID, in, nil, nil, "STEP", 1, user, nil, nil, &executionID, isTest)
			if err != nil {
				e.hub.BroadcastLog(workflowID.String(), executionID.String(), fmt.Sprintf("\033[1;33m⚠ Async workflow %s failed: %v\033[0m", targetID, err))
			} else {
				e.hub.BroadcastLog(workflowID.String(), executionID.String(), fmt.Sprintf("\033[1;32m✔ Async workflow %s succeeded\033[0m", targetID))
			}
		}(*step.TargetWorkflowID, resolvedInputs)
		asyncMsg := "\033[90m⚡ Workflow spawned asynchronously, continuing...\033[0m\n"
		fmt.Fprint(mainLogFile, asyncMsg)
		fmt.Fprint(stepLogFile, asyncMsg)
		return "async", nil
	}

	hookExecID := uuid.New()
	err = e.RunWithDepth(ctx, *step.TargetWorkflowID, hookExecID, resolvedInputs, nil, nil, "STEP", 1, user, nil, nil, &executionID, isTest)
	if err != nil {
		return "", fmt.Errorf("target workflow %s failed: %w", step.TargetWorkflowID, err)
	}
	successMsg := "\033[1;32m✔ Workflow step completed successfully\033[0m\n"
	fmt.Fprint(mainLogFile, successMsg)
	fmt.Fprint(stepLogFile, successMsg)
	return "success", nil
}

func (e *WorkflowExecutor) runLocalStep(ctx context.Context, step *domain.WorkflowStep, command string, mainLogFile io.Writer, stepLogFile io.Writer, workflowID uuid.UUID, executionID uuid.UUID, workingDirs *sync.Map, isTest bool) (string, string, error) {
	var out bytes.Buffer

	// Retrieve current working directory for local server
	var currentDir string
	if val, ok := workingDirs.Load(uuid.Nil); ok {
		currentDir = val.(string)
	}

	// Persist CWD for local execution
	cwdMarker := "::CWD::"
	if currentDir != "" {
		command = fmt.Sprintf("cd %s && { %s; }", strconv.Quote(currentDir), command)
	}
	command = fmt.Sprintf("%s; printf '%s' && pwd -P", command, cwdMarker)

	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	// Don't set cmd.Dir because we handle it in the command string for consistency with remote

	mw := io.MultiWriter(
		&wsWriter{hub: e.hub, targetID: workflowID.String(), executionID: executionID.String(), buffer: mainLogFile},
		stepLogFile,
		&out,
	)

	// Filter out the CWD marker and capture the directory
	filter := &cwdFilteredWriter{
		underlying: mw,
		marker:     cwdMarker,
	}
	cmd.Stdout = filter
	cmd.Stderr = filter

	err := cmd.Run()
	filter.Finalize()
	output := out.String()

	if filter.found {
		newDir := filepath.Clean(strings.TrimSpace(filter.cwdBuffer.String()))
		if newDir != "" {
			workingDirs.Store(uuid.Nil, newDir)
			currentDir = newDir
		}
	}

	return output, currentDir, err
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

	// 1. Global Variables: global.key
	global := make(map[string]string)
	if e.globalVarRepo != nil {
		scope := domain.PermissionScope{IsGlobal: true}
		gvs, _ := e.globalVarRepo.List(namespaceID, &scope)
		for _, v := range gvs {
			if v.Value == "" || SecurityRegex.MatchString(v.Value) {
				global[v.Key] = v.Value
			}
		}
	}
	ctx["global"] = global

	// 2. Variables: variable.key
	vars := make(map[string]string)
	for _, v := range variables {
		if v.Value == "" || SecurityRegex.MatchString(v.Value) {
			vars[v.Key] = v.Value
		}
	}
	ctx["variable"] = vars

	// 3. Inputs: input.key
	in := make(map[string]interface{})
	for k, v := range inputs {
		if v == "" {
			in[k] = v
			continue
		}

		// Only try to parse as JSON for multi-select and multi-input (arrays or objects)
		trimmed := strings.TrimSpace(v)
		if strings.HasPrefix(trimmed, "[") || strings.HasPrefix(trimmed, "{") {
			var jsonVal interface{}
			decoder := json.NewDecoder(strings.NewReader(v))
			decoder.UseNumber()
			if err := decoder.Decode(&jsonVal); err == nil {
				in[k] = jsonVal
				continue
			}
		}

		if SecurityRegex.MatchString(v) {
			in[k] = v
		}
	}
	ctx["input"] = in

	// 4. Step/Group Status: step.key.status
	steps := make(map[string]interface{})
	for k, v := range groupResults {
		if v == "" || SecurityRegex.MatchString(v) {
			steps[k] = map[string]string{"status": v}
		}
	}
	ctx["step"] = steps

	return ctx
}
