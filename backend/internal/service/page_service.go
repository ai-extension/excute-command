package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"os"
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

func (s *PageService) CreatePage(page *domain.Page, user *domain.User) error {
	if page.ID == uuid.Nil {
		page.ID = uuid.New()
	}
	if user != nil {
		page.CreatedBy = &user.ID
		page.CreatedByUsername = user.Username
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

func (s *PageService) GetPage(id uuid.UUID, user *domain.User) (*domain.Page, error) {
	return s.GetPageWithAction(id, user, "READ")
}

func (s *PageService) GetPageWithAction(id uuid.UUID, user *domain.User, action string) (*domain.Page, error) {
	scope := domain.GetPermissionScope(user, "pages", action)
	return s.repo.GetByID(id, &scope)
}

func (s *PageService) GetPageBySlug(slug string) (*domain.Page, error) {
	return s.repo.GetBySlug(slug)
}

func (s *PageService) ListPages(namespaceID uuid.UUID, user *domain.User) ([]domain.Page, error) {
	scope := domain.GetPermissionScope(user, "pages", "READ")
	return s.repo.List(namespaceID, &scope)
}

func (s *PageService) ListPagesPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, isPublic *bool, createdBy *uuid.UUID, tagIDs []uuid.UUID, user *domain.User) ([]domain.Page, int64, error) {
	scope := domain.GetPermissionScope(user, "pages", "READ")
	return s.repo.ListPaginated(namespaceID, limit, offset, searchTerm, isPublic, createdBy, tagIDs, &scope)
}

func (s *PageService) UpdatePage(page *domain.Page, user *domain.User) error {
	// Fetch existing to handle password and expiration
	scope := domain.GetPermissionScope(user, "pages", "WRITE")
	existing, err := s.repo.GetByID(page.ID, &scope)
	if err != nil {
		return err
	}

	// Merge updatable fields from partial page into existing record
	if page.Title != "" {
		existing.Title = page.Title
	}
	if page.Description != "" {
		existing.Description = page.Description
	}
	if page.Slug != "" {
		existing.Slug = page.Slug
	}
	existing.IsPublic = page.IsPublic
	existing.TokenTTLMinutes = page.TokenTTLMinutes
	if page.ExpiresAt != nil {
		existing.ExpiresAt = page.ExpiresAt
	}
	if page.Layout != "" {
		existing.Layout = page.Layout
	}
	if len(page.Tags) > 0 {
		existing.Tags = page.Tags
	}

	// Always generate IDs for workflows if they don't exist
	existing.Workflows = page.Workflows
	for i := range existing.Workflows {
		if existing.Workflows[i].ID == uuid.Nil {
			existing.Workflows[i].ID = uuid.New()
		}
		existing.Workflows[i].PageID = existing.ID
	}

	return s.repo.Update(existing)
}

func (s *PageService) DeletePage(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "pages", "DELETE")
	_, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return err
	}
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

// pageTokenSecret returns the HMAC signing key.
// Uses PAGE_TOKEN_SECRET env var; falls back to the page's bcrypt hash.
func pageTokenSecret(page *domain.Page) []byte {
	if s := os.Getenv("PAGE_TOKEN_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte(page.Password)
}

// IssuePageToken creates a signed token for a verified page session.
// Token layout (base64url): [ 8B pageIDHash | 8B expiryUnix ] + "." + HMAC
func (s *PageService) IssuePageToken(page *domain.Page) (token string, expiresAt time.Time, err error) {
	ttl := page.TokenTTLMinutes
	if ttl <= 0 {
		ttl = 15
	}
	expiresAt = time.Now().Add(time.Duration(ttl) * time.Minute)

	payload := make([]byte, 16)
	// First 8 bytes: truncated HMAC of the page-ID (stable identifier w/o exposing the ID)
	h := hmac.New(sha256.New, pageTokenSecret(page))
	h.Write([]byte(page.ID.String()))
	copy(payload[:8], h.Sum(nil)[:8])
	// Next 8 bytes: expiry unix timestamp
	binary.BigEndian.PutUint64(payload[8:], uint64(expiresAt.Unix()))

	mac := hmac.New(sha256.New, pageTokenSecret(page))
	mac.Write(payload)
	sig := mac.Sum(nil)

	token = base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
	return token, expiresAt, nil
}

// ValidatePageToken verifies a token previously issued by IssuePageToken.
func (s *PageService) ValidatePageToken(page *domain.Page, token string) error {
	// Split payload.sig
	dot := -1
	for i, c := range token {
		if c == '.' {
			dot = i
			break
		}
	}
	if dot < 0 {
		return errors.New("invalid token format")
	}

	payload, err := base64.RawURLEncoding.DecodeString(token[:dot])
	if err != nil || len(payload) != 16 {
		return errors.New("invalid token payload")
	}
	sig, err := base64.RawURLEncoding.DecodeString(token[dot+1:])
	if err != nil {
		return errors.New("invalid token signature encoding")
	}

	// Verify HMAC
	mac := hmac.New(sha256.New, pageTokenSecret(page))
	mac.Write(payload)
	expected := mac.Sum(nil)
	if !hmac.Equal(sig, expected) {
		return errors.New("invalid token signature")
	}

	// Check page-ID binding (first 8 bytes)
	h := hmac.New(sha256.New, pageTokenSecret(page))
	h.Write([]byte(page.ID.String()))
	if !hmac.Equal(payload[:8], h.Sum(nil)[:8]) {
		return errors.New("token not issued for this page")
	}

	// Check expiry
	expiry := int64(binary.BigEndian.Uint64(payload[8:]))
	if time.Now().Unix() > expiry {
		return fmt.Errorf("token expired")
	}

	return nil
}
