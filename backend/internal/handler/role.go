package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type RoleHandler struct {
	roleRepo domain.RoleRepository
	permRepo domain.PermissionRepository
	auditLog domain.AuditLogService
}

func NewRoleHandler(roleRepo domain.RoleRepository, permRepo domain.PermissionRepository, auditLog domain.AuditLogService) *RoleHandler {
	return &RoleHandler{
		roleRepo: roleRepo,
		permRepo: permRepo,
		auditLog: auditLog,
	}
}

func (h *RoleHandler) ListRoles(c *gin.Context) {
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

	roles, total, err := h.roleRepo.ListPaginated(limit, offset, searchTerm)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":  roles,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
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
		h.auditLog.LogAction(c, "CREATE_ROLE", "RBAC", role.ID.String(), map[string]string{"name": role.Name, "error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resID := role.ID.String()
	h.auditLog.LogAction(c, "CREATE_ROLE", "RBAC", resID, map[string]string{"name": role.Name}, "SUCCESS")

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
		Permissions []struct {
			PermissionID uuid.UUID `json:"permission_id" binding:"required"`
			ResourceID   *string   `json:"resource_id"`
		} `json:"permissions" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var rolePerms []domain.RolePermission
	for _, p := range input.Permissions {
		rolePerms = append(rolePerms, domain.RolePermission{
			ID:           uuid.New(),
			RoleID:       roleID,
			PermissionID: p.PermissionID,
			ResourceID:   p.ResourceID,
		})
	}

	resID := roleID.String()

	if err := h.roleRepo.SetPermissions(roleID, rolePerms); err != nil {
		h.auditLog.LogAction(c, "UPDATE_ROLE_PERMISSIONS", "RBAC", resID, map[string]string{"error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "UPDATE_ROLE_PERMISSIONS", "RBAC", resID, nil, "SUCCESS")

	c.JSON(http.StatusOK, gin.H{"message": "role permissions updated successfully"})
}
