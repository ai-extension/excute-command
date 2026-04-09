package service

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type DashboardStats struct {
	Workflows  StatsResult              `json:"workflows"`
	Executions StatsResult              `json:"executions"`
	Schedules  StatsResult              `json:"schedules"`
	Servers    StatsResult              `json:"servers"`
	Vpns       StatsResult              `json:"vpns"`
	Users      StatsResult              `json:"users"`
	Analytics  []map[string]interface{} `json:"analytics"`
}

type StatsResult struct {
	Total   int64       `json:"total"`
	Success int         `json:"success,omitempty"`
	Failed  int         `json:"failed,omitempty"`
	Running int         `json:"running,omitempty"`
	Active  int         `json:"active,omitempty"`
	Items   interface{} `json:"items"`
}

type DashboardService struct {
	wfRepo       domain.WorkflowRepository
	execRepo     domain.WorkflowExecutionRepository
	scheduleRepo domain.ScheduleRepository
	serverRepo   domain.ServerRepository
	vpnRepo      domain.VpnConfigRepository
	userRepo     domain.UserRepository
}

func NewDashboardService(
	wfRepo domain.WorkflowRepository,
	execRepo domain.WorkflowExecutionRepository,
	scheduleRepo domain.ScheduleRepository,
	serverRepo domain.ServerRepository,
	vpnRepo domain.VpnConfigRepository,
	userRepo domain.UserRepository,
) *DashboardService {
	return &DashboardService{
		wfRepo:       wfRepo,
		execRepo:     execRepo,
		scheduleRepo: scheduleRepo,
		serverRepo:   serverRepo,
		vpnRepo:      vpnRepo,
		userRepo:     userRepo,
	}
}

func (s *DashboardService) GetGlobalStats(user *domain.User) (*DashboardStats, error) {
	return s.getStats(uuid.Nil, user, true)
}

func (s *DashboardService) GetNamespaceStats(namespaceID uuid.UUID, user *domain.User) (*DashboardStats, error) {
	return s.getStats(namespaceID, user, false)
}

func (s *DashboardService) getStats(namespaceID uuid.UUID, user *domain.User, isGlobal bool) (*DashboardStats, error) {
	stats := &DashboardStats{}

	// Create all necessary scopes
	wfScope := domain.GetPermissionScope(user, "workflows", "READ")
	schScope := domain.GetPermissionScope(user, "schedules", "READ")
	srvScope := domain.GetPermissionScope(user, "servers", "READ")
	vpnScope := domain.GetPermissionScope(user, "vpns", "READ")

	// 1. Workflows
	var wfs []domain.Workflow
	var wfTotal int64
	if isGlobal {
		var err error
		wfs, wfTotal, err = s.wfRepo.ListGlobalPaginated(10, 0, "", nil, nil, &wfScope) // Changed limit to 10, added nil for tagIDs, and captured error
		if err != nil {
			// Handle error if necessary, for now, proceed with empty or partial data
			// For this context, we'll just log or ignore as per original pattern
		}
	} else {
		wfs, wfTotal, _ = s.wfRepo.ListPaginated(namespaceID, 6, 0, "", nil, nil, nil, nil, &wfScope)
	}
	stats.Workflows = StatsResult{Total: wfTotal, Items: wfs}

	// 2. Executions
	var execs []domain.WorkflowExecution
	var execTotal int64
	if isGlobal {
		execs, execTotal, _ = s.execRepo.ListGlobalPaginated(20, 0, "ALL", nil, nil, nil, &wfScope)
	} else {
		execs, execTotal, _ = s.execRepo.ListByNamespaceIDPaginated(namespaceID, 20, 0, "ALL", nil, nil, nil, &wfScope)
	}

	success := 0
	failed := 0
	running := 0
	for _, e := range execs {
		switch e.Status {
		case domain.StatusSuccess:
			success++
		case domain.StatusFailed:
			failed++
		case domain.StatusRunning:
			running++
		}
	}

	// Ensure we only return top 8 items if 20 were fetched for counting
	var displayExecs []domain.WorkflowExecution
	if len(execs) > 8 {
		displayExecs = execs[:8]
	} else {
		displayExecs = execs
	}

	stats.Executions = StatsResult{
		Total:   execTotal,
		Success: success,
		Failed:  failed,
		Running: running,
		Items:   displayExecs,
	}

	// 3. Schedules
	var schedules []domain.Schedule
	var schTotal int64
	if isGlobal {
		schedules, schTotal, _ = s.scheduleRepo.ListGlobalPaginated(5, 0, "", nil, &schScope)
	} else {
		schedules, schTotal, _ = s.scheduleRepo.ListPaginated(namespaceID, 5, 0, "", nil, nil, &schScope)
	}

	active := 0
	for _, sch := range schedules {
		if sch.Status == "ACTIVE" {
			active++
		}
	}

	stats.Schedules = StatsResult{
		Total:  schTotal,
		Active: active,
		Items:  schedules,
	}

	// 4. Servers (Global resource but accessible)
	var srvs []domain.Server
	var srvTotal int64
	srvs, srvTotal, _ = s.serverRepo.ListPaginated(5, 0, "", "", nil, nil, &srvScope)
	stats.Servers = StatsResult{Total: srvTotal, Items: srvs}

	// 5. VPNs (Global resource)
	var vpns []domain.VpnConfig
	var vpnTotal int64
	vpns, vpnTotal, _ = s.vpnRepo.ListPaginated(5, 0, "", "", "", nil, &vpnScope)
	stats.Vpns = StatsResult{Total: vpnTotal, Items: vpns}

	// Users (Global resource)
	var users []domain.User
	var usrTotal int64

	users, usrTotal, _ = s.userRepo.ListPaginated(1, 0, "", nil)
	stats.Users = StatsResult{Total: usrTotal, Items: users}

	// 7. Analytics
	var analytics []map[string]interface{}
	if !isGlobal {
		analytics, _ = s.execRepo.GetExecutionAnalytics(namespaceID, 7, &wfScope)
	} else {
		// If global stats require analytics, fallback or pass nil namespace
		analytics = []map[string]interface{}{}
	}

	if analytics == nil {
		analytics = []map[string]interface{}{}
	}
	stats.Analytics = analytics

	return stats, nil
}
