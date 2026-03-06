package domain

import (
	"context"
	"io"
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusPending   Status = "PENDING"
	StatusRunning   Status = "RUNNING"
	StatusSuccess   Status = "SUCCESS"
	StatusFailed    Status = "FAILED"
	StatusCancelled Status = "CANCELLED"
)

type Namespace struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at" gorm:"<-:create"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type SystemSetting struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	Key       string    `json:"key" gorm:"uniqueIndex;not null"`
	Value     string    `json:"value" gorm:"not null"`
	CreatedAt time.Time `json:"created_at" gorm:"<-:create"`
	UpdatedAt time.Time `json:"updated_at"`
}

type User struct {
	ID             uuid.UUID    `json:"id" gorm:"type:uuid;primaryKey"`
	Username       string       `json:"username" gorm:"uniqueIndex;not null"`
	FullName       string       `json:"full_name"`
	PasswordHash   string       `json:"-" gorm:"default:null"`
	Email          string       `json:"email"`
	SocialProvider string       `json:"social_provider"` // google, facebook, etc.
	SocialID       string       `json:"social_id"`
	AvatarURL      string       `json:"avatar_url"`
	Roles          []Role       `json:"roles" gorm:"many2many:user_roles;"`
	Permissions    []Permission `json:"permissions" gorm:"many2many:user_permissions;"`
	CreatedAt      time.Time    `json:"created_at" gorm:"<-:create"`
	UpdatedAt      time.Time    `json:"updated_at"`
}

type Role struct {
	ID          uuid.UUID        `json:"id" gorm:"type:uuid;primaryKey"`
	Name        string           `json:"name" gorm:"uniqueIndex;not null"`
	Description string           `json:"description"`
	Permissions []RolePermission `json:"permissions" gorm:"foreignKey:RoleID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	CreatedAt   time.Time        `json:"created_at" gorm:"<-:create"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

type RolePermission struct {
	ID           uuid.UUID   `json:"id" gorm:"type:uuid;primaryKey"`
	RoleID       uuid.UUID   `json:"role_id" gorm:"type:uuid;index;not null"`
	PermissionID uuid.UUID   `json:"permission_id" gorm:"type:uuid;index;not null"`
	ResourceID   *string     `json:"resource_id,omitempty"` // nullable UUID string or identifier
	Permission   *Permission `json:"permission,omitempty" gorm:"foreignKey:PermissionID"`
}

type Permission struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	Name      string    `json:"name" gorm:"uniqueIndex;not null"`
	Type      string    `json:"type" gorm:"not null"`   // FUNCTION or RESOURCE
	Action    string    `json:"action" gorm:"not null"` // READ, WRITE, EXECUTE
	CreatedAt time.Time `json:"created_at" gorm:"<-:create"`
	UpdatedAt time.Time `json:"updated_at"`
}

type APIKey struct {
	ID        uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID  `json:"user_id" gorm:"type:uuid;index;not null"`
	Name      string     `json:"name" gorm:"not null"`
	KeyPrefix string     `json:"key_prefix" gorm:"not null"`
	KeyHash   string     `json:"-" gorm:"not null"`
	LastUsed  *time.Time `json:"last_used"`
	Scopes    string     `json:"scopes" gorm:"default:''"`
	CreatedAt time.Time  `json:"created_at" gorm:"<-:create"`
}

type PermissionScope struct {
	IsGlobal            bool
	AllowedItemIDs      []string
	AllowedNamespaceIDs []string
	AllowedTagIDs       []string
}

type UserRepository interface {
	Create(user *User) error
	GetByID(id uuid.UUID) (*User, error)
	GetByUsername(username string) (*User, error)
	List() ([]User, error)
	ListPaginated(limit, offset int, searchTerm string, roleID *uuid.UUID) ([]User, int64, error)
	Update(user *User) error
	Delete(id uuid.UUID) error
	SetRoles(userID uuid.UUID, roles []Role) error
}

type RoleRepository interface {
	Create(role *Role) error
	GetByID(id uuid.UUID) (*Role, error)
	List() ([]Role, error)
	ListPaginated(limit, offset int, searchTerm string) ([]Role, int64, error)
	Update(role *Role) error
	Delete(id uuid.UUID) error
	GetByIDs(ids []uuid.UUID) ([]Role, error)
	SetPermissions(roleID uuid.UUID, rolePerms []RolePermission) error
}

