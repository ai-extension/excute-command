package service

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type VpnConfigService struct {
	repo domain.VpnConfigRepository
}

func NewVpnConfigService(repo domain.VpnConfigRepository) *VpnConfigService {
	return &VpnConfigService{repo: repo}
}

func (s *VpnConfigService) Create(vpn *domain.VpnConfig) error {
	if vpn.ID == uuid.Nil {
		vpn.ID = uuid.New()
	}
	return s.repo.Create(vpn)
}

func (s *VpnConfigService) GetByID(id uuid.UUID) (*domain.VpnConfig, error) {
	return s.repo.GetByID(id)
}

func (s *VpnConfigService) List() ([]domain.VpnConfig, error) {
	return s.repo.List()
}

func (s *VpnConfigService) Update(vpn *domain.VpnConfig) error {
	return s.repo.Update(vpn)
}

func (s *VpnConfigService) Delete(id uuid.UUID) error {
	return s.repo.Delete(id)
}
