package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/service"
)

type AuditLogHandler struct {
	service *service.AuditLogService
}

func NewAuditLogHandler(s *service.AuditLogService) *AuditLogHandler {
	return &AuditLogHandler{service: s}
}

func (h *AuditLogHandler) ListAuditLogs(c *gin.Context) {
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

	var namespaceID *uuid.UUID
	if ns := c.Query("namespace_id"); ns != "" {
		if id, err := uuid.Parse(ns); err == nil {
			namespaceID = &id
		}
	}

	var userID *uuid.UUID
	if u := c.Query("user_id"); u != "" {
		if id, err := uuid.Parse(u); err == nil {
			userID = &id
		}
	}

	var resourceType *string
	if rt := c.Query("resource_type"); rt != "" {
		resourceType = &rt
	}

	var resourceID *string
	if ri := c.Query("resource_id"); ri != "" {
		resourceID = &ri
	}

	var username *string
	if u := c.Query("username"); u != "" {
		username = &u
	}

	var action *string
	if a := c.Query("action"); a != "" {
		action = &a
	}

	logs, total, err := h.service.ListLogs(namespaceID, resourceType, resourceID, userID, username, action, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  logs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *AuditLogHandler) ListResourceLogs(c *gin.Context) {
	resType := c.Param("type")
	resID := c.Param("id")

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

	logs, total, err := h.service.ListLogs(nil, &resType, &resID, nil, nil, nil, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  logs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}
