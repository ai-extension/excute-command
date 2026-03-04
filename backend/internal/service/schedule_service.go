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
	mu       sync.Mutex
}

func NewScheduleService(repo domain.ScheduleRepository, execRepo domain.WorkflowExecutionRepository, executor *WorkflowExecutor) *ScheduleService {
	s := &ScheduleService{
		repo:     repo,
		execRepo: execRepo,
		executor: executor,
		cron:     cron.New(cron.WithParser(cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor))),
		entries:  make(map[uuid.UUID]cron.EntryID),
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
	if err := s.repo.Update(schedule); err != nil {
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
	scope := domain.GetPermissionScope(user, "schedules", "READ")
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

func (s *ScheduleService) ListPaginated(namespaceID uuid.UUID, limit, offset int, searchTerm string, tagIDs []uuid.UUID, user *domain.User) ([]domain.Schedule, int64, error) {
	scope := domain.GetPermissionScope(user, "schedules", "READ")
	return s.repo.ListPaginated(namespaceID, limit, offset, searchTerm, tagIDs, &scope)
}

func (s *ScheduleService) GetByID(id uuid.UUID, user *domain.User) (*domain.Schedule, error) {
	scope := domain.GetPermissionScope(user, "schedules", "READ")
	return s.repo.GetByID(id, &scope)
}

// Internal helpers

func (s *ScheduleService) addScheduleToCron(schedule domain.Schedule) {
	if schedule.Type == domain.ScheduleTypeRecurring {
		entryID, err := s.cron.AddFunc(schedule.CronExpression, func() {
			s.runScheduledWorkflows(schedule.ID)
		})
		if err != nil {
			log.Printf("[ScheduleService] Failed to add cron for %s: %v", schedule.Name, err)
			return
		}
		s.entries[schedule.ID] = entryID

		// Update NextRunAt
		entry := s.cron.Entry(entryID)
		next := entry.Next
		schedule.NextRunAt = &next
		s.repo.Update(&schedule)
	} else if schedule.Type == domain.ScheduleTypeOneTime {
		if schedule.NextRunAt != nil {
			now := time.Now().UTC()
			scheduledAt := schedule.NextRunAt.UTC()
			log.Printf("[ScheduleService] OneTime schedule '%s': NextRunAt=%v, Now=%v", schedule.Name, scheduledAt, now)
			if scheduledAt.After(now) {
				delay := scheduledAt.Sub(now)
				log.Printf("[ScheduleService] Scheduling '%s' to fire in %v", schedule.Name, delay)
				time.AfterFunc(delay, func() {
					log.Printf("[ScheduleService] Firing one-time schedule: %s", schedule.Name)
					s.runScheduledWorkflows(schedule.ID)
					s.repo.UpdateStatus(schedule.ID, "PAUSED")
				})
			} else if schedule.Status == "ACTIVE" {
				// If it's active but in the past, run it immediately (catch-up)
				log.Printf("[ScheduleService] Running missed one-time schedule: %s (was %v ago)", schedule.Name, now.Sub(scheduledAt))
				go func() {
					s.runScheduledWorkflows(schedule.ID)
					s.repo.UpdateStatus(schedule.ID, "PAUSED")
				}()
			}
		}
	}
}

func (s *ScheduleService) removeScheduleFromCron(id uuid.UUID) {
	if entryID, ok := s.entries[id]; ok {
		s.cron.Remove(entryID)
		delete(s.entries, id)
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
	if err := s.executor.RunHooks(ctx, schedule.Hooks, domain.HookTypeBefore, schedule.NamespaceID, nil, 0, nil, nil); err != nil {
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
				err := s.executor.Run(ctx, w.ID, execID, in, &schedule.ID, nil, "SCHEDULE", nil, nil)
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
		s.executor.RunHooks(ctx, schedule.Hooks, domain.HookTypeAfterFailed, schedule.NamespaceID, nil, 0, nil, nil)
	} else {
		s.executor.RunHooks(ctx, schedule.Hooks, domain.HookTypeAfterSuccess, schedule.NamespaceID, nil, 0, nil, nil)
	}

	// Update NextRunAt for recurring
	if schedule.Type == domain.ScheduleTypeRecurring {
		s.mu.Lock()
		if entryID, ok := s.entries[schedule.ID]; ok {
			entry := s.cron.Entry(entryID)
			next := entry.Next
			schedule.NextRunAt = &next
			s.repo.Update(schedule)
		}
		s.mu.Unlock()
	}
}

func (s *ScheduleService) GetScheduleExecutions(scheduleID uuid.UUID, user *domain.User) ([]domain.WorkflowExecution, error) {
	scope := domain.GetPermissionScope(user, "schedules", "READ")
	return s.execRepo.ListByScheduledID(scheduleID, &scope)
}