type PermissionRepository interface {
	Create(perm *Permission) error
	List() ([]Permission, error)
	GetByIDs(ids []uuid.UUID) ([]Permission, error)
	Delete(id uuid.UUID) error
}

type APIKeyRepository interface {
	Create(apiKey *APIKey) error
	GetByID(id uuid.UUID) (*APIKey, error)
	GetByHash(hash string) (*APIKey, error)
	ListByUserID(userID uuid.UUID) ([]APIKey, error)
	ListByPrefix(prefix string) ([]APIKey, error)
	Delete(id uuid.UUID) error
	UpdateLastUsed(id uuid.UUID) error
}

type NamespaceRepository interface {
	Create(ns *Namespace) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*Namespace, error)
	List(scope *PermissionScope) ([]Namespace, error)
	Update(ns *Namespace) error
	Delete(id uuid.UUID) error
}

type ConnectionType string

const (
	ConnectionTypeSSH   ConnectionType = "SSH"
	ConnectionTypeLocal ConnectionType = "LOCAL"
)

type ServerConnection interface {
	Execute(ctx context.Context, command string, writers ...io.Writer) (string, error)
	Upload(ctx context.Context, localPath, remotePath string) error
	Download(ctx context.Context, remotePath, localPath string) error
	StartTerminal(ctx context.Context) (io.WriteCloser, io.Reader, io.Reader, error)
	Close() error
}

type Server struct {
	ID                 uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey"`
	Name               string         `json:"name" gorm:"not null"`
	Description        string         `json:"description"`
	ConnectionType     ConnectionType `json:"connection_type" gorm:"not null;default:'SSH'"`
	Host               string         `json:"host" gorm:"not null"`
	Port               int            `json:"port" gorm:"default:22"`
	User               string         `json:"user" gorm:"not null"`
	AuthType           string         `json:"auth_type" gorm:"not null"` // PASSWORD, PUBLIC_KEY, or NONE
	Password           string         `json:"password,omitempty"`
	PrivateKey         string         `json:"private_key,omitempty"`
	VpnID              *uuid.UUID     `json:"vpn_id,omitempty" gorm:"type:uuid"`
	Vpn                *VpnConfig     `json:"vpn,omitempty" gorm:"foreignKey:VpnID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	HostKeyFingerprint string         `json:"host_key_fingerprint,omitempty"` // For strict host key checking (TOFU or manual)
	CreatedBy          *uuid.UUID     `json:"created_by,omitempty" gorm:"type:uuid"`
	CreatedByUsername  string         `json:"created_by_username,omitempty"`
	CreatedAt          time.Time      `json:"created_at" gorm:"<-:create"`
	UpdatedAt          time.Time      `json:"updated_at"`
}

type ServerMetrics struct {
	CPUUsage  float64 `json:"cpu_usage"`
	RAMUsage  float64 `json:"ram_usage"`
	DiskUsage float64 `json:"disk_usage"`
	Uptime    string  `json:"uptime"`
}

type ServerRepository interface {
	Create(server *Server) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*Server, error)
	List(scope *PermissionScope) ([]Server, error)
	ListPaginated(limit, offset int, searchTerm string, authType string, vpnID *uuid.UUID, createdBy *uuid.UUID, scope *PermissionScope) ([]Server, int64, error)
	Update(server *Server) error
	Delete(id uuid.UUID) error
}

type VpnConfig struct {
	ID                 uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	Name               string     `json:"name" gorm:"not null"`
	Description        string     `json:"description"`
	VpnType            string     `json:"vpn_type" gorm:"not null;default:'SSH'"` // SSH, OPENVPN, WIREGUARD
	Host               string     `json:"host" gorm:"not null"`
	Port               int        `json:"port" gorm:"default:22"`
	User               string     `json:"user"`
	AuthType           string     `json:"auth_type"` // PASSWORD or PUBLIC_KEY
	Password           string     `json:"password,omitempty"`
	PrivateKey         string     `json:"private_key,omitempty"`
	ConfigFile         string     `json:"config_file,omitempty"`          // For OpenVPN (.ovpn) or WireGuard (.conf)
	PublicKey          string     `json:"public_key,omitempty"`           // For WireGuard
	SharedKey          string     `json:"shared_key,omitempty"`           // For WireGuard
	HostKeyFingerprint string     `json:"host_key_fingerprint,omitempty"` // For strict host key checking (TOFU or manual)
	CreatedBy          *uuid.UUID `json:"created_by,omitempty" gorm:"type:uuid"`
	CreatedByUsername  string     `json:"created_by_username,omitempty"`
	CreatedAt          time.Time  `json:"created_at" gorm:"<-:create"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type VpnConfigRepository interface {
	Create(vpn *VpnConfig) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*VpnConfig, error)
	List(scope *PermissionScope) ([]VpnConfig, error)
	ListPaginated(limit, offset int, searchTerm string, vpnType string, authType string, createdBy *uuid.UUID, scope *PermissionScope) ([]VpnConfig, int64, error)
	Update(vpn *VpnConfig) error
	Delete(id uuid.UUID) error
}

