package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/user/csm-backend/internal/domain"
)

type PermissionHandler struct {
	permRepo      domain.PermissionRepository
	workflowRepo  domain.WorkflowRepository
	globalVarRepo domain.GlobalVariableRepository
	scheduleRepo  domain.ScheduleRepository
	pageRepo      domain.PageRepository
	tagRepo       domain.TagRepository
	serverRepo    domain.ServerRepository
	namespaceRepo domain.NamespaceRepository
	execRepo      domain.WorkflowExecutionRepository
	userRepo      domain.UserRepository
	roleRepo      domain.RoleRepository
	vpnRepo       domain.VpnConfigRepository
}

func NewPermissionHandler(
	permRepo domain.PermissionRepository,
	workflowRepo domain.WorkflowRepository,
	globalVarRepo domain.GlobalVariableRepository,
	scheduleRepo domain.ScheduleRepository,
	pageRepo domain.PageRepository,
	tagRepo domain.TagRepository,
	serverRepo domain.ServerRepository,
	namespaceRepo domain.NamespaceRepository,
	execRepo domain.WorkflowExecutionRepository,
	userRepo domain.UserRepository,
	roleRepo domain.RoleRepository,
	vpnRepo domain.VpnConfigRepository,
) *PermissionHandler {
	return &PermissionHandler{
		permRepo:      permRepo,
		workflowRepo:  workflowRepo,
		globalVarRepo: globalVarRepo,
		scheduleRepo:  scheduleRepo,
		pageRepo:      pageRepo,
		tagRepo:       tagRepo,
		serverRepo:    serverRepo,
		namespaceRepo: namespaceRepo,
		execRepo:      execRepo,
		userRepo:      userRepo,
		roleRepo:      roleRepo,
		vpnRepo:       vpnRepo,
	}
}

func (h *PermissionHandler) ListPermissions(c *gin.Context) {
	perms, err := h.permRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, perms)
}

func (h *PermissionHandler) ListResourceItems(c *gin.Context) {
	resourceType := c.Query("type")
	if resourceType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type query parameter is required"})
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

	// Safely retrieve authenticated user; if missing, respond with 401
	userVal, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthenticated"})
		return
	}
	user, ok := userVal.(*domain.User)
	if !ok || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user in context"})
		return
	}
	scope := domain.GetPermissionScope(user, resourceType, "READ")

	var items interface{}
	var total int64
	var err error

	switch resourceType {
	case "namespaces":
		res, err2 := h.namespaceRepo.List(&scope)
		if err2 != nil {
			err = err2
		} else {
			var filtered []domain.Namespace
			for _, ns := range res {
				if searchTerm == "" || (searchTerm != "" && (contains(ns.Name, searchTerm) || contains(ns.Description, searchTerm))) {
					filtered = append(filtered, ns)
				}
			}
			total = int64(len(filtered))
			start := offset
			if start > len(filtered) {
				start = len(filtered)
			}
			end := offset + limit
			if end > len(filtered) {
				end = len(filtered)
			}
			items = filtered[start:end]
		}
	case "workflows":
		items, total, err = h.workflowRepo.ListGlobalPaginated(limit, offset, searchTerm, nil, &scope)
	case "variables", "global-variables":
		items, total, err = h.globalVarRepo.ListGlobalPaginated(limit, offset, searchTerm, &scope)
	case "schedules":
		items, total, err = h.scheduleRepo.ListGlobalPaginated(limit, offset, searchTerm, &scope)
	case "pages":
		items, total, err = h.pageRepo.ListGlobalPaginated(limit, offset, searchTerm, nil, &scope)
	case "tags":
		items, total, err = h.tagRepo.ListGlobalPaginated(limit, offset, searchTerm, &scope)
	case "servers":
		items, total, err = h.serverRepo.ListPaginated(limit, offset, searchTerm, "", nil, nil, &scope)
	case "history", "executions":
		items, total, err = h.execRepo.ListGlobalPaginated(limit, offset, "", nil, &scope)
	case "users":
		items, total, err = h.userRepo.ListPaginated(limit, offset, searchTerm, nil)
	case "roles":
		items, total, err = h.roleRepo.ListPaginated(limit, offset, searchTerm)
	case "vpns":
		items, total, err = h.vpnRepo.ListPaginated(limit, offset, searchTerm, "", "", nil, &scope)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported resource type: " + resourceType})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func contains(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}
