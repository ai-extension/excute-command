package service

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

type PageService struct {
	repo domain.PageRepository
}

func NewPageService(repo domain.PageRepository) *PageService {
	return &PageService{repo: repo}
}

func (s *PageService) CreatePage(page *domain.Page) error {
	if page.ID == uuid.Nil {
		page.ID = uuid.New()
	}

	// Always generate IDs for workflows if they don't exist
	for i := range page.Workflows {
		if page.Workflows[i].ID == uuid.Nil {
			page.Workflows[i].ID = uuid.New()
		}
		page.Workflows[i].PageID = page.ID
	}

	// Password hashing if provided
	if page.Password != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(page.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		page.Password = string(hashed)
	}

	return s.repo.Create(page)
}

func (s *PageService) GetPage(id uuid.UUID) (*domain.Page, error) {
	return s.repo.GetByID(id)
}

func (s *PageService) GetPageBySlug(slug string) (*domain.Page, error) {
	return s.repo.GetBySlug(slug)
}

func (s *PageService) ListPages(namespaceID uuid.UUID) ([]domain.Page, error) {
	return s.repo.List(namespaceID)
}

func (s *PageService) UpdatePage(page *domain.Page) error {
	// Fetch existing to handle password and expiration
	existing, err := s.repo.GetByID(page.ID)
	if err != nil {
		return err
	}

	// If password is being updated (not empty), hash it
	// If it's empty, keep the existing one
	if page.Password != "" {
		if page.Password[:4] != "$2a$" {
			hashed, err := bcrypt.GenerateFromPassword([]byte(page.Password), bcrypt.DefaultCost)
			if err != nil {
				return err
			}
			page.Password = string(hashed)
		}
	} else {
		page.Password = existing.Password
	}

	// Regenerate IDs for workflows to simplify repo implementation (delete/create)
	for i := range page.Workflows {
		if page.Workflows[i].ID == uuid.Nil {
			page.Workflows[i].ID = uuid.New()
		}
		page.Workflows[i].PageID = page.ID
	}

	return s.repo.Update(page)
}

func (s *PageService) DeletePage(id uuid.UUID) error {
	return s.repo.Delete(id)
}

func (s *PageService) ValidatePagePassword(page *domain.Page, password string) error {
	if !page.IsPublic {
		return errors.New("page is not public")
	}

	// Check expiration
	if page.ExpiresAt != nil && page.ExpiresAt.Before(time.Now()) {
		return errors.New("page has expired")
	}

	if page.Password == "" {
		return nil // No password required
	}
	return bcrypt.CompareHashAndPassword([]byte(page.Password), []byte(password))
}
