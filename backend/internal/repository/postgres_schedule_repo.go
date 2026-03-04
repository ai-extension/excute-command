package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresScheduleRepo struct {
	db *gorm.DB
}

func NewPostgresScheduleRepo(db *gorm.DB) *PostgresScheduleRepo {
	return &PostgresScheduleRepo{db: db}
}

func (r *PostgresScheduleRepo) Create(s *domain.Schedule) error {
	return r.db.Create(s).Error
}

func (r *PostgresScheduleRepo) GetByID(id uuid.UUID, scope *domain.PermissionScope) (*domain.Schedule, error) {
	var s domain.Schedule
	db := applyScope(r.db, scope, "schedule_tags", "schedule_id")
	if err := db.
		Preload("ScheduledWorkflows").
		Preload("ScheduledWorkflows.Workflow").
		Preload("Hooks", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Hooks.TargetWorkflow").
		Preload("Tags").
		First(&s, "id = ?", id).Error; err != nil {
		return nil, err
	}
	r.populateStats(&s)
	return &s, nil
}

func (r *PostgresScheduleRepo) List(namespaceID uuid.UUID, scope *domain.PermissionScope) ([]domain.Schedule, error) {
	var ss []domain.Schedule
	db := applyScope(r.db, scope, "schedule_tags", "schedule_id")
	if err := db.
		Preload("ScheduledWorkflows").
		Preload("ScheduledWorkflows.Workflow").
		Preload("Hooks", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Hooks.TargetWorkflow").
		Preload("Tags").
		Where("namespace_id = ?", namespaceID).
		Order("created_at desc").
		Find(&ss).Error; err != nil {
		return nil, err
	}
	for i := range ss {
		r.populateStats(&ss[i])
	}
	return ss, nil
}

func (r *PostgresScheduleRepo) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, tagIDs []uuid.UUID, scope *domain.PermissionScope) ([]domain.Schedule, int64, error) {
	var ss []domain.Schedule
	var total int64

	db := applyScope(r.db, scope, "schedule_tags", "schedule_id")
	db = db.Model(&domain.Schedule{}).Where("namespace_id = ?", namespaceID)

	if searchTerm != "" {
		db = db.Where("name ILIKE ?", "%"+searchTerm+"%")
	}

	if len(tagIDs) > 0 {
		db = db.Where("id IN (SELECT schedule_id FROM schedule_tags WHERE tag_id IN ?)", tagIDs)
	}

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := db.
		Preload("ScheduledWorkflows").
		Preload("ScheduledWorkflows.Workflow").
		Preload("Hooks", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Hooks.TargetWorkflow").
		Preload("Tags").
		Limit(limit).Offset(offset).
		Order("created_at desc").
		Find(&ss).Error; err != nil {
		return nil, 0, err
	}
	for i := range ss {
		r.populateStats(&ss[i])
	}
	return ss, total, nil
}

func (r *PostgresScheduleRepo) Update(s *domain.Schedule) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(s).Association("Tags").Replace(s.Tags); err != nil {
			return err
		}

		// Sync Hooks
		if err := tx.Where("schedule_id = ?", s.ID).Delete(&domain.WorkflowHook{}).Error; err != nil {
			return err
		}
		for i := range s.Hooks {
			s.Hooks[i].ID = uuid.New()
			s.Hooks[i].ScheduleID = &s.ID
			if err := tx.Omit("TargetWorkflow").Create(&s.Hooks[i]).Error; err != nil {
				return err
			}
		}

		return tx.Omit("Tags", "ScheduledWorkflows", "Hooks").Save(s).Error
	})
}

func (r *PostgresScheduleRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Schedule{}, "id = ?", id).Error
}

func (r *PostgresScheduleRepo) AddScheduledWorkflow(sw *domain.ScheduleWorkflow) error {
	return r.db.Create(sw).Error
}

func (r *PostgresScheduleRepo) RemoveWorkflows(scheduleID uuid.UUID) error {
	return r.db.Where("schedule_id = ?", scheduleID).Delete(&domain.ScheduleWorkflow{}).Error
}

func (r *PostgresScheduleRepo) ListActive() ([]domain.Schedule, error) {
	var schedules []domain.Schedule
	if err := r.db.
		Preload("ScheduledWorkflows").
		Preload("ScheduledWorkflows.Workflow").
		Preload("Hooks", func(db *gorm.DB) *gorm.DB { return db.Order("\"order\" ASC") }).
		Preload("Hooks.TargetWorkflow").
		Preload("Tags").
		Where("status = ?", "ACTIVE").
		Order("created_at DESC").
		Find(&schedules).Error; err != nil {
		return nil, err
	}
	for i := range schedules {
		r.populateStats(&schedules[i])
	}
	return schedules, nil
}

func (r *PostgresScheduleRepo) UpdateStatus(id uuid.UUID, status string) error {
	return r.db.Model(&domain.Schedule{}).Where("id = ?", id).Update("status", status).Error
}

func (r *PostgresScheduleRepo) populateStats(s *domain.Schedule) {
	var count int64
	r.db.Model(&domain.WorkflowExecution{}).Where("scheduled_id = ?", s.ID).Count(&count)
	s.TotalRuns = int(count)

	var lastExec domain.WorkflowExecution
	if err := r.db.Where("scheduled_id = ?", s.ID).Order("started_at desc").First(&lastExec).Error; err == nil {
		s.LastRunStatus = string(lastExec.Status)
		s.LastRunAt = &lastExec.StartedAt
	}
}
