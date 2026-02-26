package service

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type GlobalVariableService struct {
	repo domain.GlobalVariableRepository
}

func NewGlobalVariableService(repo domain.GlobalVariableRepository) *GlobalVariableService {
	return &GlobalVariableService{repo: repo}
}

func (s *GlobalVariableService) Create(gv *domain.GlobalVariable) error {
	gv.ID = uuid.New()
	return s.repo.Create(gv)
}

func (s *GlobalVariableService) GetByID(id uuid.UUID) (*domain.GlobalVariable, error) {
	return s.repo.GetByID(id)
}

func (s *GlobalVariableService) List(namespaceID uuid.UUID) ([]domain.GlobalVariable, error) {
	return s.repo.List(namespaceID)
}

func (s *GlobalVariableService) Update(gv *domain.GlobalVariable) error {
	return s.repo.Update(gv)
}

func (s *GlobalVariableService) Delete(id uuid.UUID) error {
	return s.repo.Delete(id)
}
