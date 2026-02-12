package handler

import (
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
	nss, err := h.repo.List()
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

func (h *NamespaceHandler) DeleteNamespace(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.repo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}
