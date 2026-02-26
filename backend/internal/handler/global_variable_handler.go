package handler

import (
	"net/http"

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

	gvs, err := h.service.List(nsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gvs)
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
	if err := h.service.Create(&gv); err != nil {
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

	if err := h.service.Update(&gv).Error; err != nil {
		// Note: Service Update usually returns Error if we use GORM's Save.
		// Let's ensure service.Update returns error.
	}
	// Update service call to match my implementation in global_variable_service.go
	if err := h.service.Update(&gv); err != nil {
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

	if err := h.service.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
