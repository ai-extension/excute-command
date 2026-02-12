package domain

import (
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusPending Status = "PENDING"
	StatusRunning Status = "RUNNING"
	StatusSuccess Status = "SUCCESS"
	StatusFailed  Status = "FAILED"
)

type Command struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Status      Status    `json:"status"`
	LastRun     *time.Time `json:"last_run,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Steps       []Step     `json:"steps,omitempty"`
}

type Step struct {
	ID          uuid.UUID `json:"id"`
	CommandID   uuid.UUID `json:"command_id"`
	Order       int       `json:"order"`
	Name        string    `json:"name"`
	CommandText string    `json:"command_text"`
	Status      Status    `json:"status"`
	Output      string    `json:"output"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type CommandRepository interface {
	Create(cmd *Command) error
	GetByID(id uuid.UUID) (*Command, error)
	List() ([]Command, error)
	Update(cmd *Command) error
	Delete(id uuid.UUID) error
}

type StepRepository interface {
	Create(step *Step) error
	GetByCommandID(commandID uuid.UUID) ([]Step, error)
	Update(step *Step) error
	Delete(id uuid.UUID) error
}
