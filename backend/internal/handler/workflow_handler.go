package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/lib/utils"
	"github.com/user/csm-backend/internal/service"
)

type WorkflowHandler struct {
	service       *service.WorkflowService
	executor      *service.WorkflowExecutor
	serverService *service.ServerService
	auditLog      *service.AuditLogService
}

func NewWorkflowHandler(s *service.WorkflowService, e *service.WorkflowExecutor, ss *service.ServerService, al *service.AuditLogService) *WorkflowHandler {
	return &WorkflowHandler{
		service:       s,
		executor:      e,
		serverService: ss,
		auditLog:      al,
	}
}

func (h *WorkflowHandler) ListWorkflows(c *gin.Context) {
	nsIDStr := c.Param("ns_id")
	nsID, err := uuid.Parse(nsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	limit := 20
	offset := 0
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}
	searchTerm := c.Query("search")
	var tagIDs []uuid.UUID
	for _, idStr := range c.QueryArray("tag_ids") {
		if id, err := uuid.Parse(idStr); err == nil {
			tagIDs = append(tagIDs, id)
		}
	}

	var isTemplate *bool
	if t := c.Query("is_template"); t != "" {
		val := t == "true"
		isTemplate = &val
	}

	var isPublic *bool
	if ip := c.Query("is_public"); ip != "" {
		if ip == "all" {
			isPublic = nil
		} else {
			val := ip == "true"
			isPublic = &val
		}
	} else {
		// Default to public only as requested
		defaultPublic := true
		isPublic = &defaultPublic
	}

	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)

	var createdBy *uuid.UUID
	if cb := c.Query("created_by"); cb != "" {
		if id, err := uuid.Parse(cb); err == nil {
			createdBy = &id
		}
	}

	wfs, total, err := h.service.ListWorkflowsPaginated(nsID, limit, offset, searchTerm, tagIDs, isTemplate, isPublic, createdBy, user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":  wfs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *WorkflowHandler) CreateWorkflow(c *gin.Context) {
	nsIDStr := c.Param("ns_id")
	nsID, err := uuid.Parse(nsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	var wf domain.Workflow
	if err := c.ShouldBindJSON(&wf); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wf.NamespaceID = nsID

	authUser, _ := c.Get("user")
	userObj := authUser.(*domain.User)
	nsIDStr = nsID.String()
	if !domain.HasPermission(userObj, "workflows", "WRITE", &nsIDStr, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to create workflow in this namespace"})
		return
	}

	if err := h.service.CreateWorkflow(&wf, userObj); err != nil {
		h.auditLog.LogAction(c, "CREATE", "WORKFLOW", wf.ID.String(), map[string]string{"error": err.Error(), "name": wf.Name}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resID := wf.ID.String()
	h.auditLog.LogAction(c, "CREATE", "WORKFLOW", resID, map[string]string{"name": wf.Name}, "SUCCESS")
	c.JSON(http.StatusCreated, wf)
}

func (h *WorkflowHandler) GetWorkflow(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)

	wf, err := h.service.GetWorkflow(id, user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}
	c.JSON(http.StatusOK, wf)
}

func (h *WorkflowHandler) UpdateWorkflow(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var wf domain.Workflow
	if err := c.ShouldBindJSON(&wf); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wf.ID = id

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch existing to get NamespaceID and calculate diff
	existing, err := h.service.GetWorkflow(id, user)
	if err == nil {
		c.Set("namespace_id", existing.NamespaceID)
	}

	diff := utils.CalculateDiff(existing, &wf)

	if err := h.service.UpdateWorkflow(&wf, user); err != nil {
		meta := diff
		if meta == nil {
			meta = make(map[string]interface{})
		}
		meta["error"] = err.Error()
		h.auditLog.LogAction(c, "UPDATE", "WORKFLOW", id.String(), meta, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditLog.LogAction(c, "UPDATE", "WORKFLOW", id.String(), diff, "SUCCESS")
	c.JSON(http.StatusOK, wf)
}

func (h *WorkflowHandler) DeleteWorkflow(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch existing to get NamespaceID and Name for audit log
	existing, err := h.service.GetWorkflow(id, user)
	var metadata map[string]string
	if err == nil {
		c.Set("namespace_id", existing.NamespaceID)
		metadata = map[string]string{"name": existing.Name}
	}

	if err := h.service.DeleteWorkflow(id, user); err != nil {
		if metadata == nil {
			metadata = make(map[string]string)
		}
		metadata["error"] = err.Error()
		h.auditLog.LogAction(c, "DELETE", "WORKFLOW", id.String(), metadata, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.auditLog.LogAction(c, "DELETE", "WORKFLOW", id.String(), metadata, "SUCCESS")
	c.JSON(http.StatusOK, gin.H{"message": "workflow deleted"})
}

func (h *WorkflowHandler) RunWorkflow(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Inputs          map[string]string `json:"inputs"`
		StartGroupID    *uuid.UUID        `json:"start_group_id"`
		StartStepID     *uuid.UUID        `json:"start_step_id"`
		FromExecutionID *uuid.UUID        `json:"from_execution_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil && c.Request.ContentLength > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch workflow with explicit EXECUTE action check
	_, err = h.service.GetWorkflowWithAction(id, user, "EXECUTE")
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found or permission denied"})
		return
	}

	// Generate execution ID
	execID := uuid.New()

	// Initial execution record creation to avoid race conditions with log fetching
	execution := &domain.WorkflowExecution{
		ID:                execID,
		WorkflowID:        id,
		Status:            domain.StatusRunning,
		StartedAt:         time.Now(),
		ExecutedBy:        &user.ID,
		TriggerSource:     "MANUAL",
		ParentExecutionID: req.FromExecutionID,
	}
	if req.Inputs != nil {
		inputsByes, _ := json.Marshal(req.Inputs)
		execution.Inputs = string(inputsByes)
	}

	if err := h.service.CreateExecution(execution); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create execution record"})
		return
	}

	// Run inside a goroutine to not block the request
	go func() {
		err := h.executor.Run(context.Background(), id, execID, req.Inputs, nil, nil, "MANUAL", user, req.StartGroupID, req.StartStepID, req.FromExecutionID)
		if err != nil {
			// Hub broadcast will handle status updates, but we can log error
			println("Workflow execution error:", err.Error())
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message":      "Workflow started",
		"execution_id": execID,
	})
}

func (h *WorkflowHandler) CreateGroup(c *gin.Context) {
	var group domain.WorkflowGroup
	if err := c.ShouldBindJSON(&group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.CreateGroup(&group); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, group)
}

func (h *WorkflowHandler) CreateStep(c *gin.Context) {
	var step domain.WorkflowStep
	if err := c.ShouldBindJSON(&step); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.CreateStep(&step); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, step)
}

func (h *WorkflowHandler) ListExecutions(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	limit := 20
	offset := 0
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	var executedBy *uuid.UUID
	if eb := c.Query("executed_by"); eb != "" {
		if id, err := uuid.Parse(eb); err == nil {
			executedBy = &id
		}
	}
	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	var tagIDs []uuid.UUID
	for _, idStr := range c.QueryArray("tag_ids") {
		if id, err := uuid.Parse(idStr); err == nil {
			tagIDs = append(tagIDs, id)
		}
	}

	execs, total, err := h.service.ListExecutionsPaginated(id, limit, offset, executedBy, tagIDs, user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": execs, "total": total, "limit": limit, "offset": offset})
}

func (h *WorkflowHandler) ListAllExecutions(c *gin.Context) {
	nsIDStr := c.Param("ns_id")
	nsID, err := uuid.Parse(nsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	limit := 20
	offset := 0
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	status := c.Query("status")
	var workflowID *uuid.UUID
	if wfIDStr := c.Query("workflow_id"); wfIDStr != "" {
		if id, err := uuid.Parse(wfIDStr); err == nil {
			workflowID = &id
		}
	}

	var executedBy *uuid.UUID
	if eb := c.Query("executed_by"); eb != "" {
		if id, err := uuid.Parse(eb); err == nil {
			executedBy = &id
		}
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	var tagIDs []uuid.UUID
	for _, idStr := range c.QueryArray("tag_ids") {
		if id, err := uuid.Parse(idStr); err == nil {
			tagIDs = append(tagIDs, id)
		}
	}

	execs, total, err := h.service.ListNamespaceExecutionsPaginated(nsID, limit, offset, status, workflowID, executedBy, tagIDs, user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":  execs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *WorkflowHandler) GetExecution(c *gin.Context) {
	idStr := c.Param("exec_id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	execution, err := h.service.GetExecution(id, user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
		return
	}
	c.JSON(http.StatusOK, execution)
}

func (h *WorkflowHandler) GetExecutionLogs(c *gin.Context) {
	idStr := c.Param("exec_id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	stepID := c.Query("step_id")
	groupID := c.Query("group_id")
	cwd, _ := os.Getwd()
	execLogDir := filepath.Join(cwd, "data", "logs", "executions", id.String())

	if stepID != "" {
		path := filepath.Join(execLogDir, stepID+".log")
		if _, err := os.Stat(path); err == nil {
			c.File(path)
			return
		}
	} else if groupID != "" {
		groupUUID, err := uuid.Parse(groupID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid group id"})
			return
		}

		userVal, _ := c.Get("user")
		user := userVal.(*domain.User)

		execution, err := h.service.GetExecution(id, user)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
			return
		}

		var logs string
		for _, step := range execution.Steps {
			if step.GroupID == groupUUID {
				stepLogPath := filepath.Join(execLogDir, step.StepID.String()+".log")
				if content, err := os.ReadFile(stepLogPath); err == nil {
					logs += string(content) + "\n"
				}
			}
		}
		c.String(http.StatusOK, logs)
		return
	} else {
		userVal, _ := c.Get("user")
		user := userVal.(*domain.User)

		// Global Trace Merge Logic
		execution, err := h.service.GetExecution(id, user)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
			return
		}

		mainLogPath := filepath.Join(execLogDir, "workflow.log")
		if _, err := os.Stat(mainLogPath); err == nil {
			c.File(mainLogPath)
			return
		}

		// If running/pending and workflow.log not created yet, return empty
		if execution.Status == domain.StatusRunning || execution.Status == domain.StatusPending {
			c.String(http.StatusOK, "")
			return
		}

		// Legacy fallback if workflow.log doesn't exist
		if execution.LogPath != "" {
			oldPath := execution.LogPath
			if !filepath.IsAbs(oldPath) {
				oldPath = filepath.Join(cwd, oldPath)
			}
			if _, err := os.Stat(oldPath); err == nil {
				c.File(oldPath)
				return
			}
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "log file not found"})
}

func (h *WorkflowHandler) GetExecutionAnalytics(c *gin.Context) {
	nsIDStr := c.Param("ns_id")
	nsID, err := uuid.Parse(nsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	days := 7
	if d := c.Query("days"); d != "" {
		if v, err := strconv.Atoi(d); err == nil && v > 0 {
			days = v
		}
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	data, err := h.service.GetExecutionAnalytics(nsID, days, user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *WorkflowHandler) CloneWorkflow(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow id"})
		return
	}

	var req struct {
		TargetNamespaceID uuid.UUID `json:"target_namespace_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target namespace id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch to set namespace_id in context
	existing, err := h.service.GetWorkflow(id, user)
	if err == nil {
		c.Set("namespace_id", existing.NamespaceID)
	}

	clone, err := h.service.CloneWorkflow(id, req.TargetNamespaceID, user)
	if err != nil {
		h.auditLog.LogAction(c, "CLONE", "WORKFLOW", id.String(), gin.H{"error": err.Error(), "target_ns": req.TargetNamespaceID}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "CLONE", "WORKFLOW", id.String(), gin.H{"clone_id": clone.ID, "target_ns": req.TargetNamespaceID}, "SUCCESS")
	c.JSON(http.StatusCreated, clone)
}

func (h *WorkflowHandler) StopExecution(c *gin.Context) {
	idStr := c.Param("exec_id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	execution, err := h.service.GetExecution(id, user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
		return
	}

	// Permission check: Need EXECUTE on the workflow
	wf, err := h.service.GetWorkflow(execution.WorkflowID, user)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to stop this execution"})
		return
	}
	nsIDStr := wf.NamespaceID.String()
	resIDStr := wf.ID.String()
	if !domain.HasPermission(user, "workflows", "EXECUTE", &nsIDStr, &resIDStr, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to stop this execution"})
		return
	}

	if err := h.executor.StopExecution(id); err != nil {
		h.auditLog.LogAction(c, "STOP", "WORKFLOW_EXECUTION", id.String(), gin.H{"error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "STOP", "WORKFLOW_EXECUTION", id.String(), nil, "SUCCESS")
	c.JSON(http.StatusOK, gin.H{"message": "Execution stop signal sent"})
}

func (h *WorkflowHandler) ImportWorkflow(c *gin.Context) {
	nsIDStr := c.Param("ns_id")
	nsID, err := uuid.Parse(nsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	var wf domain.Workflow
	if err := c.ShouldBindJSON(&wf); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wf.NamespaceID = nsID

	authUser, _ := c.Get("user")
	userObj := authUser.(*domain.User)
	nsIDStr = nsID.String()
	if !domain.HasPermission(userObj, "workflows", "WRITE", &nsIDStr, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to import workflow in this namespace"})
		return
	}

	if err := h.service.ImportWorkflow(&wf, userObj); err != nil {
		h.auditLog.LogAction(c, "IMPORT", "WORKFLOW", wf.ID.String(), map[string]string{"error": err.Error(), "name": wf.Name}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "IMPORT", "WORKFLOW", wf.ID.String(), map[string]string{"name": wf.Name}, "SUCCESS")
	c.JSON(http.StatusCreated, wf)
}
func (h *WorkflowHandler) TestHttp(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow id"})
		return
	}

	var req struct {
		HttpUrl     string            `json:"http_url"`
		HttpMethod  string            `json:"http_method"`
		HttpHeaders map[string]string `json:"http_headers"`
		HttpBody    string            `json:"http_body"`
		ServerID    *uuid.UUID        `json:"server_id"`
		GroupID     *uuid.UUID        `json:"group_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch workflow to look up default servers
	wf, err := h.service.GetWorkflow(id, user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}

	// Determine target server ID
	targetServerID := uuid.Nil // Default to Local
	if req.ServerID != nil && *req.ServerID != uuid.Nil {
		targetServerID = *req.ServerID
	} else if req.GroupID != nil && *req.GroupID != uuid.Nil {
		// Find group in workflow
		for _, g := range wf.Groups {
			if g.ID == *req.GroupID {
				if g.DefaultServerID != nil && *g.DefaultServerID != uuid.Nil {
					targetServerID = *g.DefaultServerID
				} else if wf.DefaultServerID != nil && *wf.DefaultServerID != uuid.Nil {
					targetServerID = *wf.DefaultServerID
				}
				break
			}
		}
	} else if wf.DefaultServerID != nil && *wf.DefaultServerID != uuid.Nil {
		targetServerID = *wf.DefaultServerID
	}

	method := req.HttpMethod
	if method == "" {
		method = "GET"
	}

	// Convert headers map to JSON string for ExecuteHttp
	headersJSON, _ := json.Marshal(req.HttpHeaders)

	output, err := h.serverService.ExecuteHttp(c.Request.Context(), targetServerID, method, req.HttpUrl, req.HttpBody, string(headersJSON), user, nil)
	if err != nil {
		h.auditLog.LogAction(c, "TEST_HTTP", "WORKFLOW", id.String(), map[string]string{"url": req.HttpUrl, "error": err.Error(), "server_id": targetServerID.String()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "output": output})
		return
	}

	h.auditLog.LogAction(c, "TEST_HTTP", "WORKFLOW", id.String(), map[string]string{"url": req.HttpUrl, "server_id": targetServerID.String()}, "SUCCESS")
	c.JSON(http.StatusOK, gin.H{"output": output})
}
