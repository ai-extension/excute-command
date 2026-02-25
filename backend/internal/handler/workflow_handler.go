package handler

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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

	wfs, err := h.service.ListWorkflows(nsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, wfs)
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

	wf, err := h.service.GetWorkflow(id)
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

	if err := h.service.UpdateWorkflow(&wf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, wf)
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

	// Generate execution ID
	execID := uuid.New()

	// Run inside a goroutine to not block the request
	go func() {
		err := h.executor.Run(context.Background(), id, execID, req.Inputs)
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

	execs, err := h.service.ListExecutions(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, execs)
}

func (h *WorkflowHandler) ListAllExecutions(c *gin.Context) {
	nsIDStr := c.Param("ns_id")
	nsID, err := uuid.Parse(nsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	execs, err := h.service.ListNamespaceExecutions(nsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, execs)
}

func (h *WorkflowHandler) GetExecution(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	execution, err := h.service.GetExecution(id)
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
		// Global Trace Merge Logic
		execution, err := h.service.GetExecution(id)
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
		wf, err := h.service.GetWorkflow(execution.WorkflowID)
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
