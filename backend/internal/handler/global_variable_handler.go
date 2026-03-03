package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
)

type GlobalVariableHandler struct {
	service *service.GlobalVariableService
}

func NewGlobalVariableHandler(service *service.GlobalVariableService) *GlobalVariableHandler {
	return &GlobalVariableHandler{service: service}
}

func (h *GlobalVariableHandler) List(c *gin.Context) {
	nsID, err := uuid.Parse(c.Param("ns_id"))
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

	user, _ := c.Get("user")
	gvs, total, err := h.service.ListPaginated(nsID, limit, offset, searchTerm, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  gvs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *GlobalVariableHandler) Create(c *gin.Context) {
	nsID, err := uuid.Parse(c.Param("ns_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	var gv domain.GlobalVariable
	if err := c.ShouldBindJSON(&gv); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gv.NamespaceID = nsID
	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)
	nsIDStr := nsID.String()
	if !domain.HasPermission(user, "namespaces", "WRITE", &nsIDStr, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to create variable in this namespace"})
		return
	}

	if err := h.service.Create(&gv, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gv)
}

func (h *GlobalVariableHandler) Update(c *gin.Context) {
	var gv domain.GlobalVariable
	if err := c.ShouldBindJSON(&gv); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	gv.ID = id

	user, _ := c.Get("user")
	if err := h.service.Update(&gv, user.(*domain.User)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gv)
}

func (h *GlobalVariableHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	if err := h.service.Delete(id, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