// Workflow Management Models

type HookType string

const (
	HookTypeBefore       HookType = "BEFORE"
	HookTypeAfterSuccess HookType = "AFTER_SUCCESS"
	HookTypeAfterFailed  HookType = "AFTER_FAILED"
)

type WorkflowHook struct {
	ID               uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID       *uuid.UUID `json:"workflow_id,omitempty" gorm:"type:uuid;index"`
	ScheduleID       *uuid.UUID `json:"schedule_id,omitempty" gorm:"type:uuid;index"`
	TargetWorkflowID uuid.UUID  `json:"target_workflow_id" gorm:"type:uuid;not null"`
	HookType         HookType   `json:"hook_type" gorm:"not null"`
	Inputs           string     `json:"inputs"` // JSON string
	Order            int        `json:"order"`
	TargetWorkflow   *Workflow  `json:"target_workflow,omitempty" gorm:"foreignKey:TargetWorkflowID"`
}

type Workflow struct {
	ID                uuid.UUID          `json:"id" gorm:"type:uuid;primaryKey"`
	NamespaceID       uuid.UUID          `json:"namespace_id" gorm:"type:uuid;index"`
	Name              string             `json:"name" gorm:"not null"`
	Description       string             `json:"description"`
	DefaultServerID   uuid.UUID          `json:"default_server_id,omitempty" gorm:"type:uuid"`
	Status            Status             `json:"status"`
	TimeoutMinutes    int                `json:"timeout_minutes" gorm:"default:15"`
	IsTemplate        bool               `json:"is_template" gorm:"default:false"`
	TriggerSource     string             `json:"trigger_source,omitempty" gorm:"size:50"` // For templates or specific defaults
	Inputs            []WorkflowInput    `json:"inputs,omitempty" gorm:"foreignKey:WorkflowID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Variables         []WorkflowVariable `json:"variables,omitempty" gorm:"foreignKey:WorkflowID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Groups            []WorkflowGroup    `json:"groups,omitempty" gorm:"foreignKey:WorkflowID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Tags              []Tag              `json:"tags,omitempty" gorm:"many2many:workflow_tags;"`
	Files             []WorkflowFile     `json:"files,omitempty" gorm:"foreignKey:WorkflowID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	TargetFolder      string             `json:"target_folder,omitempty" gorm:"default:''"`
	CleanupFiles      bool               `json:"cleanup_files,omitempty" gorm:"default:false"`
	Hooks             []WorkflowHook     `json:"hooks,omitempty" gorm:"foreignKey:WorkflowID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	CreatedBy         *uuid.UUID         `json:"created_by,omitempty" gorm:"type:uuid"`
	CreatedByUsername string             `json:"created_by_username,omitempty"`
	CreatedAt         time.Time          `json:"created_at" gorm:"<-:create"`
	UpdatedAt         time.Time          `json:"updated_at"`
}

