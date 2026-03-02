package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresServerRepo struct {
	db *gorm.DB
}

func NewPostgresServerRepo(db *gorm.DB) *PostgresServerRepo {
	return &PostgresServerRepo{db: db}
}

func (r *PostgresServerRepo) Create(server *domain.Server) error {
	return r.db.Create(server).Error
}

func (r *PostgresServerRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.Server, error) {
	var server domain.Server
	db := applyScope(r.db, scope, "server_tags", "server_id")
	if err := db.Preload("Vpn").First(&server, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &server, nil
}

func (r *PostgresServerRepo) List(scope *domain.PermissionScope) ([]domain.Server, error) {
	var servers []domain.Server
	db := applyScope(r.db, scope, "server_tags", "server_id")
	if err := db.Preload("Vpn").Find(&servers).Error; err != nil {
		return nil, err
	}
	return servers, nil
}

func (r *PostgresServerRepo) Update(server *domain.Server) error {
	return r.db.Save(server).Error
}

func (r *PostgresServerRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Server{}, "id = ?", id).Error
}
