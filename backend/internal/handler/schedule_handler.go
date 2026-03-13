package handler

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/lib/utils"
	"github.com/user/csm-backend/internal/service"
)

type ScheduleHandler struct {
	service  *service.ScheduleService
	auditLog domain.AuditLogService
}

func NewScheduleHandler(service *service.ScheduleService, auditLog domain.AuditLogService) *ScheduleHandler {
	return &ScheduleHandler{
		service:  service,
		auditLog: auditLog,
	}
}

func (h *ScheduleHandler) List(c *gin.Context) {
	nsID, err := uuid.Parse(c.Param("ns_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
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
	var tagIDs []uuid.UUID
	for _, idStr := range c.QueryArray("tag_ids") {
		if id, err := uuid.Parse(idStr); err == nil {
			tagIDs = append(tagIDs, id)
		}
	}

	var createdBy *uuid.UUID
	if cb := c.Query("created_by"); cb != "" {
		if id, err := uuid.Parse(cb); err == nil {
			createdBy = &id
		}
	}

	user, _ := c.Get("user")
	schedules, total, err := h.service.ListPaginated(nsID, limit, offset, searchTerm, tagIDs, createdBy, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  schedules,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *ScheduleHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user, _ := c.Get("user")
	schedule, err := h.service.GetByID(id, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule not found"})
		return
	}

	c.JSON(http.StatusOK, schedule)
}

func (h *ScheduleHandler) GetExecutions(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user, _ := c.Get("user")
	executions, err := h.service.GetScheduleExecutions(id, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, executions)
}

func (h *ScheduleHandler) Create(c *gin.Context) {
	nsID, err := uuid.Parse(c.Param("ns_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	var req struct {
		Name           string `json:"name" binding:"required"`
		Type           string `json:"type" binding:"required"`
		CronExpression string `json:"cron_expression"`
		NextRunAt      string `json:"next_run_at"`
		Retries        int    `json:"retries"`
		Status         string `json:"status"`
		CatchUp        bool   `json:"catch_up"`
		Workflows      []struct {
			ID     uuid.UUID `json:"id"`
			Inputs string    `json:"inputs"`
		} `json:"workflows" binding:"required"`
		Hooks []domain.WorkflowHook `json:"hooks"`
		Tags  []domain.Tag          `json:"tags"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := "ACTIVE"
	if req.Status != "" {
		status = req.Status
	}

	schedule := &domain.Schedule{
		NamespaceID:    nsID,
		Name:           req.Name,
		Type:           domain.ScheduleType(req.Type),
		CronExpression: req.CronExpression,
		Status:         status,
		Retries:        req.Retries,
		CatchUp:        req.CatchUp,
		Hooks:          req.Hooks,
		Tags:           req.Tags,
	}

	if req.NextRunAt != "" {
		if t, err := parseTimestamp(req.NextRunAt); err == nil {
			schedule.NextRunAt = &t
		}
	}

	var workflowConfigs []domain.ScheduleWorkflow
	for _, w := range req.Workflows {
		workflowConfigs = append(workflowConfigs, domain.ScheduleWorkflow{
			WorkflowID: w.ID,
			Inputs:     w.Inputs,
		})
	}

	uVal, _ := c.Get("user")
	u := uVal.(*domain.User)
	nsIDStr := nsID.String()
	// Schedules usually check against management/schedules permission or namespace if applicable
	if !domain.HasPermission(u, "schedules", "WRITE", &nsIDStr, nil, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied to create schedule in this namespace"})
		return
	}

	if err := h.service.Create(schedule, workflowConfigs, u); err != nil {
		h.auditLog.LogAction(c, "CREATE", "SCHEDULE", "", map[string]string{"name": schedule.Name, "error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "CREATE", "SCHEDULE", schedule.ID.String(), map[string]string{"name": schedule.Name}, "SUCCESS")
	c.JSON(http.StatusCreated, schedule)
}

func (h *ScheduleHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch to set namespace_id in context
	existing, err := h.service.GetByID(id, user)
	if err == nil {
		c.Set("namespace_id", existing.NamespaceID)
	}

	resID := id.String()
	if err := h.service.Delete(id, user); err != nil {
		h.auditLog.LogAction(c, "DELETE", "SCHEDULE", resID, map[string]string{"error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "DELETE", "SCHEDULE", resID, nil, "SUCCESS")
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *ScheduleHandler) ToggleStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)

	// Fetch to set namespace_id in context
	existing, err := h.service.GetByID(id, user)
	if err == nil {
		c.Set("namespace_id", existing.NamespaceID)
	}

	resID := id.String()
	if err := h.service.ToggleStatus(id, user); err != nil {
		h.auditLog.LogAction(c, "TOGGLE_STATUS", "SCHEDULE", resID, map[string]string{"error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "TOGGLE_STATUS", "SCHEDULE", resID, nil, "SUCCESS")
	c.JSON(http.StatusOK, gin.H{"message": "status toggled"})
}

func (h *ScheduleHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Name           string `json:"name" binding:"required"`
		Type           string `json:"type" binding:"required"`
		CronExpression string `json:"cron_expression"`
		NextRunAt      string `json:"next_run_at"`
		Retries        int    `json:"retries"`
		Status         string `json:"status"`
		CatchUp        bool   `json:"catch_up"`
		Workflows      []struct {
			ID     uuid.UUID `json:"id"`
			Inputs string    `json:"inputs"`
		} `json:"workflows" binding:"required"`
		Hooks []domain.WorkflowHook `json:"hooks"`
		Tags  []domain.Tag          `json:"tags"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userVal, _ := c.Get("user")
	user := userVal.(*domain.User)
	schedule, err := h.service.GetByID(id, user)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule not found"})
		return
	}

	schedule.Name = req.Name
	schedule.Type = domain.ScheduleType(req.Type)
	schedule.CronExpression = req.CronExpression
	schedule.Retries = req.Retries
	schedule.CatchUp = req.CatchUp
	if req.Status != "" {
		schedule.Status = req.Status
	}
	schedule.Hooks = req.Hooks
	schedule.Tags = req.Tags

	if req.NextRunAt != "" {
		if t, err := parseTimestamp(req.NextRunAt); err == nil {
			schedule.NextRunAt = &t
		}
	} else {
		schedule.NextRunAt = nil
	}

	var workflowConfigs []domain.ScheduleWorkflow
	for _, w := range req.Workflows {
		workflowConfigs = append(workflowConfigs, domain.ScheduleWorkflow{
			WorkflowID: w.ID,
			Inputs:     w.Inputs,
		})
	}

	// Fetch existing again to calculate diff (or use original fetch if it wasn't mutated yet)
	// Actually, we mutated the object already. To get a clean diff, we should have fetched it twice or copied it.
	// Let's refetch it or use the already fetched one before mutation.
	
	// Re-fetching the unmodified state for diff
	existing, _ := h.service.GetByID(id, user)
	diff := utils.CalculateDiff(existing, schedule)

	if err := h.service.Update(schedule, workflowConfigs, user); err != nil {
		meta := diff
		if meta == nil {
			meta = make(map[string]interface{})
		}
		meta["error"] = err.Error()
		h.auditLog.LogAction(c, "UPDATE", "SCHEDULE", schedule.ID.String(), meta, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "UPDATE", "SCHEDULE", schedule.ID.String(), diff, "SUCCESS")
	c.JSON(http.StatusOK, schedule)
}
func parseTimestamp(ts string) (time.Time, error) {
	log.Printf("[parseTimestamp] Input: %s", ts)
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}

	for _, f := range formats {
		if t, err := time.Parse(f, ts); err == nil {
			utc := t.UTC()
			log.Printf("[parseTimestamp] Matched format %s -> UTC: %v", f, utc)
			return utc, nil
		}
	}

	return time.Time{}, fmt.Errorf("invalid timestamp format: %s", ts)
}
