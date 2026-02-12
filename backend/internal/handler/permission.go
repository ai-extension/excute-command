package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/user/csm-backend/internal/domain"
)

type PermissionHandler struct {
	permRepo domain.PermissionRepository
}

func NewPermissionHandler(permRepo domain.PermissionRepository) *PermissionHandler {
	return &PermissionHandler{permRepo: permRepo}
}

func (h *PermissionHandler) ListPermissions(c *gin.Context) {
	perms, err := h.permRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, perms)
}
