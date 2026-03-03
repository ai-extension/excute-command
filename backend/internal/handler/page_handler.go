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

type PageHandler struct {
	service         *service.PageService
	workflowService *service.WorkflowService
	executor        *service.WorkflowExecutor
}

func NewPageHandler(s *service.PageService, ws *service.WorkflowService, e *service.WorkflowExecutor) *PageHandler {
	return &PageHandler{
		service:         s,
		workflowService: ws,
		executor:        e,
	}
}

func (h *PageHandler) ListPages(c *gin.Context) {
	nsIDStr := c.Param("ns_id")
	nsID, err := uuid.Parse(nsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	user, _ := c.Get("user")
	pages, err := h.service.ListPages(nsID, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pages)
}

func (h *PageHandler) CreatePage(c *gin.Context) {
	nsIDStr := c.Param("ns_id")
	nsID, err := uuid.Parse(nsIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	var page domain.Page
	if err := c.ShouldBindJSON(&page); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	page.NamespaceID = nsID

	authUser, _ := c.Get("user")
	userObj := authUser.(*domain.User)
	nsIDStr = nsID.String()
	if !domain.HasPermission(userObj, "pages", "WRITE", &nsIDStr, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to create page in this namespace"})
		return
	}

	if err := h.service.CreatePage(&page); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, page)
}

func (h *PageHandler) GetPage(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user, _ := c.Get("user")
	page, err := h.service.GetPage(id, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	c.JSON(http.StatusOK, page)
}

func (h *PageHandler) UpdatePage(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var page domain.Page
	if err := c.ShouldBindJSON(&page); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	page.ID = id

	user, _ := c.Get("user")
	if err := h.service.UpdatePage(&page, user.(*domain.User)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, page)
}

func (h *PageHandler) DeletePage(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user, _ := c.Get("user")
	if err := h.service.DeletePage(id, user.(*domain.User)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "page deleted"})
}

func (h *PageHandler) GetPublicPage(c *gin.Context) {
	slug := c.Param("slug")
	page, err := h.service.GetPageBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	if !page.IsPublic {
		c.JSON(http.StatusForbidden, gin.H{"error": "page is not public"})
		return
	}

	// Check expiration
	if page.ExpiresAt != nil && page.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "page has expired"})
		return
	}

	// If page has a password, don't return the full content yet
	// Return a simplified version or a flag indicating password is required
	if page.Password != "" {
		c.JSON(http.StatusOK, gin.H{
			"id":                page.ID,
			"title":             page.Title,
			"description":       page.Description,
			"is_public":         page.IsPublic,
			"requires_password": true,
		})
		return
	}

	h.sanitizePage(page)
	c.JSON(http.StatusOK, page)
}

func (h *PageHandler) VerifyPublicPage(c *gin.Context) {
	slug := c.Param("slug")
	var req struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	page, err := h.service.GetPageBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	if err := h.service.ValidatePagePassword(page, req.Password); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		return
	}

	h.sanitizePage(page)
	c.JSON(http.StatusOK, page)
}

func (h *PageHandler) RunPublicWorkflow(c *gin.Context) {
	slug := c.Param("slug")
	workflowIDStr := c.Param("workflow_id")
	workflowID, err := uuid.Parse(workflowIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow id"})
		return
	}

	page, err := h.service.GetPageBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	if !page.IsPublic {
		c.JSON(http.StatusForbidden, gin.H{"error": "page is not public"})
		return
	}

	// Check expiration
	if page.ExpiresAt != nil && page.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "page has expired"})
		return
	}

	// Password check
	var inputReq struct {
		Password string            `json:"password"`
		Inputs   map[string]string `json:"inputs"`
	}
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&inputReq); err != nil {
			// Ignore bind error if it's just partially missing
		}
	}

	if page.Password != "" {
		password := c.GetHeader("X-Page-Password")
		if password == "" {
			password = inputReq.Password
		}

		if err := h.service.ValidatePagePassword(page, password); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
			return
		}
	}

	// Verify workflow exists on page
	found := false
	for _, pw := range page.Workflows {
		if pw.WorkflowID == workflowID {
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow not part of this page"})
		return
	}

	execID := uuid.New()
	go func() {
		// Public run uses background context
		h.executor.Run(context.Background(), workflowID, execID, inputReq.Inputs, nil, nil)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message":      "Workflow started",
		"execution_id": execID,
	})
}

