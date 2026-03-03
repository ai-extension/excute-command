package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
)

type VpnConfigHandler struct {
	service *service.VpnConfigService
}

func NewVpnConfigHandler(service *service.VpnConfigService) *VpnConfigHandler {
	return &VpnConfigHandler{service: service}
}

func (h *VpnConfigHandler) List(c *gin.Context) {
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
	authType := c.Query("auth_type")

	userVal, _ := c.Get("user")
	vpns, total, err := h.service.ListPaginated(limit, offset, searchTerm, authType, userVal.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":  vpns,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *VpnConfigHandler) Create(c *gin.Context) {
	var vpn domain.VpnConfig
	if err := c.ShouldBindJSON(&vpn); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)
	if !domain.HasPermission(user, "vpns", "WRITE", nil, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to create vpn"})
		return
	}

	if err := h.service.Create(&vpn); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, vpn)
}

func (h *VpnConfigHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var vpn domain.VpnConfig
	if err := c.ShouldBindJSON(&vpn); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	vpn.ID = id

	user, _ := c.Get("user")
	if err := h.service.Update(&vpn, user.(*domain.User)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, vpn)
}

func (h *VpnConfigHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user, _ := c.Get("user")
	if err := h.service.Delete(id, user.(*domain.User)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
