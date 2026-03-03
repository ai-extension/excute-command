package handler

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
)

type WorkflowHandler struct {
	service  *service.WorkflowService
	executor *service.WorkflowExecutor
}

func NewWorkflowHandler(s *service.WorkflowService, e *service.WorkflowExecutor) *WorkflowHandler {
	return &WorkflowHandler{
		service:  s,
		executor: e,
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

	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)

	wfs, total, err := h.service.ListWorkflowsPaginated(nsID, limit, offset, searchTerm, tagIDs, user)
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

	if err := h.service.CreateWorkflow(&wf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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

	if err := h.service.UpdateWorkflow(&wf, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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

	if err := h.service.DeleteWorkflow(id, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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
		Inputs map[string]string `json:"inputs"`
	}
	if err := c.ShouldBindJSON(&req); err != nil && c.Request.ContentLength > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Immediate EXECUTE check
	wf, err := h.service.GetWorkflow(id, user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found or permission denied"})
		return
	}
	nsIDStr := wf.NamespaceID.String()
	resIDStr := wf.ID.String()
	if !domain.HasPermission(user, "workflows", "EXECUTE", &nsIDStr, &resIDStr, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to execute this workflow"})
		return
	}

	// Generate execution ID
	execID := uuid.New()

	// Run inside a goroutine to not block the request
	go func() {
		err := h.executor.Run(context.Background(), id, execID, req.Inputs, nil, user)
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

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	execs, total, err := h.service.ListExecutionsPaginated(id, limit, offset, user)
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

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	execs, total, err := h.service.ListNamespaceExecutionsPaginated(nsID, limit, offset, status, workflowID, user)
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
	idStr := c.Param("id")
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
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	stepID := c.Query("step_id")
	cwd, _ := os.Getwd()
	execLogDir := filepath.Join(cwd, "data", "logs", "executions", id.String())

	if stepID != "" {
		path := filepath.Join(execLogDir, stepID+".log")
		if _, err := os.Stat(path); err == nil {
			c.File(path)
			return
		}
	} else {
		userVal, _ := c.Get("user")
		user := userVal.(*domain.User)

		// Global Trace Merge Logic
		execution, err := h.service.GetExecution(id, user)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
			return
		}

		// If the execution is still running, serve the interleaved workflow.log for live updates
		if execution.Status == domain.StatusRunning {
			mainLogPath := filepath.Join(execLogDir, "workflow.log")
			if _, err := os.Stat(mainLogPath); err == nil {
				c.File(mainLogPath)
				return
			}
		}

		// If finished, or no workflow.log, merge step logs sequentially for a clean view
		wf, err := h.service.GetWorkflow(execution.WorkflowID, user)
		if err == nil {
			// Set headers for streaming
			c.Header("Content-Type", "text/plain; charset=utf-8")
			c.Stream(func(w io.Writer) bool {
				// Write workflow header
				header := fmt.Sprintf("================================================================================\n"+
					"--- SEQUENTIAL EXECUTION TRACE ---\n"+
					"Workflow: %s\n"+
					"Started: %v\n"+
					"Status: %v\n"+
					"================================================================================\n\n",
					wf.Name, execution.StartedAt.Format(time.RFC3339), execution.Status)
				w.Write([]byte(header))

				for _, group := range wf.Groups {
					groupHeader := fmt.Sprintf("\n%s\n[GROUP] %s\n%s\n", strings.Repeat("=", 80), group.Name, strings.Repeat("=", 80))
					w.Write([]byte(groupHeader))

					for _, step := range group.Steps {
						stepLogPath := filepath.Join(execLogDir, step.ID.String()+".log")
						if file, err := os.Open(stepLogPath); err == nil {
							io.Copy(w, file)
							file.Close()
							w.Write([]byte("\n"))
						} else {
							// If step log doesn't exist (e.g. skipped), just show the step name
							w.Write([]byte(fmt.Sprintf("\n  ┌─ [STEP] %s (No log output)\n", step.Name)))
						}
					}
				}

				footer := fmt.Sprintf("\n%s\n--- TRACE END ---\n", strings.Repeat("=", 80))
				w.Write([]byte(footer))
				return false
			})
			return
		}

		// Legacy fallback
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
