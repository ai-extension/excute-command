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

type StepRepository interface {
	Create(step *Step) error
	GetByCommandID(commandID uuid.UUID) ([]Step, error)
	Update(step *Step) error
	Delete(id uuid.UUID) error
}
