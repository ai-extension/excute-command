package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/lib/utils"
	"github.com/user/csm-backend/internal/service"
)

type TagHandler struct {
	service  *service.TagService
	auditLog domain.AuditLogService
}

func NewTagHandler(service *service.TagService, auditLog domain.AuditLogService) *TagHandler {
	return &TagHandler{
		service:  service,
		auditLog: auditLog,
	}
}

func (h *TagHandler) List(c *gin.Context) {
	namespaceIDStr := c.Param("ns_id")
	namespaceID, err := uuid.Parse(namespaceIDStr)
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

	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)

	var createdBy *uuid.UUID
	if cb := c.Query("created_by"); cb != "" {
		if id, err := uuid.Parse(cb); err == nil {
			createdBy = &id
		}
	}

	tags, total, err := h.service.ListPaginated(namespaceID, limit, offset, searchTerm, createdBy, user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  tags,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *TagHandler) Create(c *gin.Context) {
	namespaceIDStr := c.Param("ns_id")
	namespaceID, err := uuid.Parse(namespaceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	var tag domain.Tag
	if err := c.ShouldBindJSON(&tag); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tag.NamespaceID = namespaceID

	uVal, _ := c.Get("user")
	u := uVal.(*domain.User)
	namespaceIDStr = namespaceID.String()
	if !domain.HasPermission(u, "tags", "WRITE", &namespaceIDStr, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to create tag in this namespace"})
		return
	}

	if err := h.service.Create(&tag, u); err != nil {
		h.auditLog.LogAction(c, "CREATE", "TAG", "", map[string]string{"name": tag.Name, "error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "CREATE", "TAG", tag.ID.String(), map[string]string{"name": tag.Name}, "SUCCESS")
	c.JSON(http.StatusCreated, tag)
}

func (h *TagHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tag id"})
		return
	}

	var tag domain.Tag
	if err := c.ShouldBindJSON(&tag); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tag.ID = id

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch to set namespace_id and calculate diff
	existing, err := h.service.GetByID(id, user)
	if err == nil {
		c.Set("namespace_id", existing.NamespaceID)
	}

	diff := utils.CalculateDiff(existing, &tag)

	if err := h.service.Update(&tag, user); err != nil {
		meta := diff
		if meta == nil {
			meta = make(map[string]interface{})
		}
		meta["error"] = err.Error()
		h.auditLog.LogAction(c, "UPDATE", "TAG", tag.ID.String(), meta, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "UPDATE", "TAG", tag.ID.String(), diff, "SUCCESS")
	c.JSON(http.StatusOK, tag)
}

func (h *TagHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tag id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch to set namespace_id
	existing, err := h.service.GetByID(id, user)
	if err == nil {
		c.Set("namespace_id", existing.NamespaceID)
	}

	resID := id.String()
	if err := h.service.Delete(id, user); err != nil {
		h.auditLog.LogAction(c, "DELETE", "TAG", resID, map[string]string{"error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "DELETE", "TAG", resID, nil, "SUCCESS")
	c.Status(http.StatusNoContent)
}
