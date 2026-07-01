package service

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"github.com/user/csm-backend/internal/domain"
)

type ScheduleService struct {
	repo     domain.ScheduleRepository
	execRepo domain.WorkflowExecutionRepository
	executor *WorkflowExecutor
	cron     *cron.Cron
	entries  map[uuid.UUID]cron.EntryID
	timers   map[uuid.UUID]*time.Timer
	mu       sync.Mutex
}

func NewScheduleService(repo domain.ScheduleRepository, execRepo domain.WorkflowExecutionRepository, executor *WorkflowExecutor) *ScheduleService {
	s := &ScheduleService{
		repo:     repo,
		execRepo: execRepo,
		executor: executor,
		cron:     cron.New(cron.WithParser(cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor))),
		entries:  make(map[uuid.UUID]cron.EntryID),
		timers:   make(map[uuid.UUID]*time.Timer),
	}
	s.cron.Start()
	return s
}

func (s *ScheduleService) Init() {
	s.mu.Lock()
	defer s.mu.Unlock()

	schedules, err := s.repo.ListActive()
	if err != nil {
		log.Printf("[ScheduleService] Failed to list active schedules: %v", err)
		return
	}

	for _, schedule := range schedules {
		s.addScheduleToCron(schedule)
	}
	log.Printf("[ScheduleService] Initialized with %d active schedules", len(schedules))
}

func (s *ScheduleService) Create(schedule *domain.Schedule, workflowConfigs []domain.ScheduleWorkflow, user *domain.User) error {
	schedule.ID = uuid.New()
	if user != nil {
		schedule.CreatedBy = &user.ID
		schedule.CreatedByUsername = user.Username
	}

	if err := s.repo.Create(schedule); err != nil {
		return err
	}

	for _, config := range workflowConfigs {
		config.ID = uuid.New()
		config.ScheduleID = schedule.ID
		if err := s.repo.AddScheduledWorkflow(&config); err != nil {
			return err
		}
	}

	// Reload to get preloaded workflows
	scope := domain.GetPermissionScope(user, "schedules", "READ")
	reloaded, err := s.repo.GetByID(schedule.ID, &scope)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if reloaded.Status == "ACTIVE" {
		s.addScheduleToCron(*reloaded)
	}
	return nil
}

func (s *ScheduleService) Update(schedule *domain.Schedule, workflowConfigs []domain.ScheduleWorkflow, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "schedules", "WRITE")
	existing, err := s.repo.GetByID(schedule.ID, &scope)
	if err != nil {
		return err
	}

	// Merge fields from partial schedule into existing record
	if schedule.Name != "" {
		existing.Name = schedule.Name
	}
	if schedule.CronExpression != "" {
		existing.CronExpression = schedule.CronExpression
	}
	if schedule.Type != "" {
		existing.Type = schedule.Type
	}
	if schedule.Status != "" {
		existing.Status = schedule.Status
	}
	// Full-replace fields: caller sends the desired end-state, so nil/empty must
	// be honored (clear), not silently kept. repo.Update's own nil-guards still
	// treat a nil slice as "no change" vs an empty slice as "clear".
	existing.NextRunAt = schedule.NextRunAt
	existing.StartDate = schedule.StartDate
	existing.EndDate = schedule.EndDate
	existing.CatchUp = schedule.CatchUp
	existing.Retries = schedule.Retries
	existing.Tags = schedule.Tags
	existing.Hooks = schedule.Hooks

	if err := s.repo.Update(existing); err != nil {
		return err
	}

	// Update workflows association
	if err := s.repo.RemoveWorkflows(schedule.ID); err != nil {
		return err
	}
	for _, config := range workflowConfigs {
		config.ID = uuid.New()
		config.ScheduleID = schedule.ID
		if err := s.repo.AddScheduledWorkflow(&config); err != nil {
			return err
		}
	}

	// Reload and sync cron
	scope = domain.GetPermissionScope(user, "schedules", "READ")
	reloaded, err := s.repo.GetByID(schedule.ID, &scope)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.removeScheduleFromCron(schedule.ID)
	if reloaded.Status == "ACTIVE" {
		s.addScheduleToCron(*reloaded)
	}
	return nil
}

func (s *ScheduleService) Delete(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "schedules", "DELETE")
	_, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.removeScheduleFromCron(id)
	s.mu.Unlock()

	if err := s.repo.RemoveWorkflows(id); err != nil {
		return err
	}
	return s.repo.Delete(id)
}

func (s *ScheduleService) ToggleStatus(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "schedules", "WRITE")
	schedule, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return err
	}

	if schedule.Status == "ACTIVE" {
		schedule.Status = "PAUSED"
	} else {
		schedule.Status = "ACTIVE"
	}

	if err := s.repo.Update(schedule); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if schedule.Status == "ACTIVE" {
		s.addScheduleToCron(*schedule)
	} else {
		s.removeScheduleFromCron(id)
	}
	return nil
}