type WorkflowFile struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID uuid.UUID `json:"workflow_id" gorm:"type:uuid;index"`
	FileName   string    `json:"file_name" gorm:"not null"`
	FileSize   int64     `json:"file_size" gorm:"not null"`
	LocalPath  string    `json:"local_path" gorm:"not null"`
	TargetPath string    `json:"target_path" gorm:"not null"`
	CreatedAt  time.Time `json:"created_at" gorm:"<-:create"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type WorkflowGroup struct {
	ID                 uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID         uuid.UUID      `json:"workflow_id" gorm:"type:uuid;index"`
	Name               string         `json:"name" gorm:"not null"`
	Key                string         `json:"key" gorm:"not null;default:''"`
	Condition          string         `json:"condition" gorm:"default:''"`
	DefaultServerID    uuid.UUID      `json:"default_server_id,omitempty" gorm:"type:uuid"`
	Order              int            `json:"order"`
	IsParallel         bool           `json:"is_parallel"`
	Status             Status         `json:"status"`
	Steps              []WorkflowStep `json:"steps,omitempty" gorm:"foreignKey:GroupID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	IsCopyEnabled      bool           `json:"is_copy_enabled" gorm:"default:false"`
	CopySourcePath     string         `json:"copy_source_path,omitempty" gorm:"default:''"`
	CopyTargetServerID uuid.UUID      `json:"copy_target_server_id,omitempty" gorm:"type:uuid"`
	CopyTargetPath     string         `json:"copy_target_path,omitempty" gorm:"default:''"`
	ContinueOnFailure  bool           `json:"continue_on_failure" gorm:"default:false"`
	RetryEnabled       bool           `json:"retry_enabled" gorm:"default:false"`
	RetryLimit         int            `json:"retry_limit" gorm:"default:0"`
	RetryDelay         int            `json:"retry_delay" gorm:"default:0"`
	CreatedAt          time.Time      `json:"created_at" gorm:"<-:create"`
	UpdatedAt          time.Time      `json:"updated_at"`
}

