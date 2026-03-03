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

func (s *VpnConfigService) Create(vpn *domain.VpnConfig, user *domain.User) error {
	if vpn.ID == uuid.Nil {
		vpn.ID = uuid.New()
	}
	if user != nil {
		vpn.CreatedBy = &user.ID
		vpn.CreatedByUsername = user.Username
	}
	return s.repo.Create(vpn)
}

func (s *VpnConfigService) GetByID(id uuid.UUID, user *domain.User) (*domain.VpnConfig, error) {
	scope := domain.GetPermissionScope(user, "vpns", "READ")
	return s.repo.GetByID(id, &scope)
}

func (s *VpnConfigService) List(user *domain.User) ([]domain.VpnConfig, error) {
	scope := domain.GetPermissionScope(user, "vpns", "READ")
	return s.repo.List(&scope)
}

func (s *VpnConfigService) ListPaginated(limit, offset int, searchTerm string, authType string, user *domain.User) ([]domain.VpnConfig, int64, error) {
	scope := domain.GetPermissionScope(user, "vpns", "READ")
	return s.repo.ListPaginated(limit, offset, searchTerm, authType, &scope)
}

func (s *VpnConfigService) Update(vpn *domain.VpnConfig, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "vpns", "WRITE")
	_, err := s.repo.GetByID(vpn.ID, &scope)
	if err != nil {
		return err
	}
	return s.repo.Update(vpn)
}

func (s *VpnConfigService) Delete(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "vpns", "DELETE")
	_, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return err
	}
	return s.repo.Delete(id)
}