func (h *PageHandler) GetPublicExecutionStatus(c *gin.Context) {
	slug := c.Param("slug")
	execID, err := uuid.Parse(c.Param("exec_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	page, err := h.service.GetPageBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	if page.ExpiresAt != nil && page.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "link has expired"})
		return
	}

	if page.Password != "" {
		password := c.GetHeader("X-Page-Password")
		if err := h.service.ValidatePagePassword(page, password); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
			return
		}
	}

	execution, err := h.workflowService.GetExecution(execID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
		return
	}

	// Security: Verify execution belongs to a workflow on this page and ShowLog is true
	isAllowed := false
	for _, pw := range page.Workflows {
		if pw.WorkflowID == execution.WorkflowID && pw.ShowLog {
			isAllowed = true
			break
		}
	}

	if !isAllowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "logs are not enabled for this workflow on this page"})
		return
	}

	h.sanitizeExecution(execution)
	h.sanitizePage(page)
	c.JSON(http.StatusOK, execution)
}

func (h *PageHandler) GetPublicExecutionLogs(c *gin.Context) {
	slug := c.Param("slug")
	execID, err := uuid.Parse(c.Param("exec_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	page, err := h.service.GetPageBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	if page.ExpiresAt != nil && page.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "link has expired"})
		return
	}

	if page.Password != "" {
		password := c.GetHeader("X-Page-Password")
		if err := h.service.ValidatePagePassword(page, password); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
			return
		}
	}

	execution, err := h.workflowService.GetExecution(execID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "execution not found"})
		return
	}

	// Security: Verify execution belongs to a workflow on this page and ShowLog is true
	isAllowed := false
	for _, pw := range page.Workflows {
		if pw.WorkflowID == execution.WorkflowID && pw.ShowLog {
			isAllowed = true
			break
		}
	}

	if !isAllowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "logs are not enabled for this workflow on this page"})
		return
	}

	h.sanitizeExecution(execution)
	// Reuse log logic or implement similar
	// For simplicity, I'll use the same logic as in WorkflowHandler
	h.serveLogs(c, execution)
}

// serveLogs is a helper to stream logs, logic similar to WorkflowHandler.GetExecutionLogs
func (h *PageHandler) serveLogs(c *gin.Context, execution *domain.WorkflowExecution) {
	cwd, _ := os.Getwd()
	execLogDir := filepath.Join(cwd, "data", "logs", "executions", execution.ID.String())

	// If the execution is still running, serve the interleaved workflow.log for live updates
	if execution.Status == domain.StatusRunning {
		mainLogPath := filepath.Join(execLogDir, "workflow.log")
		if _, err := os.Stat(mainLogPath); err == nil {
			c.File(mainLogPath)
			return
		}
	}

	// If finished, or no workflow.log, merge step logs sequentially for a clean view
	// Public context has already verified access to this execution and its workflow ID via page check
	wf, err := h.workflowService.GetWorkflow(execution.WorkflowID, nil)
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

	c.JSON(http.StatusNotFound, gin.H{"error": "log file not found"})
}

func (h *PageHandler) sanitizePage(page *domain.Page) {
	if page == nil {
		return
	}
	page.Password = "" // Never return the hash to public users
	for i := range page.Workflows {
		if page.Workflows[i].Workflow != nil {
			page.Workflows[i].Workflow.DefaultServerID = uuid.Nil // Hide internal server IDs
		}
	}
}

func (h *PageHandler) sanitizeExecution(execution *domain.WorkflowExecution) {
	if execution == nil {
		return
	}
	if execution.Workflow != nil {
		execution.Workflow.DefaultServerID = uuid.Nil
	}
	if execution.User != nil {
		execution.User.PasswordHash = ""
		execution.User.Email = "" // Protect PII
	}
}