func (s *ScheduleService) List(namespaceID uuid.UUID, user *domain.User) ([]domain.Schedule, error) {
	scope := domain.GetPermissionScope(user, "schedules", "READ")
	return s.repo.List(namespaceID, &scope)
}

func (s *ScheduleService) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, tagIDs []uuid.UUID, createdBy *uuid.UUID, from, to *time.Time, user *domain.User) ([]domain.Schedule, int64, error) {
	scope := domain.GetPermissionScope(user, "schedules", "READ")
	return s.repo.ListPaginated(namespaceID, limit, offset, searchTerm, tagIDs, createdBy, from, to, &scope)
}

func (s *ScheduleService) GetByID(id uuid.UUID, user *domain.User) (*domain.Schedule, error) {
	return s.GetByIDWithAction(id, user, "READ")
}

func (s *ScheduleService) GetByIDWithAction(id uuid.UUID, user *domain.User, action string) (*domain.Schedule, error) {
	scope := domain.GetPermissionScope(user, "schedules", action)
	return s.repo.GetByID(id, &scope)
}

// Internal helpers

func (s *ScheduleService) addScheduleToCron(schedule domain.Schedule) {
	now := time.Now().UTC()

	// Catch-up logic: triggers only if CatchUp flag is true. A recurring schedule
	// must not catch up outside its [StartDate, EndDate] window — otherwise a
	// server restart after the window closed would fire a stale missed run.
	if schedule.CatchUp && schedule.Status == "ACTIVE" && schedule.NextRunAt != nil && schedule.NextRunAt.Before(now) {
		outsideWindow := schedule.Type == domain.ScheduleTypeRecurring &&
			((schedule.StartDate != nil && now.Before(*schedule.StartDate)) ||
				(schedule.EndDate != nil && now.After(*schedule.EndDate)))
		if !outsideWindow {
			log.Printf("[ScheduleService] Catch-up triggering for schedule '%s' (missed %v ago)", schedule.Name, now.Sub(*schedule.NextRunAt))
			go s.runScheduledWorkflows(schedule.ID)

			if schedule.Type == domain.ScheduleTypeOneTime {
				// Mark as finished/paused immediately after triggering catch-up
				s.repo.UpdateStatus(schedule.ID, "PAUSED")
				return
			}
		}
	}

	if schedule.Type == domain.ScheduleTypeRecurring {
		// If the run window has already closed, don't register the cron at all;
		// pause it and clear next_run so its state reflects that it can't fire.
		if schedule.EndDate != nil && now.After(*schedule.EndDate) {
			log.Printf("[ScheduleService] Recurring '%s' end date passed; not scheduling", schedule.Name)
			if schedule.Status == "ACTIVE" {
				s.repo.UpdateStatus(schedule.ID, "PAUSED")
				s.repo.UpdateNextRunAt(schedule.ID, nil)
			}
			return
		}

		start := schedule.StartDate
		end := schedule.EndDate
		scheduleID := schedule.ID
		scheduleName := schedule.Name
		entryID, err := s.cron.AddFunc(schedule.CronExpression, func() {
			fireNow := time.Now().UTC()
			// Before the window opens: skip this tick, keep the entry for later.
			if start != nil && fireNow.Before(*start) {
				return
			}
			// After the window closes: stop firing and pause the schedule.
			if end != nil && fireNow.After(*end) {
				s.mu.Lock()
				s.removeScheduleFromCron(scheduleID)
				s.mu.Unlock()
				s.repo.UpdateStatus(scheduleID, "PAUSED")
				s.repo.UpdateNextRunAt(scheduleID, nil)
				log.Printf("[ScheduleService] Recurring '%s' window closed; paused", scheduleName)
				return
			}
			s.runScheduledWorkflows(scheduleID)
		})
		if err != nil {
			log.Printf("[ScheduleService] Failed to add cron for %s: %v", schedule.Name, err)
			return
		}
		s.entries[schedule.ID] = entryID

		// Update NextRunAt (targeted column write — must not touch associations).
		// Advance to the window start if the schedule opens later, and clear it if
		// no cron occurrence lands inside the window.
		entry := s.cron.Entry(entryID)
		next := entry.Next
		if start != nil && next.Before(*start) && entry.Schedule != nil {
			// Next() returns the first activation strictly after its argument, so
			// step back 1s to keep an occurrence landing exactly on the start.
			next = entry.Schedule.Next(start.Add(-time.Second))
		}
		if end != nil && next.After(*end) {
			s.repo.UpdateNextRunAt(schedule.ID, nil)
		} else {
			s.repo.UpdateNextRunAt(schedule.ID, &next)
		}
	} else if schedule.Type == domain.ScheduleTypeOneTime {
		if schedule.NextRunAt != nil {
			scheduledAt := schedule.NextRunAt.UTC()
			if scheduledAt.After(now) {
				delay := scheduledAt.Sub(now)
				log.Printf("[ScheduleService] Scheduling '%s' to fire in %v", schedule.Name, delay)
				var timer *time.Timer
				timer = time.AfterFunc(delay, func() {
					// Guard against a stale fire: if this timer was superseded
					// (Update created a new one) or cancelled (Delete/Pause), skip.
					s.mu.Lock()
					superseded := s.timers[schedule.ID] != timer
					if !superseded {
						delete(s.timers, schedule.ID)
					}
					s.mu.Unlock()
					if superseded {
						return
					}
					log.Printf("[ScheduleService] Firing one-time schedule: %s", schedule.Name)
					s.runScheduledWorkflows(schedule.ID)
					s.repo.UpdateStatus(schedule.ID, "PAUSED")
				})
				s.timers[schedule.ID] = timer
			}
		}
	}
}

