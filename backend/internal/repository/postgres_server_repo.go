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

	r.decryptServer(&server)
	return &server, nil
}

func (r *PostgresServerRepo) decryptServer(server *domain.Server) {
	if server == nil {
		return
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

	// Also decrypt preloaded VPN if present
	if server.Vpn != nil {
		if server.Vpn.Password != "" {
			if dec, err := crypto.Decrypt(server.Vpn.Password); err == nil {
				server.Vpn.Password = dec
			}
		}
		if server.Vpn.PrivateKey != "" {
			if dec, err := crypto.Decrypt(server.Vpn.PrivateKey); err == nil {
				server.Vpn.PrivateKey = dec
			}
		}
	}
}

func (r *PostgresServerRepo) List(scope *domain.PermissionScope) ([]domain.Server, error) {
	var servers []domain.Server
	db := applyScope(r.db, scope, "server_tags", "server_id")
	if err := db.Preload("Vpn").Order("created_at DESC").Find(&servers).Error; err != nil {
		return nil, err
	}

	for i := range servers {
		r.decryptServer(&servers[i])
	}

	return servers, nil
}

func (r *PostgresServerRepo) ListPaginated(limit, offset int, searchTerm string, authType string, vpnID *uuid.UUID, scope *domain.PermissionScope) ([]domain.Server, int64, error) {
	var servers []domain.Server
	var total int64
	db := applyScope(r.db, scope, "server_tags", "server_id")

	if searchTerm != "" {
		s := "%" + searchTerm + "%"
		db = db.Where("name ILIKE ? OR host ILIKE ? OR \"user\" ILIKE ?", s, s, s)
	}

	if authType != "" && authType != "ALL" {
		db = db.Where("auth_type = ?", authType)
	}

	if vpnID != nil {
		db = db.Where("vpn_id = ?", vpnID)
	}

	if err := db.Model(&domain.Server{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Preload("Vpn").Limit(limit).Offset(offset).Order("created_at DESC").Find(&servers).Error
	if err != nil {
		return nil, 0, err
	}

	for i := range servers {
		r.decryptServer(&servers[i])
	}

	return servers, total, nil
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
