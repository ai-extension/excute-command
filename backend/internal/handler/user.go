package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

type UserHandler struct {
	userRepo domain.UserRepository
	roleRepo domain.RoleRepository
}

func NewUserHandler(userRepo domain.UserRepository, roleRepo domain.RoleRepository) *UserHandler {
	return &UserHandler{userRepo: userRepo, roleRepo: roleRepo}
}

func (h *UserHandler) ListUsers(c *gin.Context) {
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
	var roleID *uuid.UUID
	if rIDStr := c.Query("role_id"); rIDStr != "" {
		if id, err := uuid.Parse(rIDStr); err == nil {
			roleID = &id
		}
	}

	users, total, err := h.userRepo.ListPaginated(limit, offset, searchTerm, roleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":  users,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *UserHandler) CreateUser(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Email    string `json:"email"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	user := &domain.User{
		ID:           uuid.New(),
		Username:     input.Username,
		PasswordHash: string(hashedPassword),
		Email:        input.Email,
	}

	if err := h.userRepo.Create(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, user)
}

func (h *UserHandler) UpdateUserRoles(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var input struct {
		RoleIDs []uuid.UUID `json:"role_ids" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	roles, err := h.roleRepo.GetByIDs(input.RoleIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch roles"})
		return
	}

	if err := h.userRepo.SetRoles(userID, roles); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user roles updated successfully"})
}