func (s *ScheduleService) removeScheduleFromCron(id uuid.UUID) {
	if entryID, ok := s.entries[id]; ok {
		s.cron.Remove(entryID)
		delete(s.entries, id)
	}
	if timer, ok := s.timers[id]; ok {
		timer.Stop()
		delete(s.timers, id)
	}
}

func (s *ScheduleService) runScheduledWorkflows(scheduleID uuid.UUID) {
	// Periodic/Bg tasks use nil scope
	schedule, err := s.repo.GetByID(scheduleID, nil)
	if err != nil {
		log.Printf("[ScheduleService] Failed to run schedule %s: %v", scheduleID, err)
		return
	}

	log.Printf("[ScheduleService] Triggering schedule: %s", schedule.Name)

	ctx := context.Background()

	// 1. Run BEFORE hooks
	if err := s.executor.RunHooks(ctx, schedule.Hooks, domain.HookTypeBefore, schedule.NamespaceID, nil, 0, nil, schedule.ID, nil, nil, nil, nil); err != nil {
		log.Printf("[ScheduleService] Before hook failed for schedule %s: %v", schedule.Name, err)
		return
	}

	maxRetries := schedule.Retries
	var wg sync.WaitGroup
	var hasFailure bool
	var mu sync.Mutex

	for _, sw := range schedule.ScheduledWorkflows {
		if sw.Workflow == nil {
			continue
		}

		var inputs map[string]string
		if sw.Inputs != "" {
			json.Unmarshal([]byte(sw.Inputs), &inputs)
		}

		wg.Add(1)
		go func(w domain.Workflow, in map[string]string) {
			defer wg.Done()
			var success bool
			for attempt := 0; attempt <= maxRetries; attempt++ {
				execID := uuid.New()
				// Background execution, nil user
				err := s.executor.Run(ctx, w.ID, execID, in, &schedule.ID, nil, "SCHEDULE", nil, nil, nil, nil)
				if err == nil {
					success = true
					break
				}
				log.Printf("[ScheduleService] Workflow %s execution failed (attempt %d/%d): %v", w.Name, attempt+1, maxRetries+1, err)
				if attempt < maxRetries {
					time.Sleep(10 * time.Second)
				}
			}

			if !success {
				mu.Lock()
				hasFailure = true
				mu.Unlock()
			}
		}(*sw.Workflow, inputs)
	}

	wg.Wait()

	// 2. Run AFTER hooks
	if hasFailure {
		s.executor.RunHooks(ctx, schedule.Hooks, domain.HookTypeAfterFailed, schedule.NamespaceID, nil, 0, nil, schedule.ID, nil, nil, nil, nil)
	} else {
		s.executor.RunHooks(ctx, schedule.Hooks, domain.HookTypeAfterSuccess, schedule.NamespaceID, nil, 0, nil, schedule.ID, nil, nil, nil, nil)
	}

	// Update NextRunAt for recurring
	if schedule.Type == domain.ScheduleTypeRecurring {
		s.mu.Lock()
		entryID, ok := s.entries[schedule.ID]
		var next time.Time
		if ok {
			next = s.cron.Entry(entryID).Next
		}
		s.mu.Unlock()
		if ok {
			// targeted column write — must not touch associations
			if schedule.EndDate != nil && next.After(*schedule.EndDate) {
				s.repo.UpdateNextRunAt(schedule.ID, nil)
			} else {
				s.repo.UpdateNextRunAt(schedule.ID, &next)
			}
		}
	}
}

func (s *ScheduleService) GetScheduleExecutions(scheduleID uuid.UUID, user *domain.User) ([]domain.WorkflowExecution, error) {
	scope := domain.GetPermissionScope(user, "schedules", "READ")
	return s.execRepo.ListByScheduledID(scheduleID, &scope)
}
