package domain

import (
	"encoding/json"

	"github.com/google/uuid"
)

// WidgetAllowsSchedule reports whether the page layout has an ENDPOINT widget bound to
// workflowID with scheduling enabled (allow_schedule). Layout is loose JSON; a parse
// failure yields false (deny). This is the create-time authorization gate for public
// (page-originated) schedules — once created, a schedule runs on the page's behalf for the
// lifetime of its own window regardless of later page changes ("permission follows the page").
func (p *Page) WidgetAllowsSchedule(workflowID uuid.UUID) bool {
	if p.Layout == "" {
		return false
	}
	var doc struct {
		Widgets []struct {
			Type          string `json:"type"`
			WorkflowID    string `json:"workflow_id"`
			AllowSchedule bool   `json:"allow_schedule"`
		} `json:"widgets"`
	}
	if err := json.Unmarshal([]byte(p.Layout), &doc); err != nil {
		return false
	}
	target := workflowID.String()
	for _, w := range doc.Widgets {
		if w.Type == "ENDPOINT" && w.WorkflowID == target && w.AllowSchedule {
			return true
		}
	}
	return false
}
