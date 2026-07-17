package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresAuditLogRepo struct {
	db *gorm.DB
}

func NewPostgresAuditLogRepo(db *gorm.DB) *PostgresAuditLogRepo {
	return &PostgresAuditLogRepo{db: db}
}

func (r *PostgresAuditLogRepo) Create(log *domain.AuditLog) error {
	return r.db.Create(log).Error
}

func (r *PostgresAuditLogRepo) CreateBatch(logs []domain.AuditLog) error {
	if len(logs) == 0 {
		return nil
	}
	return r.db.CreateInBatches(logs, 100).Error
}

func (r *PostgresAuditLogRepo) List(namespaceID *uuid.UUID, resourceType *string, resourceID *string, userID *uuid.UUID, username *string, action *string, limit, offset int) ([]domain.AuditLog, int64, error) {
	var logs []domain.AuditLog
	var total int64

	db := r.db.Model(&domain.AuditLog{})

	if namespaceID != nil {
		db = db.Where("namespace_id = ?", namespaceID)
	}

	if resourceType != nil && *resourceType != "" {
		db = db.Where("resource_type = ?", *resourceType)
	}

	if resourceID != nil && *resourceID != "" {
		db = db.Where("resource_id = ?", *resourceID)
	}

	if userID != nil {
		db = db.Where("user_id = ?", userID)
	}

	if username != nil && *username != "" {
		db = db.Where("username ILIKE ?", "%"+*username+"%")
	}

	if action != nil && *action != "" {
		db = db.Where("action = ?", *action)
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := db.Limit(limit).Offset(offset).Order("timestamp DESC").Find(&logs).Error
	return logs, total, err
}

// deleteAuditBatchSize bounds each cleanup DELETE so a large backlog is drained in
// chunks, keeping lock duration short instead of one table-wide delete.
const deleteAuditBatchSize = 1000

func (r *PostgresAuditLogRepo) DeleteOldLogs(days int) error {
	if days <= 0 {
		return nil
	}
	cutoff := time.Now().AddDate(0, 0, -days)
	for {
		res := r.db.Exec(`
			DELETE FROM audit_logs
			WHERE id IN (
				SELECT id FROM audit_logs
				WHERE timestamp < ?
				LIMIT ?
			)`, cutoff, deleteAuditBatchSize)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			break
		}
	}
	return nil
}
