package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// IsExpired reports whether the page has an expiry that has already passed.
func (p *Page) IsExpired(now time.Time) bool {
	return p.ExpiresAt != nil && p.ExpiresAt.Before(now)
}

// HasWorkflow reports whether workflowID is attached to this page.
func (p *Page) HasWorkflow(workflowID uuid.UUID) bool {
	for _, pw := range p.Workflows {
		if pw.WorkflowID == workflowID {
			return true
		}
	}
	return false
}

// WidgetAllowsSchedule reports whether the page layout has an ENDPOINT widget bound to
// workflowID with scheduling enabled (allow_schedule). Layout is loose JSON; a parse
// failure yields false (deny).
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

// CanPublicSchedule reports whether a page-originated schedule for workflowID is still
// allowed to run: the page must be public, not expired, still own the workflow, and its
// ENDPOINT widget must still opt into scheduling. Used both when creating a public schedule
// and re-checked at fire time so a schedule can't outlive the access that created it.
func (p *Page) CanPublicSchedule(workflowID uuid.UUID, now time.Time) bool {
	return p.IsPublic &&
		!p.IsExpired(now) &&
		p.HasWorkflow(workflowID) &&
		p.WidgetAllowsSchedule(workflowID)
}
