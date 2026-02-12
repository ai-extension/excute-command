package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type RoleHandler struct {
	roleRepo domain.RoleRepository
	permRepo domain.PermissionRepository
}

func NewRoleHandler(roleRepo domain.RoleRepository, permRepo domain.PermissionRepository) *RoleHandler {
	return &RoleHandler{roleRepo: roleRepo, permRepo: permRepo}
}

func (h *RoleHandler) ListRoles(c *gin.Context) {
	roles, err := h.roleRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, roles)
}

func (h *RoleHandler) CreateRole(c *gin.Context) {
	var input struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := &domain.Role{
		ID:          uuid.New(),
		Name:        input.Name,
		Description: input.Description,
	}

	if err := h.roleRepo.Create(role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, role)
}

func (h *RoleHandler) UpdateRolePermissions(c *gin.Context) {
	idStr := c.Param("id")
	roleID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role id"})
		return
	}

	var input struct {
		PermissionIDs []uuid.UUID `json:"permission_ids" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	perms, err := h.permRepo.GetByIDs(input.PermissionIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch permissions"})
		return
	}

	if err := h.roleRepo.SetPermissions(roleID, perms); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "role permissions updated successfully"})
}
