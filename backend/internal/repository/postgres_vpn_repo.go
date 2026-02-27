package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresVpnConfigRepo struct {
	db *gorm.DB
}

func NewPostgresVpnConfigRepo(db *gorm.DB) *PostgresVpnConfigRepo {
	return &PostgresVpnConfigRepo{db: db}
}

func (r *PostgresVpnConfigRepo) Create(vpn *domain.VpnConfig) error {
	return r.db.Create(vpn).Error
}

func (r *PostgresVpnConfigRepo) GetByID(id uuid.UUID) (*domain.VpnConfig, error) {
	var vpn domain.VpnConfig
	if err := r.db.First(&vpn, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &vpn, nil
}

func (r *PostgresVpnConfigRepo) List() ([]domain.VpnConfig, error) {
	var vpns []domain.VpnConfig
	if err := r.db.Find(&vpns).Error; err != nil {
		return nil, err
	}
	return vpns, nil
}

func (r *PostgresVpnConfigRepo) Update(vpn *domain.VpnConfig) error {
	return r.db.Save(vpn).Error
}

func (r *PostgresVpnConfigRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.VpnConfig{}, "id = ?", id).Error
}
