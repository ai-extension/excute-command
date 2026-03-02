package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
)

type CommandHandler struct {
	repo     domain.CommandRepository
	executor *service.ExecutorService
}

func NewCommandHandler(repo domain.CommandRepository, executor *service.ExecutorService) *CommandHandler {
	return &CommandHandler{
		repo:     repo,
		executor: executor,
	}
}

func (h *CommandHandler) ListCommands(c *gin.Context) {
	namespaceIDStr := c.Query("namespace_id")
	var namespaceID *uuid.UUID
	if namespaceIDStr != "" {
		id, err := uuid.Parse(namespaceIDStr)
		if err == nil {
			namespaceID = &id
		}
	}
	// Get user from context (set by RBACMiddleware)
	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)
	scope := domain.GetPermissionScope(user, "commands", "READ")

	cmds, err := h.repo.List(namespaceID, &scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cmds)
}

func (h *CommandHandler) CreateCommand(c *gin.Context) {
	var cmd domain.Command
	if err := c.ShouldBindJSON(&cmd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cmd.ID = uuid.New()
	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)
	nsIDStr := cmd.NamespaceID.String()
	if !domain.HasPermission(user, "commands", "WRITE", &nsIDStr, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to create command in this namespace"})
		return
	}

	if err := h.repo.Create(&cmd); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, cmd)
}

func (h *CommandHandler) ExecuteCommand(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	// Get user from context
	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)

	go h.executor.ExecuteCommand(c.Request.Context(), id, user)

	c.JSON(http.StatusAccepted, gin.H{"status": "execution started"})
}
