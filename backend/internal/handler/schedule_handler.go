package handler

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
)

type ScheduleHandler struct {
	service *service.ScheduleService
}

func NewScheduleHandler(service *service.ScheduleService) *ScheduleHandler {
	return &ScheduleHandler{service: service}
}

func (h *ScheduleHandler) List(c *gin.Context) {
	nsID, err := uuid.Parse(c.Param("ns_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid namespace id"})
		return
	}

	schedules, err := h.service.List(nsID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, schedules)
}

func (h *ScheduleHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	schedule, err := h.service.GetByID(id)
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

	executions, err := h.service.GetScheduleExecutions(id)
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

	if err := h.service.Create(schedule, workflowConfigs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, schedule)
}

func (h *ScheduleHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.service.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (h *ScheduleHandler) ToggleStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.service.ToggleStatus(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

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

	schedule, err := h.service.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "schedule not found"})
		return
	}

	schedule.Name = req.Name
	schedule.Type = domain.ScheduleType(req.Type)
	schedule.CronExpression = req.CronExpression
	schedule.Retries = req.Retries
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

	if err := h.service.Update(schedule, workflowConfigs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

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
