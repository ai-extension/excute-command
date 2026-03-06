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

func (s *TagService) Create(tag *domain.Tag, user *domain.User) error {
	tag.ID = uuid.New()
	if tag.Color == "" {
		tag.Color = "#6366f1"
	}
	if user != nil {
		tag.CreatedBy = &user.ID
		tag.CreatedByUsername = user.Username
	}
	return s.repo.Create(tag)
}

func (s *TagService) GetByID(id uuid.UUID, user *domain.User) (*domain.Tag, error) {
	scope := domain.GetPermissionScope(user, "tags", "READ")
	return s.repo.GetByID(id, &scope)
}

func (s *TagService) ListByNamespace(namespaceID uuid.UUID, user *domain.User) ([]domain.Tag, error) {
	scope := domain.GetPermissionScope(user, "tags", "READ")
	return s.repo.ListByNamespace(namespaceID, &scope)
}

func (s *TagService) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, createdBy *uuid.UUID, user *domain.User) ([]domain.Tag, int64, error) {
	scope := domain.GetPermissionScope(user, "tags", "READ")
	return s.repo.ListPaginated(namespaceID, limit, offset, searchTerm, createdBy, &scope)
}

func (s *TagService) Update(tag *domain.Tag, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "tags", "READ") // Need read to fetch existing
	existing, err := s.repo.GetByID(tag.ID, &scope)
	if err != nil {
		return err
	}
	existing.Name = tag.Name
	if tag.Color != "" {
		existing.Color = tag.Color
	}
	return s.repo.Update(existing)
}

func (s *TagService) Delete(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "tags", "DELETE")
	_, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return err
	}
	return s.repo.Delete(id)
}
