package service

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type AuditLogService struct {
	repo      domain.AuditLogRepository
	logChan   chan domain.AuditLog
	batchSize int
}

func NewAuditLogService(repo domain.AuditLogRepository) *AuditLogService {
	s := &AuditLogService{
		repo:      repo,
		logChan:   make(chan domain.AuditLog, 1000),
		batchSize: 50,
	}

	go s.worker()

	return s
}

func (s *AuditLogService) LogAction(ctx context.Context, action string, resourceType string, resourceID string, metadata interface{}, status string) {
	var user *domain.User
	var namespaceID *uuid.UUID
	var ipAddress string

	if gc, ok := ctx.(*gin.Context); ok {
		if u, exists := gc.Get("user"); exists {
			user, _ = u.(*domain.User)
		}
		if nsID, exists := gc.Get("namespace_id"); exists {
			if id, ok := nsID.(uuid.UUID); ok {
				namespaceID = &id
			}
		}
		ipAddress = gc.ClientIP()
	}

	var resIDPtr *string
	if resourceID != "" {
		resIDPtr = &resourceID
	}

	s.logInternal(user, namespaceID, resourceType, resIDPtr, action, status, metadata, ipAddress)
}

// Internal version that takes everything explicitly
func (s *AuditLogService) logInternal(user *domain.User, namespaceID *uuid.UUID, resourceType string, resourceID *string, action string, status string, metadata interface{}, ipAddress string) {
	entry := domain.AuditLog{
		ID:           uuid.New(),
		Timestamp:    time.Now(),
		NamespaceID:  namespaceID,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Status:       status,
		IPAddress:    ipAddress,
		Metadata:     "{}",
	}

	if user != nil {
		entry.UserID = &user.ID
		entry.Username = user.Username
	}

	if metadata != nil {
		if b, err := json.Marshal(metadata); err == nil {
			entry.Metadata = string(b)
		}
	}

	select {
	case s.logChan <- entry:
	default:
		log.Println("[AuditLogService] Warning: Log channel full, dropping log entry")
	}
}

func (s *AuditLogService) worker() {
	batch := make([]domain.AuditLog, 0, s.batchSize)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	flush := func() {
		if len(batch) > 0 {
			if err := s.repo.CreateBatch(batch); err != nil {
				log.Printf("[AuditLogService] Error saving batch: %v", err)
			}
			batch = make([]domain.AuditLog, 0, s.batchSize)
		}
	}

	for {
		select {
		case entry, ok := <-s.logChan:
			if !ok {
				flush()
				return
			}
			batch = append(batch, entry)
			if len(batch) >= s.batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (s *AuditLogService) ListLogs(namespaceID *uuid.UUID, resourceType *string, resourceID *string, userID *uuid.UUID, username *string, action *string, limit, offset int) ([]domain.AuditLog, int64, error) {
	return s.repo.List(namespaceID, resourceType, resourceID, userID, username, action, limit, offset)
}

func (s *AuditLogService) Cleanup(days int) error {
	return s.repo.DeleteOldLogs(days)
}
