package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresCommandRepo struct {
	db *gorm.DB
}

func NewPostgresCommandRepo(db *gorm.DB) *PostgresCommandRepo {
	return &PostgresCommandRepo{db: db}
}

func (r *PostgresCommandRepo) Create(cmd *domain.Command) error {
	return r.db.Create(cmd).Error
}

func (r *PostgresCommandRepo) GetByID(id uuid.UUID) (*domain.Command, error) {
	var cmd domain.Command
	if err := r.db.Preload("Steps").First(&cmd, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &cmd, nil
}

func (r *PostgresCommandRepo) List(namespaceID *uuid.UUID) ([]domain.Command, error) {
	var cmds []domain.Command
	db := r.db
	if namespaceID != nil {
		db = db.Where("namespace_id = ?", namespaceID)
	}
	if err := db.Find(&cmds).Error; err != nil {
		return nil, err
	}
	return cmds, nil
}

func (r *PostgresCommandRepo) Update(cmd *domain.Command) error {
	return r.db.Save(cmd).Error
}

func (r *PostgresCommandRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Command{}, "id = ?", id).Error
}

type PostgresNamespaceRepo struct {
	db *gorm.DB
}

func NewPostgresNamespaceRepo(db *gorm.DB) *PostgresNamespaceRepo {
	return &PostgresNamespaceRepo{db: db}
}

func (r *PostgresNamespaceRepo) Create(ns *domain.Namespace) error {
	return r.db.Create(ns).Error
}

func (r *PostgresNamespaceRepo) GetByID(id uuid.UUID) (*domain.Namespace, error) {
	var ns domain.Namespace
	if err := r.db.First(&ns, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &ns, nil
}

func (r *PostgresNamespaceRepo) List() ([]domain.Namespace, error) {
	var nss []domain.Namespace
	if err := r.db.Find(&nss).Error; err != nil {
		return nil, err
	}
	return nss, nil
}

func (r *PostgresNamespaceRepo) Update(ns *domain.Namespace) error {
	return r.db.Save(ns).Error
}

func (r *PostgresNamespaceRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Namespace{}, "id = ?", id).Error
}

type PostgresStepRepo struct {
	db *gorm.DB
}

func NewPostgresStepRepo(db *gorm.DB) *PostgresStepRepo {
	return &PostgresStepRepo{db: db}
}

func (r *PostgresStepRepo) Create(step *domain.Step) error {
	return r.db.Create(step).Error
}

func (r *PostgresStepRepo) GetByCommandID(commandID uuid.UUID) ([]domain.Step, error) {
	var steps []domain.Step
	if err := r.db.Find(&steps, "command_id = ?", commandID).Order("\"order\" asc").Error; err != nil {
		return nil, err
	}
	return steps, nil
}

func (r *PostgresStepRepo) Update(step *domain.Step) error {
	return r.db.Save(step).Error
}

func (r *PostgresStepRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Step{}, "id = ?", id).Error
}

type PostgresUserRepo struct {
	db *gorm.DB
}

func NewPostgresUserRepo(db *gorm.DB) *PostgresUserRepo {
	return &PostgresUserRepo{db: db}
}

func (r *PostgresUserRepo) Create(user *domain.User) error {
	return r.db.Create(user).Error
}

func (r *PostgresUserRepo) GetByID(id uuid.UUID) (*domain.User, error) {
	var user domain.User
	if err := r.db.Preload("Roles.Permissions").Preload("Permissions").First(&user, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *PostgresUserRepo) GetByUsername(username string) (*domain.User, error) {
	var user domain.User
	if err := r.db.Preload("Roles.Permissions").Preload("Permissions").First(&user, "username = ?", username).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *PostgresUserRepo) List() ([]domain.User, error) {
	var users []domain.User
	if err := r.db.Preload("Roles").Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func (r *PostgresUserRepo) Update(user *domain.User) error {
	return r.db.Save(user).Error
}

func (r *PostgresUserRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.User{}, "id = ?", id).Error
}

func (r *PostgresUserRepo) SetRoles(userID uuid.UUID, roles []domain.Role) error {
	return r.db.Model(&domain.User{ID: userID}).Association("Roles").Replace(roles)
}

type PostgresRoleRepo struct {
	db *gorm.DB
}

func NewPostgresRoleRepo(db *gorm.DB) *PostgresRoleRepo {
	return &PostgresRoleRepo{db: db}
}

func (r *PostgresRoleRepo) Create(role *domain.Role) error {
	return r.db.Create(role).Error
}

func (r *PostgresRoleRepo) GetByID(id uuid.UUID) (*domain.Role, error) {
	var role domain.Role
	if err := r.db.Preload("Permissions").First(&role, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *PostgresRoleRepo) List() ([]domain.Role, error) {
	var roles []domain.Role
	if err := r.db.Preload("Permissions").Find(&roles).Error; err != nil {
		return nil, err
	}
	return roles, nil
}

func (r *PostgresRoleRepo) Update(role *domain.Role) error {
	return r.db.Save(role).Error
}

func (r *PostgresRoleRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Role{}, "id = ?", id).Error
}

func (r *PostgresRoleRepo) GetByIDs(ids []uuid.UUID) ([]domain.Role, error) {
	var roles []domain.Role
	err := r.db.Where("id IN ?", ids).Find(&roles).Error
	return roles, err
}

func (r *PostgresRoleRepo) SetPermissions(roleID uuid.UUID, perms []domain.Permission) error {
	return r.db.Model(&domain.Role{ID: roleID}).Association("Permissions").Replace(perms)
}

type PostgresPermissionRepo struct {
	db *gorm.DB
}

func NewPostgresPermissionRepo(db *gorm.DB) *PostgresPermissionRepo {
	return &PostgresPermissionRepo{db: db}
}

func (r *PostgresPermissionRepo) Create(perm *domain.Permission) error {
	return r.db.Create(perm).Error
}

func (r *PostgresPermissionRepo) List() ([]domain.Permission, error) {
	var perms []domain.Permission
	if err := r.db.Find(&perms).Error; err != nil {
		return nil, err
	}
	return perms, nil
}

func (r *PostgresPermissionRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Permission{}, "id = ?", id).Error
}

func (r *PostgresPermissionRepo) GetByIDs(ids []uuid.UUID) ([]domain.Permission, error) {
	var perms []domain.Permission
	err := r.db.Where("id IN ?", ids).Find(&perms).Error
	return perms, err
}