type WorkflowStep struct {
	ID                   uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	GroupID              uuid.UUID  `json:"group_id" gorm:"type:uuid;index"`
	ServerID             uuid.UUID  `json:"server_id,omitempty" gorm:"type:uuid"` // Optional: If empty, run locally
	Name                 string     `json:"name" gorm:"not null"`
	ActionType           string     `json:"action_type" gorm:"not null;default:'COMMAND'"` // COMMAND or WORKFLOW
	CommandText          string     `json:"command_text"`
	TargetWorkflowID     *uuid.UUID `json:"target_workflow_id,omitempty" gorm:"type:uuid"`
	TargetWorkflowInputs string     `json:"target_workflow_inputs,omitempty"` // JSON string of inputs for the target workflow
	WaitToFinish         *bool      `json:"wait_to_finish" gorm:"default:true"`
	Order                int        `json:"order"`
	Status               Status     `json:"status"`
	Output               string     `json:"output" gorm:"type:text"`
	CreatedAt            time.Time  `json:"created_at" gorm:"<-:create"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

type WorkflowInput struct {
	ID           uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID   uuid.UUID `json:"workflow_id" gorm:"type:uuid;index"`
	Key          string    `json:"key" gorm:"not null"`
	Label        string    `json:"label" gorm:"not null"`
	Type         string    `json:"type" gorm:"not null;default:'input'"` // input, number, or select
	DefaultValue string    `json:"default_value"`
	Required     bool      `json:"required" gorm:"default:false"`
	CreatedAt    time.Time `json:"created_at" gorm:"<-:create"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type WorkflowVariable struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID uuid.UUID `json:"workflow_id" gorm:"type:uuid;index"`
	Key        string    `json:"key" gorm:"not null"`
	Value      string    `json:"value"`
	CreatedAt  time.Time `json:"created_at" gorm:"<-:create"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type GlobalVariable struct {
	ID                uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	NamespaceID       uuid.UUID  `json:"namespace_id" gorm:"type:uuid;index"`
	Key               string     `json:"key" gorm:"not null"`
	Value             string     `json:"value"`
	Description       string     `json:"description"`
	CreatedBy         *uuid.UUID `json:"created_by,omitempty" gorm:"type:uuid"`
	CreatedByUsername string     `json:"created_by_username,omitempty"`
	CreatedAt         time.Time  `json:"created_at" gorm:"<-:create"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type Tag struct {
	ID                uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	NamespaceID       uuid.UUID  `json:"namespace_id" gorm:"type:uuid;index"`
	Name              string     `json:"name" gorm:"not null"`
	Color             string     `json:"color" gorm:"not null;default:'#6366f1'"`
	CreatedBy         *uuid.UUID `json:"created_by,omitempty" gorm:"type:uuid"`
	CreatedByUsername string     `json:"created_by_username,omitempty"`
	CreatedAt         time.Time  `json:"created_at" gorm:"<-:create"`
	UpdatedAt         time.Time  `json:"updated_at"`
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
	CatchUp            bool               `json:"catch_up" gorm:"default:false"`
	CreatedBy          *uuid.UUID         `json:"created_by,omitempty" gorm:"type:uuid"`
	CreatedByUsername  string             `json:"created_by_username,omitempty"`
	User               *User              `json:"user,omitempty" gorm:"foreignKey:CreatedBy"`
	CreatedAt          time.Time          `json:"created_at" gorm:"<-:create"`
	UpdatedAt          time.Time          `json:"updated_at"`
	ScheduledWorkflows []ScheduleWorkflow `json:"scheduled_workflows" gorm:"foreignKey:ScheduleID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Hooks              []WorkflowHook     `json:"hooks,omitempty" gorm:"foreignKey:ScheduleID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
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
	ID            uuid.UUID               `json:"id" gorm:"type:uuid;primaryKey"`
	WorkflowID    uuid.UUID               `json:"workflow_id" gorm:"type:uuid;index"`
	ScheduledID   *uuid.UUID              `json:"scheduled_id" gorm:"type:uuid;index"`
	PageID        *uuid.UUID              `json:"page_id,omitempty" gorm:"type:uuid;index"`
	TriggerSource string                  `json:"trigger_source" gorm:"size:50;index"` // MANUAL, PAGE, SCHEDULE, HOOK
	Status        Status                  `json:"status"`
	Inputs        string                  `json:"inputs"` // JSON string
	ExecutedBy    *uuid.UUID              `json:"executed_by" gorm:"type:uuid"`
	User          *User                   `json:"user,omitempty" gorm:"foreignKey:ExecutedBy"`
	LogPath       string                  `json:"log_path"`
	StartedAt     time.Time               `json:"started_at"`
	FinishedAt    *time.Time              `json:"finished_at,omitempty"`
	CreatedAt     time.Time               `json:"created_at" gorm:"<-:create"`
	UpdatedAt     time.Time               `json:"updated_at"`
	Workflow      *Workflow               `json:"workflow,omitempty" gorm:"foreignKey:WorkflowID"`
	Schedule      *Schedule               `json:"schedule,omitempty" gorm:"foreignKey:ScheduledID"`
	Page          *Page                   `json:"page,omitempty" gorm:"foreignKey:PageID"`
	Steps         []WorkflowExecutionStep `json:"steps,omitempty" gorm:"foreignKey:ExecutionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
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
	CreatedAt   time.Time  `json:"created_at" gorm:"<-:create"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type WorkflowRepository interface {
	Create(wf *Workflow) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*Workflow, error)
	List(namespaceID uuid.UUID, scope *PermissionScope) ([]Workflow, error)
	ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, tagIDs []uuid.UUID, isTemplate *bool, createdBy *uuid.UUID, scope *PermissionScope) ([]Workflow, int64, error)
	ListGlobalPaginated(limit, offset int, searchTerm string, isTemplate *bool, scope *PermissionScope) ([]Workflow, int64, error)
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
	GetByID(id uuid.UUID, scope *PermissionScope) (*WorkflowExecution, error)
	ListByWorkflowID(workflowID uuid.UUID, scope *PermissionScope) ([]WorkflowExecution, error)
	ListByWorkflowIDPaginated(workflowID uuid.UUID, limit, offset int, scope *PermissionScope) ([]WorkflowExecution, int64, error)
	ListByNamespaceID(namespaceID uuid.UUID, scope *PermissionScope) ([]WorkflowExecution, error)
	ListByNamespaceIDPaginated(namespaceID uuid.UUID, limit, offset int, status string, workflowID *uuid.UUID, scope *PermissionScope) ([]WorkflowExecution, int64, error)
	ListGlobalPaginated(limit, offset int, status string, workflowID *uuid.UUID, scope *PermissionScope) ([]WorkflowExecution, int64, error)
	ListByScheduledID(scheduledID uuid.UUID, scope *PermissionScope) ([]WorkflowExecution, error)
	Update(exec *WorkflowExecution) error
	CreateStepResult(stepExec *WorkflowExecutionStep) error
	GetExecutionAnalytics(namespaceID uuid.UUID, days int, scope *PermissionScope) ([]map[string]interface{}, error)
}

