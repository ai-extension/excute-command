package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresNamespaceRepo struct {
	db *gorm.DB
}

func NewPostgresNamespaceRepo(db *gorm.DB) *PostgresNamespaceRepo {
	return &PostgresNamespaceRepo{db: db}
}

func applyScope(db *gorm.DB, scope *domain.PermissionScope, tagJoinTable, resourceIDCol string) *gorm.DB {
	if scope == nil || scope.IsGlobal {
		return db
	}

	conds := db.Where("id IN ?", scope.AllowedItemIDs)

	if len(scope.AllowedNamespaceIDs) > 0 {
		conds = conds.Or("namespace_id IN ?", scope.AllowedNamespaceIDs)
	}

	if tagJoinTable != "" && resourceIDCol != "" && len(scope.AllowedTagIDs) > 0 {
		subQuery := db.Table(tagJoinTable).Select(resourceIDCol).Where("tag_id IN ?", scope.AllowedTagIDs)
		conds = conds.Or("id IN (?)", subQuery)
	}

	return db.Where(conds)
}

func (r *PostgresNamespaceRepo) Create(ns *domain.Namespace) error {
	return r.db.Create(ns).Error
}

func (r *PostgresNamespaceRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.Namespace, error) {
	var ns domain.Namespace
	db := r.db
	if scope != nil && !scope.IsGlobal {
		// Namespaces only filter by their own IDs
		db = db.Where("id IN ?", scope.AllowedItemIDs)
	}
	if err := db.First(&ns, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &ns, nil
}

func (r *PostgresNamespaceRepo) List(scope *domain.PermissionScope) ([]domain.Namespace, error) {
	var nss []domain.Namespace
	db := r.db
	if scope != nil && !scope.IsGlobal {
		db = db.Where("id IN ?", scope.AllowedItemIDs)
	}
	if err := db.Find(&nss).Error; err != nil {
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
	if err := r.db.Preload("Roles.Permissions.Permission").Preload("Permissions").First(&user, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *PostgresUserRepo) GetByUsername(username string) (*domain.User, error) {
	var user domain.User
	if err := r.db.Preload("Roles.Permissions.Permission").Preload("Permissions").First(&user, "username = ?", username).Error; err != nil {
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
	if err := r.db.Preload("Permissions.Permission").First(&role, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *PostgresRoleRepo) List() ([]domain.Role, error) {
	var roles []domain.Role
	if err := r.db.Preload("Permissions.Permission").Find(&roles).Error; err != nil {
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

func (r *PostgresRoleRepo) SetPermissions(roleID uuid.UUID, rolePerms []domain.RolePermission) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Clear existing permissions
		if err := tx.Where("role_id = ?", roleID).Delete(&domain.RolePermission{}).Error; err != nil {
			return err
		}
		// Insert new permissions
		for _, rp := range rolePerms {
			rp.RoleID = roleID
			if err := tx.Create(&rp).Error; err != nil {
				return err
			}
		}
		return nil
	})
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
