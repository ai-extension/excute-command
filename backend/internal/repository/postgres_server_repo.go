package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/pkg/crypto"
	"gorm.io/gorm"
)

type PostgresServerRepo struct {
	db *gorm.DB
}

func NewPostgresServerRepo(db *gorm.DB) *PostgresServerRepo {
	return &PostgresServerRepo{db: db}
}

func (r *PostgresServerRepo) Create(server *domain.Server) error {
	if server.Password != "" {
		if enc, err := crypto.Encrypt(server.Password); err == nil {
			server.Password = enc
		}
	}
	if server.PrivateKey != "" {
		if enc, err := crypto.Encrypt(server.PrivateKey); err == nil {
			server.PrivateKey = enc
		}
	}
	return r.db.Create(server).Error
}

func (r *PostgresServerRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.Server, error) {
	var server domain.Server
	db := applyScope(r.db, scope, "server_tags", "server_id")
	if err := db.Preload("Vpn").First(&server, "id = ?", id).Error; err != nil {
		return nil, err
	}

	if server.Password != "" {
		if dec, err := crypto.Decrypt(server.Password); err == nil {
			server.Password = dec
		}
	}
	if server.PrivateKey != "" {
		if dec, err := crypto.Decrypt(server.PrivateKey); err == nil {
			server.PrivateKey = dec
		}
	}

	return &server, nil
}

func (r *PostgresServerRepo) List(scope *domain.PermissionScope) ([]domain.Server, error) {
	var servers []domain.Server
	db := applyScope(r.db, scope, "server_tags", "server_id")
	if err := db.Preload("Vpn").Find(&servers).Error; err != nil {
		return nil, err
	}

	for i := range servers {
		if servers[i].Password != "" {
			if dec, err := crypto.Decrypt(servers[i].Password); err == nil {
				servers[i].Password = dec
			}
		}
		if servers[i].PrivateKey != "" {
			if dec, err := crypto.Decrypt(servers[i].PrivateKey); err == nil {
				servers[i].PrivateKey = dec
			}
		}
	}

	return servers, nil
}

func (r *PostgresServerRepo) Update(server *domain.Server) error {
	if server.Password != "" {
		if enc, err := crypto.Encrypt(server.Password); err == nil {
			server.Password = enc
		}
	}
	if server.PrivateKey != "" {
		if enc, err := crypto.Encrypt(server.PrivateKey); err == nil {
			server.PrivateKey = enc
		}
	}
	return r.db.Save(server).Error
}

func (r *PostgresServerRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Server{}, "id = ?", id).Error
}
