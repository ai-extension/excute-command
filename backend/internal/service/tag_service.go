package service

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type TagService struct {
	repo domain.TagRepository
}

func NewTagService(repo domain.TagRepository) *TagService {
	return &TagService{repo: repo}
}

func (s *TagService) Create(tag *domain.Tag) error {
	tag.ID = uuid.New()
	if tag.Color == "" {
		tag.Color = "#6366f1"
	}
	return s.repo.Create(tag)
}

func (s *TagService) GetByID(id uuid.UUID) (*domain.Tag, error) {
	return s.repo.GetByID(id)
}

func (s *TagService) ListByNamespace(namespaceID uuid.UUID) ([]domain.Tag, error) {
	return s.repo.ListByNamespace(namespaceID)
}

func (s *TagService) Update(tag *domain.Tag) error {
	existing, err := s.repo.GetByID(tag.ID)
	if err != nil {
		return err
	}
	existing.Name = tag.Name
	if tag.Color != "" {
		existing.Color = tag.Color
	}
	return s.repo.Update(existing)
}

func (s *TagService) Delete(id uuid.UUID) error {
	return s.repo.Delete(id)
}
