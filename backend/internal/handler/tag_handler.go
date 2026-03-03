package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
)

type TagHandler struct {
	service *service.TagService
}

func NewTagHandler(service *service.TagService) *TagHandler {
	return &TagHandler{service: service}
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

	tags, total, err := h.service.ListPaginated(namespaceID, limit, offset, searchTerm, user)
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

	if err := h.service.Create(&tag); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

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

	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)

	if err := h.service.Update(&tag, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, tag)
}

func (h *TagHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tag id"})
		return
	}

	user, _ := c.Get("user")
	if err := h.service.Delete(id, user.(*domain.User)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}
