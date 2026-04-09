package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/pkg/crypto"
	"gorm.io/gorm"
)

type PostgresVpnConfigRepo struct {
	db *gorm.DB
}

func NewPostgresVpnConfigRepo(db *gorm.DB) *PostgresVpnConfigRepo {
	return &PostgresVpnConfigRepo{db: db}
}

func (r *PostgresVpnConfigRepo) Create(vpn *domain.VpnConfig) error {
	if vpn.Password != "" {
		if enc, err := crypto.Encrypt(vpn.Password); err == nil {
			vpn.Password = enc
		}
	}
	if vpn.PrivateKey != "" {
		if enc, err := crypto.Encrypt(vpn.PrivateKey); err == nil {
			vpn.PrivateKey = enc
		}
	}
	if vpn.ConfigFile != "" {
		if enc, err := crypto.Encrypt(vpn.ConfigFile); err == nil {
			vpn.ConfigFile = enc
		}
	}
	if vpn.SharedKey != "" {
		if enc, err := crypto.Encrypt(vpn.SharedKey); err == nil {
			vpn.SharedKey = enc
		}
	}
	return r.db.Create(vpn).Error
}

func (r *PostgresVpnConfigRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.VpnConfig, error) {
	var vpn domain.VpnConfig
	db := applyScope(r.db, scope, "", "")
	if err := db.Take(&vpn, "id = ?", id).Error; err != nil {
		return nil, err
	}

	if vpn.Password != "" {
		if dec, err := crypto.Decrypt(vpn.Password); err == nil {
			vpn.Password = dec
		}
	}
	if vpn.PrivateKey != "" {
		if dec, err := crypto.Decrypt(vpn.PrivateKey); err == nil {
			vpn.PrivateKey = dec
		}
	}
	if vpn.ConfigFile != "" {
		if dec, err := crypto.Decrypt(vpn.ConfigFile); err == nil {
			vpn.ConfigFile = dec
		}
	}
	if vpn.SharedKey != "" {
		if dec, err := crypto.Decrypt(vpn.SharedKey); err == nil {
			vpn.SharedKey = dec
		}
	}

	return &vpn, nil
}

func (r *PostgresVpnConfigRepo) List(scope *domain.PermissionScope) ([]domain.VpnConfig, error) {
	var vpns []domain.VpnConfig
	db := applyScope(r.db, scope, "", "")
	if err := db.Order("created_at DESC").Find(&vpns).Error; err != nil {
		return nil, err
	}

	for i := range vpns {
		if vpns[i].Password != "" {
			if dec, err := crypto.Decrypt(vpns[i].Password); err == nil {
				vpns[i].Password = dec
			}
		}
		if vpns[i].PrivateKey != "" {
			if dec, err := crypto.Decrypt(vpns[i].PrivateKey); err == nil {
				vpns[i].PrivateKey = dec
			}
		}
		if vpns[i].ConfigFile != "" {
			if dec, err := crypto.Decrypt(vpns[i].ConfigFile); err == nil {
				vpns[i].ConfigFile = dec
			}
		}
		if vpns[i].SharedKey != "" {
			if dec, err := crypto.Decrypt(vpns[i].SharedKey); err == nil {
				vpns[i].SharedKey = dec
			}
		}
	}

	return vpns, nil
}

func (r *PostgresVpnConfigRepo) ListPaginated(limit, offset int, searchTerm string, vpnType string, authType string, createdBy *uuid.UUID, scope *domain.PermissionScope) ([]domain.VpnConfig, int64, error) {
	var vpns []domain.VpnConfig
	var total int64
	db := applyScope(r.db, scope, "", "")

	if searchTerm != "" {
		s := "%" + searchTerm + "%"
		db = db.Where("name ILIKE ? OR host ILIKE ? OR \"user\" ILIKE ?", s, s, s)
	}

	if vpnType != "" && vpnType != "ALL" {
		db = db.Where("vpn_type = ?", vpnType)
	}

	if authType != "" && authType != "ALL" {
		db = db.Where("auth_type = ?", authType)
	}

	if createdBy != nil {
		db = db.Where("created_by = ?", createdBy)
	}

	if err := db.Model(&domain.VpnConfig{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Limit(limit).Offset(offset).Order("created_at DESC").Find(&vpns).Error
	if err != nil {
		return nil, 0, err
	}

	for i := range vpns {
		if vpns[i].Password != "" {
			if dec, err := crypto.Decrypt(vpns[i].Password); err == nil {
				vpns[i].Password = dec
			}
		}
		if vpns[i].PrivateKey != "" {
			if dec, err := crypto.Decrypt(vpns[i].PrivateKey); err == nil {
				vpns[i].PrivateKey = dec
			}
		}
		if vpns[i].ConfigFile != "" {
			if dec, err := crypto.Decrypt(vpns[i].ConfigFile); err == nil {
				vpns[i].ConfigFile = dec
			}
		}
		if vpns[i].SharedKey != "" {
			if dec, err := crypto.Decrypt(vpns[i].SharedKey); err == nil {
				vpns[i].SharedKey = dec
			}
		}
	}

	return vpns, total, nil
}

func (r *PostgresVpnConfigRepo) Update(vpn *domain.VpnConfig) error {
	if vpn.Password != "" {
		if enc, err := crypto.Encrypt(vpn.Password); err == nil {
			vpn.Password = enc
		}
	}
	if vpn.PrivateKey != "" {
		if enc, err := crypto.Encrypt(vpn.PrivateKey); err == nil {
			vpn.PrivateKey = enc
		}
	}
	if vpn.ConfigFile != "" {
		if enc, err := crypto.Encrypt(vpn.ConfigFile); err == nil {
			vpn.ConfigFile = enc
		}
	}
	if vpn.SharedKey != "" {
		if enc, err := crypto.Encrypt(vpn.SharedKey); err == nil {
			vpn.SharedKey = enc
		}
	}
	return r.db.Save(vpn).Error
}

func (r *PostgresVpnConfigRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.VpnConfig{}, "id = ?", id).Error
}
