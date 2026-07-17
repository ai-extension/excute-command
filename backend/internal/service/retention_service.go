package service

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/user/csm-backend/internal/domain"
)

// Setting keys controlling log retention. An empty value or a value <= 0 means "never
// clear" (the default), so cleanup is opt-in per key.
const (
	SettingExecutionLogRetentionDays = "execution_log_retention_days"
	SettingAuditLogRetentionDays     = "audit_log_retention_days"
)

// RetentionService periodically deletes execution and audit logs older than the number
// of days configured in system settings. Execution cleanup removes both the DB rows and
// the on-disk log directories.
type RetentionService struct {
	settings *SettingsService
	execRepo domain.WorkflowExecutionRepository
	audit    *AuditLogService
	baseDir  string
}

func NewRetentionService(settings *SettingsService, execRepo domain.WorkflowExecutionRepository, audit *AuditLogService) *RetentionService {
	baseDir, _ := os.Getwd()
	return &RetentionService{
		settings: settings,
		execRepo: execRepo,
		audit:    audit,
		baseDir:  baseDir,
	}
}

// Start runs a cleanup pass immediately, then once every 24 hours.
func (s *RetentionService) Start() {
	go func() {
		s.RunCleanup()
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			s.RunCleanup()
		}
	}()
}

// RunCleanup applies both retention policies once. Each is skipped when its setting is
// unset or non-positive.
func (s *RetentionService) RunCleanup() {
	if days := s.retentionDays(SettingExecutionLogRetentionDays); days > 0 {
		s.cleanupExecutions(days)
	}
	if days := s.retentionDays(SettingAuditLogRetentionDays); days > 0 {
		if err := s.audit.Cleanup(days); err != nil {
			log.Printf("[Retention] audit log cleanup failed: %v", err)
		} else {
			log.Printf("[Retention] cleaned audit logs older than %d days", days)
		}
	}
}

func (s *RetentionService) cleanupExecutions(days int) {
	ids, err := s.execRepo.DeleteExecutionsOlderThan(days)
	if err != nil {
		log.Printf("[Retention] execution log cleanup failed: %v", err)
		return
	}
	if len(ids) == 0 {
		return
	}
	for _, id := range ids {
		dir := filepath.Join(s.baseDir, "data", "logs", "executions", id.String())
		if err := os.RemoveAll(dir); err != nil {
			log.Printf("[Retention] failed to remove log dir %s: %v", dir, err)
		}
	}
	log.Printf("[Retention] deleted %d executions older than %d days", len(ids), days)
}

// retentionDays reads a retention setting and returns the parsed positive day count, or
// 0 when the setting is absent/empty/invalid/non-positive (meaning "never clear").
func (s *RetentionService) retentionDays(key string) int {
	v, err := s.settings.GetSetting(key)
	if err != nil || strings.TrimSpace(v) == "" {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n <= 0 {
		return 0
	}
	return n
}