type GlobalVariableRepository interface {
	Create(gv *GlobalVariable) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*GlobalVariable, error)
	List(namespaceID uuid.UUID, scope *PermissionScope) ([]GlobalVariable, error)
	ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, createdBy *uuid.UUID, scope *PermissionScope) ([]GlobalVariable, int64, error)
	ListGlobalPaginated(limit, offset int, searchTerm string, scope *PermissionScope) ([]GlobalVariable, int64, error)
	Update(gv *GlobalVariable) error
	Delete(id uuid.UUID) error
}

type ScheduleRepository interface {
	Create(s *Schedule) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*Schedule, error)
	List(namespaceID uuid.UUID, scope *PermissionScope) ([]Schedule, error)
	ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, tagIDs []uuid.UUID, createdBy *uuid.UUID, scope *PermissionScope) ([]Schedule, int64, error)
	ListGlobalPaginated(limit, offset int, searchTerm string, scope *PermissionScope) ([]Schedule, int64, error)
	Update(s *Schedule) error
	Delete(id uuid.UUID) error
	AddScheduledWorkflow(sw *ScheduleWorkflow) error
	RemoveWorkflows(scheduleID uuid.UUID) error
	ListActive() ([]Schedule, error)
	UpdateStatus(id uuid.UUID, status string) error
}

type WorkflowFileRepository interface {
	Create(file *WorkflowFile) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*WorkflowFile, error)
	GetByWorkflowID(workflowID uuid.UUID, scope *PermissionScope) ([]WorkflowFile, error)
	Update(file *WorkflowFile) error
	Delete(id uuid.UUID) error
}

type Page struct {
	ID                uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey"`
	NamespaceID       uuid.UUID      `json:"namespace_id" gorm:"type:uuid;index"`
	Title             string         `json:"title" gorm:"not null"`
	Description       string         `json:"description"`
	Slug              string         `json:"slug" gorm:"uniqueIndex;not null"`
	IsPublic          bool           `json:"is_public" gorm:"default:false"`
	Password          string         `json:"password,omitempty" gorm:"column:password"`
	TokenTTLMinutes   int            `json:"token_ttl_minutes" gorm:"default:15"`
	ExpiresAt         *time.Time     `json:"expires_at" gorm:"index"`
	Layout            string         `json:"layout" gorm:"type:text"`
	Workflows         []PageWorkflow `json:"workflows,omitempty" gorm:"foreignKey:PageID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	CreatedBy         *uuid.UUID     `json:"created_by,omitempty" gorm:"type:uuid"`
	CreatedByUsername string         `json:"created_by_username,omitempty"`
	CreatedAt         time.Time      `json:"created_at" gorm:"<-:create"`
	UpdatedAt         time.Time      `json:"updated_at"`
}

type PageWorkflow struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	PageID     uuid.UUID `json:"page_id" gorm:"type:uuid;index"`
	WorkflowID uuid.UUID `json:"workflow_id" gorm:"type:uuid;index"`
	Order      int       `json:"order"`
	Label      string    `json:"label"`    // Custom label for the button
	Style      string    `json:"style"`    // Button style (color, etc.)
	ShowLog    bool      `json:"show_log"` // Whether to show execution logs
	Workflow   *Workflow `json:"workflow,omitempty" gorm:"foreignKey:WorkflowID"`
}

type PageRepository interface {
	Create(page *Page) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*Page, error)
	GetBySlug(slug string) (*Page, error) // Public slug lookup doesn't need scope
	List(namespaceID uuid.UUID, scope *PermissionScope) ([]Page, error)
	ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, isPublic *bool, createdBy *uuid.UUID, scope *PermissionScope) ([]Page, int64, error)
	ListGlobalPaginated(limit, offset int, searchTerm string, isPublic *bool, scope *PermissionScope) ([]Page, int64, error)
	Update(page *Page) error
	Delete(id uuid.UUID) error
}

type TagRepository interface {
	Create(tag *Tag) error
	GetByID(id uuid.UUID, scope *PermissionScope) (*Tag, error)
	ListByNamespace(namespaceID uuid.UUID, scope *PermissionScope) ([]Tag, error)
	ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, createdBy *uuid.UUID, scope *PermissionScope) ([]Tag, int64, error)
	ListGlobalPaginated(limit, offset int, searchTerm string, scope *PermissionScope) ([]Tag, int64, error)
	Update(tag *Tag) error
	Delete(id uuid.UUID) error
}

type SystemSettingRepository interface {
	GetByKey(key string) (*SystemSetting, error)
	Upsert(setting *SystemSetting) error
	List() ([]SystemSetting, error)
}
