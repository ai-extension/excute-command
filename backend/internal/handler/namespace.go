package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type NamespaceHandler struct {
	repo domain.NamespaceRepository
}

func NewNamespaceHandler(repo domain.NamespaceRepository) *NamespaceHandler {
	return &NamespaceHandler{repo: repo}
}

func (h *NamespaceHandler) ListNamespaces(c *gin.Context) {
	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)
	scope := domain.GetPermissionScope(user, "namespaces", "READ")

	nss, err := h.repo.List(&scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, nss)
}

func (h *NamespaceHandler) CreateNamespace(c *gin.Context) {
	var ns domain.Namespace
	if err := c.ShouldBindJSON(&ns); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ns.ID = uuid.New()
	if err := h.repo.Create(&ns); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, ns)
}

func (h *NamespaceHandler) UpdateNamespace(c *gin.Context) {
	fmt.Printf("DEBUG: UpdateNamespace hit with ID: %s\n", c.Param("id"))
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var ns domain.Namespace
	if err := c.ShouldBindJSON(&ns); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)
	scope := domain.GetPermissionScope(user, "namespaces", "READ")

	existing, err := h.repo.GetByID(id, &scope)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "namespace not found"})
		return
	}

	existing.Name = ns.Name
	existing.Description = ns.Description

	if err := h.repo.Update(existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, existing)
}

func (h *NamespaceHandler) DeleteNamespace(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	currentUser, _ := c.Get("user")
	user, _ := currentUser.(*domain.User)
	scope := domain.GetPermissionScope(user, "namespaces", "READ")

	// Fetch all namespaces to check count and find the one being deleted
	nss, err := h.repo.List(&scope)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(nss) <= 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete the last namespace"})
		return
	}

	var target *domain.Namespace
	for i := range nss {
		if nss[i].ID == id {
			target = &nss[i]
			break
		}
	}

	if target == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "namespace not found"})
		return
	}

	if target.Name == "Default" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete the Default namespace"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
