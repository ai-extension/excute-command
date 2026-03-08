package handler

import (
	"context"
	"net/http"
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

	var createdBy *uuid.UUID
	if cb := c.Query("created_by"); cb != "" {
		if id, err := uuid.Parse(cb); err == nil {
			createdBy = &id
		}
	}

	user, _ := c.Get("user")
	pages, total, err := h.service.ListPagesPaginated(nsID, limit, offset, searchTerm, isPublic, createdBy, user.(*domain.User))
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

	if err := h.service.CreatePage(&page, userObj); err != nil {
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
	go func() {
		// Public run uses background context
		h.executor.Run(context.Background(), workflowID, execID, inputReq.Inputs, nil, &page.ID, "PAGE", nil, nil, nil)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message":      "Workflow started",
		"execution_id": execID,
	})
}

func (h *PageHandler) StopPublicExecution(c *gin.Context) {
	slug := c.Param("slug")
	execIDStr := c.Param("exec_id")
	execID, err := uuid.Parse(execIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
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

	if page.ExpiresAt != nil && page.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "page has expired"})
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

	// Verify workflow belongs to this page
	found := false
	for _, pw := range page.Workflows {
		if pw.WorkflowID == execution.WorkflowID {
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusForbidden, gin.H{"error": "execution does not belong to this page"})
		return
	}

	if err := h.executor.StopExecution(execID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Execution stop signal sent"})
}

func (h *PageHandler) sanitizePage(page *domain.Page) {
	if page == nil {
		return
	}
	page.Password = "" // Never return the hash to public users
	for i := range page.Workflows {
		if page.Workflows[i].Workflow != nil {
			page.Workflows[i].Workflow.DefaultServerID = nil // Hide internal server IDs
		}
	}
}

func (h *PageHandler) sanitizeExecution(execution *domain.WorkflowExecution) {
	if execution == nil {
		return
	}
	if execution.Workflow != nil {
		execution.Workflow.DefaultServerID = nil
	}
	if execution.User != nil {
		execution.User.PasswordHash = ""
		execution.User.Email = "" // Protect PII
	}
}
