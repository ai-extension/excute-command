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

type Namespace struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Command struct {
	ID          uuid.UUID  `json:"id"`
	NamespaceID uuid.UUID  `json:"namespace_id" gorm:"type:uuid;index"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Status      Status     `json:"status"`
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
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type User struct {
	ID           uuid.UUID    `json:"id" gorm:"type:uuid;primaryKey"`
	Username     string       `json:"username" gorm:"uniqueIndex;not null"`
	PasswordHash string       `json:"-" gorm:"not null"`
	Email        string       `json:"email"`
	Roles        []Role       `json:"roles" gorm:"many2many:user_roles;"`
	Permissions  []Permission `json:"permissions" gorm:"many2many:user_permissions;"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

type Role struct {
	ID          uuid.UUID    `json:"id" gorm:"type:uuid;primaryKey"`
	Name        string       `json:"name" gorm:"uniqueIndex;not null"`
	Description string       `json:"description"`
	Permissions []Permission `json:"permissions" gorm:"many2many:role_permissions;"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

type Permission struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	Name      string    `json:"name" gorm:"uniqueIndex;not null"`
	Type      string    `json:"type" gorm:"not null"`   // FUNCTION or RESOURCE
	Action    string    `json:"action" gorm:"not null"` // READ, WRITE, EXECUTE
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UserRepository interface {
	Create(user *User) error
	GetByID(id uuid.UUID) (*User, error)
	GetByUsername(username string) (*User, error)
	List() ([]User, error)
	Update(user *User) error
	Delete(id uuid.UUID) error
	SetRoles(userID uuid.UUID, roles []Role) error
}

type RoleRepository interface {
	Create(role *Role) error
	GetByID(id uuid.UUID) (*Role, error)
	List() ([]Role, error)
	Update(role *Role) error
	Delete(id uuid.UUID) error
	GetByIDs(ids []uuid.UUID) ([]Role, error)
	SetPermissions(roleID uuid.UUID, perms []Permission) error
}

type PermissionRepository interface {
	Create(perm *Permission) error
	List() ([]Permission, error)
	GetByIDs(ids []uuid.UUID) ([]Permission, error)
	Delete(id uuid.UUID) error
}

type CommandRepository interface {
	Create(cmd *Command) error
	GetByID(id uuid.UUID) (*Command, error)
	List(namespaceID *uuid.UUID) ([]Command, error)
	Update(cmd *Command) error
	Delete(id uuid.UUID) error
}

type NamespaceRepository interface {
	Create(ns *Namespace) error
	GetByID(id uuid.UUID) (*Namespace, error)
	List() ([]Namespace, error)
	Update(ns *Namespace) error
	Delete(id uuid.UUID) error
}

type Server struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	Name        string    `json:"name" gorm:"not null"`
	Description string    `json:"description"`
	Host        string    `json:"host" gorm:"not null"`
	Port        int       `json:"port" gorm:"default:22"`
	User        string    `json:"user" gorm:"not null"`
	AuthType    string    `json:"auth_type" gorm:"not null"` // PASSWORD or PUBLIC_KEY
	Password    string    `json:"password,omitempty"`
	PrivateKey  string    `json:"private_key,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type ServerRepository interface {
	Create(server *Server) error
	GetByID(id uuid.UUID) (*Server, error)
	List() ([]Server, error)
	Update(server *Server) error
	Delete(id uuid.UUID) error
}

type StepRepository interface {
	Create(step *Step) error
	GetByCommandID(commandID uuid.UUID) ([]Step, error)
	Update(step *Step) error
	Delete(id uuid.UUID) error
}

// Workflow Management Models

type Workflow struct {
	ID              uuid.UUID          `json:"id" gorm:"type:uuid;primaryKey"`
	NamespaceID     uuid.UUID          `json:"namespace_id" gorm:"type:uuid;index"`
	Name            string             `json:"name" gorm:"not null"`
	Description     string             `json:"description"`
	DefaultServerID uuid.UUID          `json:"default_server_id,omitempty" gorm:"type:uuid"`
	Status          Status             `json:"status"`
	Inputs          []WorkflowInput    `json:"inputs,omitempty" gorm:"foreignKey:WorkflowID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Variables       []WorkflowVariable `json:"variables,omitempty" gorm:"foreignKey:WorkflowID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Groups          []WorkflowGroup    `json:"groups,omitempty" gorm:"foreignKey:WorkflowID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Tags            []Tag              `json:"tags,omitempty" gorm:"many2many:workflow_tags;"`
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`
}

type WorkflowGroup struct {
	ID              uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID      uuid.UUID      `json:"workflow_id" gorm:"type:uuid;index"`
	Name            string         `json:"name" gorm:"not null"`
	Key             string         `json:"key" gorm:"not null;default:''"`
	Condition       string         `json:"condition" gorm:"default:''"`
	DefaultServerID uuid.UUID      `json:"default_server_id,omitempty" gorm:"type:uuid"`
	Order           int            `json:"order"`
	IsParallel      bool           `json:"is_parallel"`
	Status          Status         `json:"status"`
	Steps           []WorkflowStep `json:"steps,omitempty" gorm:"foreignKey:GroupID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

type WorkflowStep struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	GroupID     uuid.UUID `json:"group_id" gorm:"type:uuid;index"`
	ServerID    uuid.UUID `json:"server_id,omitempty" gorm:"type:uuid"` // Optional: If empty, run locally
	Name        string    `json:"name" gorm:"not null"`
	CommandText string    `json:"command_text" gorm:"not null"`
	Order       int       `json:"order"`
	Status      Status    `json:"status"`
	Output      string    `json:"output"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type WorkflowInput struct {
	ID           uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID   uuid.UUID `json:"workflow_id" gorm:"type:uuid;index"`
	Key          string    `json:"key" gorm:"not null"`
	Label        string    `json:"label" gorm:"not null"`
	Type         string    `json:"type" gorm:"not null;default:'input'"` // input, number, or select
	DefaultValue string    `json:"default_value"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type WorkflowVariable struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID uuid.UUID `json:"workflow_id" gorm:"type:uuid;index"`
	Key        string    `json:"key" gorm:"not null"`
	Value      string    `json:"value"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type GlobalVariable struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	NamespaceID uuid.UUID `json:"namespace_id" gorm:"type:uuid;index"`
	Key         string    `json:"key" gorm:"not null"`
	Value       string    `json:"value"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Tag struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	NamespaceID uuid.UUID `json:"namespace_id" gorm:"type:uuid;index"`
	Name        string    `json:"name" gorm:"not null"`
	Color       string    `json:"color" gorm:"not null;default:'#6366f1'"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type ScheduleType string

const (
	ScheduleTypeOneTime   ScheduleType = "ONE_TIME"
	ScheduleTypeRecurring ScheduleType = "RECURRING"
)

type Schedule struct {
	ID                 uuid.UUID          `json:"id" gorm:"type:uuid;primaryKey"`
	NamespaceID        uuid.UUID          `json:"namespace_id" gorm:"type:uuid;index"`
	Name               string             `json:"name" gorm:"not null"`
	Type               ScheduleType       `json:"type" gorm:"not null"`
	CronExpression     string             `json:"cron_expression"`
	NextRunAt          *time.Time         `json:"next_run_at"`
	Status             string             `json:"status" gorm:"default:'ACTIVE'"` // ACTIVE, PAUSED
	Retries            int                `json:"retries" gorm:"default:0"`
	CreatedAt          time.Time          `json:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at"`
	ScheduledWorkflows []ScheduleWorkflow `json:"scheduled_workflows" gorm:"foreignKey:ScheduleID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Tags               []Tag              `json:"tags,omitempty" gorm:"many2many:schedule_tags;"`
	TotalRuns          int                `json:"total_runs" gorm:"-"`
	LastRunStatus      string             `json:"last_run_status" gorm:"-"`
	LastRunAt          *time.Time         `json:"last_run_at" gorm:"-"`
}

type ScheduleWorkflow struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	ScheduleID uuid.UUID `json:"schedule_id" gorm:"type:uuid;index;not null"`
	WorkflowID uuid.UUID `json:"workflow_id" gorm:"type:uuid;index;not null"`
	Inputs     string    `json:"inputs"` // JSON string
	Workflow   *Workflow `json:"workflow,omitempty" gorm:"foreignKey:WorkflowID"`
}

type WorkflowExecution struct {
	ID          uuid.UUID               `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID  uuid.UUID               `json:"workflow_id" gorm:"type:uuid;index"`
	ScheduledID *uuid.UUID              `json:"scheduled_id" gorm:"type:uuid;index"`
	Status      Status                  `json:"status"`
	Inputs      string                  `json:"inputs"` // JSON string
	ExecutedBy  uuid.UUID               `json:"executed_by" gorm:"type:uuid"`
	LogPath     string                  `json:"log_path"`
	StartedAt   time.Time               `json:"started_at"`
	FinishedAt  *time.Time              `json:"finished_at,omitempty"`
	CreatedAt   time.Time               `json:"created_at"`
	UpdatedAt   time.Time               `json:"updated_at"`
	Workflow    *Workflow               `json:"workflow,omitempty" gorm:"foreignKey:WorkflowID"`
	Schedule    *Schedule               `json:"schedule,omitempty" gorm:"foreignKey:ScheduledID"`
	Steps       []WorkflowExecutionStep `json:"steps,omitempty" gorm:"foreignKey:ExecutionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

type WorkflowExecutionStep struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	ExecutionID uuid.UUID  `json:"execution_id" gorm:"type:uuid;index"`
	StepID      uuid.UUID  `json:"step_id" gorm:"type:uuid;index"`
	Name        string     `json:"name"`
	Status      Status     `json:"status"`
	Output      string     `json:"output"`
	StartedAt   time.Time  `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type WorkflowRepository interface {
	Create(wf *Workflow) error
	GetByID(id uuid.UUID) (*Workflow, error)
	List(namespaceID uuid.UUID) ([]Workflow, error)
	Update(wf *Workflow) error
	Delete(id uuid.UUID) error
}

type WorkflowGroupRepository interface {
	Create(group *WorkflowGroup) error
	GetByWorkflowID(workflowID uuid.UUID) ([]WorkflowGroup, error)
	Update(group *WorkflowGroup) error
	Delete(id uuid.UUID) error
}

type WorkflowStepRepository interface {
	Create(step *WorkflowStep) error
	GetByGroupID(groupID uuid.UUID) ([]WorkflowStep, error)
	Update(step *WorkflowStep) error
	Delete(id uuid.UUID) error
}

type WorkflowInputRepository interface {
	Create(input *WorkflowInput) error
	GetByWorkflowID(workflowID uuid.UUID) ([]WorkflowInput, error)
	Update(input *WorkflowInput) error
	Delete(id uuid.UUID) error
}

type WorkflowVariableRepository interface {
	Create(variable *WorkflowVariable) error
	GetByWorkflowID(workflowID uuid.UUID) ([]WorkflowVariable, error)
	Update(variable *WorkflowVariable) error
	Delete(id uuid.UUID) error
}

type WorkflowExecutionRepository interface {
	Create(exec *WorkflowExecution) error
	GetByID(id uuid.UUID) (*WorkflowExecution, error)
	ListByWorkflowID(workflowID uuid.UUID) ([]WorkflowExecution, error)
	ListByWorkflowIDPaginated(workflowID uuid.UUID, limit, offset int) ([]WorkflowExecution, int64, error)
	ListByNamespaceID(namespaceID uuid.UUID) ([]WorkflowExecution, error)
	ListByScheduledID(scheduledID uuid.UUID) ([]WorkflowExecution, error)
	Update(exec *WorkflowExecution) error
	CreateStepResult(stepExec *WorkflowExecutionStep) error
}

type GlobalVariableRepository interface {
	Create(gv *GlobalVariable) error
	GetByID(id uuid.UUID) (*GlobalVariable, error)
	List(namespaceID uuid.UUID) ([]GlobalVariable, error)
	Update(gv *GlobalVariable) error
	Delete(id uuid.UUID) error
}

type ScheduleRepository interface {
	Create(s *Schedule) error
	GetByID(id uuid.UUID) (*Schedule, error)
	List(namespaceID uuid.UUID) ([]Schedule, error)
	Update(s *Schedule) error
	Delete(id uuid.UUID) error
	AddScheduledWorkflow(sw *ScheduleWorkflow) error
	RemoveWorkflows(scheduleID uuid.UUID) error
	ListActive() ([]Schedule, error)
	UpdateStatus(id uuid.UUID, status string) error
}

type TagRepository interface {
	Create(tag *Tag) error
	GetByID(id uuid.UUID) (*Tag, error)
	ListByNamespace(namespaceID uuid.UUID) ([]Tag, error)
	Update(tag *Tag) error
	Delete(id uuid.UUID) error
}
