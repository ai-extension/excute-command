package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
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
	terminalService *service.TerminalService
}

func NewPageHandler(s *service.PageService, ws *service.WorkflowService, e *service.WorkflowExecutor, ts *service.TerminalService) *PageHandler {
	return &PageHandler{
		service:         s,
		workflowService: ws,
		executor:        e,
		terminalService: ts,
	}
}

func (h *PageHandler) ListPages(c *gin.Context) {
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
	var isPublic *bool
	if pStr := c.Query("is_public"); pStr != "" {
		p := pStr == "true"
		isPublic = &p
	}

	user, _ := c.Get("user")
	pages, total, err := h.service.ListPagesPaginated(nsID, limit, offset, searchTerm, isPublic, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":  pages,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
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

	// Issue short-lived session token
	token, expiresAt, err := h.service.IssuePageToken(page)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
		return
	}

	h.sanitizePage(page)
	c.JSON(http.StatusOK, gin.H{
		"page":       page,
		"token":      token,
		"expires_at": expiresAt,
	})
}

// verifyPageToken checks the X-Page-Token header for password-protected pages.
// Returns false and writes the error response if invalid.
func (h *PageHandler) verifyPageToken(c *gin.Context, page *domain.Page) bool {
	if page.Password == "" {
		return true // No password → no token required
	}
	token := c.GetHeader("X-Page-Token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required", "token_required": true})
		return false
	}
	if err := h.service.ValidatePageToken(page, token); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error(), "token_required": true})
		return false
	}
	return true
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

	// Token verification (replaces raw password passing)
	if !h.verifyPageToken(c, page) {
		return
	}

	var inputReq struct {
		Inputs map[string]string `json:"inputs"`
	}
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&inputReq); err != nil {
			// Ignore bind error, inputs are optional
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
	logChan := make(chan string, 100)
	logFunc := func(log string) {
		logChan <- log
	}

	doneChan := make(chan struct{})
	go func() {
		defer close(doneChan)
		// Public run uses background context
		h.executor.Run(context.Background(), workflowID, execID, inputReq.Inputs, nil, &page.ID, "PAGE", nil, logFunc)
	}()

	// Stream logs to the client
	c.Header("X-Execution-ID", execID.String())
	c.Stream(func(w io.Writer) bool {
		select {
		case logLine := <-logChan:
			w.Write([]byte(logLine))
			return true
		case <-doneChan:
			for {
				select {
				case logLine := <-logChan:
					w.Write([]byte(logLine))
				default:
					return false
				}
			}
		case <-c.Request.Context().Done():
			return false
		}
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

	if !h.verifyPageToken(c, page) {
		return
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

	if !h.verifyPageToken(c, page) {
		return
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
	stepID := c.Query("step_id")
	groupID := c.Query("group_id")
	cwd, _ := os.Getwd()
	execLogDir := filepath.Join(cwd, "data", "logs", "executions", execution.ID.String())

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

		workflow, err := h.workflowService.GetWorkflow(execution.WorkflowID, nil)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
			return
		}

		var logs string
		for _, group := range workflow.Groups {
			if group.ID == groupUUID {
				for _, step := range group.Steps {
					stepLogPath := filepath.Join(execLogDir, step.ID.String()+".log")
					if content, err := os.ReadFile(stepLogPath); err == nil {
						logs += string(content) + "\n"
					}
				}
				break
			}
		}
		c.String(http.StatusOK, logs)
		return
	} else {
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

// pageLayoutWidget is a minimal struct to extract widget config from the layout JSON.
type pageLayoutWidget struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	ServerID string `json:"server_id"`
	Command  string `json:"command"`
}

type pageLayout struct {
	Widgets []pageLayoutWidget `json:"widgets"`
}

// RunPublicWidgetCommand executes the predefined command for a terminal widget on a page.
// It reads the widget config from the page layout, prevents arbitrary command injection.
func (h *PageHandler) RunPublicWidgetCommand(c *gin.Context) {
	slug := c.Param("slug")
	widgetID := c.Param("widget_id")

	page, err := h.service.GetPageBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	if !page.IsPublic {
		c.JSON(http.StatusForbidden, gin.H{"error": "page is not public"})
		return
	}

	if page.ExpiresAt != nil && page.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "page has expired"})
		return
	}

	if !h.verifyPageToken(c, page) {
		return
	}

	// Parse layout to find widget
	var layout pageLayout
	if err := json.Unmarshal([]byte(page.Layout), &layout); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid page layout"})
		return
	}

	var widget *pageLayoutWidget
	for i := range layout.Widgets {
		if layout.Widgets[i].ID == widgetID && layout.Widgets[i].Type == "TERMINAL" {
			w := layout.Widgets[i]
			widget = &w
			break
		}
	}
	if widget == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "terminal widget not found"})
		return
	}

	serverID, err := uuid.Parse(widget.ServerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid server id in widget config"})
		return
	}

	runner := h.terminalService.RunCommandOnServer(serverID)
	output, _ := runner(widget.Command) // Ignore execution error, return output regardless
	c.JSON(http.StatusOK, gin.H{"output": output})
}
