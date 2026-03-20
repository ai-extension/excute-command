package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/user/csm-backend/internal/domain"
)

type MCPService struct {
	server          *server.MCPServer
	workflowService *WorkflowService
	executor        *WorkflowExecutor
	scheduleService *ScheduleService
}

func NewMCPService(wfService *WorkflowService, exec *WorkflowExecutor, schedService *ScheduleService) *MCPService {
	s := server.NewMCPServer(
		"CSM-Execute-MCP",
		"1.0.0",
	)

	mcpSvc := &MCPService{
		server:          s,
		workflowService: wfService,
		executor:        exec,
		scheduleService: schedService,
	}

	mcpSvc.registerTools()
	return mcpSvc
}

func (s *MCPService) GetServer() *server.MCPServer {
	return s.server
}

func (s *MCPService) registerTools() {
	// 1. list_workflows
	listWorkflowsTool := mcp.NewTool("list_workflows",
		mcp.WithDescription("Lấy danh sách các workflow có thể chạy. Trả về metadata và hướng dẫn AI (AIGuide) để biết workflow làm chức năng gì."),
	)
	s.server.AddTool(listWorkflowsTool, s.handleListWorkflows)

	// 2. run_workflow
	runWorkflowTool := mcp.NewTool("run_workflow",
		mcp.WithDescription("Chạy một workflow dựa theo ID. Truyền inputs (JSON) nếu cần thiêt. Trả về execution_id."),
		mcp.WithString("workflow_id", mcp.Required(), mcp.Description("UUID của workflow cần chạy")),
		mcp.WithString("inputs", mcp.Description("Các biến đầu vào định dạng JSON string")),
	)
	s.server.AddTool(runWorkflowTool, s.handleRunWorkflow)

	// 3. get_execution_log
	getLogTool := mcp.NewTool("get_execution_log",
		mcp.WithDescription("Xem log của một workflow execution. Tool này sẽ theo dõi và stream log trong suốt quá trình chạy, chặn cho đến khi kết thúc."),
		mcp.WithString("execution_id", mcp.Required(), mcp.Description("UUID của execution")),
	)
	s.server.AddTool(getLogTool, s.handleGetExecutionLog)

	// 4. schedule_workflow
	scheduleTool := mcp.NewTool("schedule_workflow",
		mcp.WithDescription("Đặt lịch chạy cho một workflow (One-time hoặc Recurring)."),
		mcp.WithString("workflow_id", mcp.Required(), mcp.Description("UUID của workflow cần đặt lịch")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Tên của lịch trình (ví dụ: 'Daily Backup')")),
		mcp.WithString("type", mcp.Required(), mcp.Description("Loại lịch: 'ONE_TIME' hoặc 'RECURRING'")),
		mcp.WithString("cron_expression", mcp.Description("Biểu thức Cron (nếu type = RECURRING, ví dụ: '0 0 * * *' cho hàng ngày lúc 00:00)")),
		mcp.WithString("next_run_at", mcp.Description("Thời gian chạy (nếu type = ONE_TIME, chuẩn RFC3339)")),
		mcp.WithString("inputs", mcp.Description("Biến đầu vào định dạng JSON string (nếu có)")),
	)
	s.server.AddTool(scheduleTool, s.handleScheduleWorkflow)
}

func getUserFromContext(ctx context.Context) (*domain.User, *uuid.UUID, error) {
	val := ctx.Value("user")
	if val == nil {
		return nil, nil, fmt.Errorf("không tìm thấy thông tin xác thực")
	}
	user, ok := val.(*domain.User)
	if !ok {
		return nil, nil, fmt.Errorf("thông tin xác thực không hợp lệ")
	}

	var apiKeyID *uuid.UUID
	keyVal := ctx.Value("api_key_id")
	if keyVal != nil {
		if id, ok := keyVal.(uuid.UUID); ok {
			apiKeyID = &id
		}
	}
	return user, apiKeyID, nil
}

func (s *MCPService) handleListWorkflows(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	user, _, err := getUserFromContext(ctx)
	if err != nil {
		return mcp.NewToolResultError("Unauthorized"), nil
	}
	// Actually we should list workflows accessible by this user.
	// Since MCP needs the workflows the user can execute, we can iterate and check permission or just format the list.
	// For simplicity, we just use ListWorkflows Paginated or Global. But we need namespace.
	// If it's global, ListGlobalPaginated requires scope.
	// Let's just create a simplified version for MCP or just loop through using user scope.

	// Prepare permission scope
	scope := domain.GetPermissionScope(user, "workflows", "EXECUTE")

	// Getting workflows that user has EXECUTE access
	// To avoid complex DB queries here, we use ListGlobalPaginated with scope
	var isTemplate bool = false
	wfs, _, err := s.workflowService.ListGlobalPaginated(50, 0, "", &isTemplate, &scope)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Lỗi khi lấy danh sách: %v", err)), nil
	}

	var result []map[string]interface{}
	for _, wf := range wfs {
		result = append(result, map[string]interface{}{
			"id":          wf.ID,
			"name":        wf.Name,
			"description": wf.Description,
			"ai_guide":    wf.AIGuide,
		})
	}

	bytes, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(bytes)), nil
}

func (s *MCPService) handleRunWorkflow(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	user, apiKeyID, err := getUserFromContext(ctx)
	if err != nil {
		return mcp.NewToolResultError("Unauthorized"), nil
	}

	wfIDStr, err := request.RequireString("workflow_id")
	if err != nil {
		return mcp.NewToolResultError("Thiếu workflow_id"), nil
	}
	wfID, err := uuid.Parse(wfIDStr)
	if err != nil {
		return mcp.NewToolResultError("workflow_id không hợp lệ"), nil
	}

	var inputs map[string]string
	if inputsStr := request.GetString("inputs", ""); inputsStr != "" {
		_ = json.Unmarshal([]byte(inputsStr), &inputs)
	}

	wf, err := s.workflowService.GetWorkflowWithAction(wfID, user, "EXECUTE")
	if err != nil {
		return mcp.NewToolResultError("Không tìm thấy workflow hoặc không có quyền EXECUTE"), nil
	}

	execID := uuid.New()
	execution := &domain.WorkflowExecution{
		ID:            execID,
		WorkflowID:    wf.ID,
		Status:        domain.StatusRunning,
		StartedAt:     time.Now(),
		ExecutedBy:    &user.ID,
		APIKeyID:      apiKeyID,
		TriggerSource: "MCP",
	}

	if len(inputs) > 0 {
		inputsBytes, _ := json.Marshal(inputs)
		execution.Inputs = string(inputsBytes)
	}

	if err := s.workflowService.CreateExecution(execution); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Không thể tạo execution: %v", err)), nil
	}

	// Chạy dưới dạng background (goroutine)
	go func() {
		// Dùng context.Background() để nó không bị ngắt khi request MCP kết thúc
		_ = s.executor.Run(context.Background(), wf.ID, execID, inputs, nil, nil, "MCP", user, nil, nil, nil)
	}()

	return mcp.NewToolResultText(fmt.Sprintf("Workflow %s đang chạy. execution_id: %s", wf.Name, execID.String())), nil
}

func (s *MCPService) handleGetExecutionLog(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	user, _, err := getUserFromContext(ctx)
	if err != nil {
		return mcp.NewToolResultError("Unauthorized"), nil
	}

	execIDStr, err := request.RequireString("execution_id")
	if err != nil {
		return mcp.NewToolResultError("Thiếu execution_id"), nil
	}
	execID, err := uuid.Parse(execIDStr)
	if err != nil {
		return mcp.NewToolResultError("execution_id không hợp lệ"), nil
	}

	// Wait and tail loop
	cwd, _ := os.Getwd()
	execLogDir := filepath.Join(cwd, "data", "logs", "executions", execID.String())
	mainLogPath := filepath.Join(execLogDir, "workflow.log")

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	timeout := time.After(30 * time.Minute) // Fallback timeout 30 phút
	var lastPos int64 = 0

	var fullLog string

	for {
		select {
		case <-ctx.Done():
			return mcp.NewToolResultError("Bị ngắt kết nối"), nil
		case <-timeout:
			return mcp.NewToolResultError("Timeout khi chờ log"), nil
		case <-ticker.C:
			// Fetch execution status
			exec, err := s.workflowService.GetExecution(execID, user)
			if err != nil {
				return mcp.NewToolResultError("Không tìm thấy execution hoặc không có quyền"), nil
			}

			// Read diff log
			file, err := os.Open(mainLogPath)
			if err == nil {
				file.Seek(lastPos, 0)
				scanner := bufio.NewScanner(file)
				for scanner.Scan() {
					line := scanner.Text()
					fullLog += line + "\n"

					s.server.SendNotificationToAllClients("notifications/progress", map[string]interface{}{
						"progress": 0,
						"total":    0,
						"message":  line,
					})
				}
				stat, _ := file.Stat()
				if stat != nil {
					lastPos = stat.Size()
				}
				file.Close()
			} else {
				// Nếu file workflow.log chưa được tạo và legacy LogPath cũng không có
				if exec.LogPath != "" {
					oldPath := exec.LogPath
					if !filepath.IsAbs(oldPath) {
						oldPath = filepath.Join(cwd, oldPath)
					}
					f, err := os.Open(oldPath)
					if err == nil {
						f.Seek(lastPos, 0)
						scanner := bufio.NewScanner(f)
						for scanner.Scan() {
							line := scanner.Text()
							fullLog += line + "\n"
							s.server.SendNotificationToAllClients("notifications/progress", map[string]interface{}{
								"progress": 0,
								"total":    0,
								"message":  line,
							})
						}
						st, _ := f.Stat()
						if st != nil {
							lastPos = st.Size()
						}
						f.Close()
					}
				}
			}

			if exec.Status != domain.StatusRunning && exec.Status != domain.StatusPending {
				return mcp.NewToolResultText(fmt.Sprintf("Execution %s kết thúc với trạng thái: %s.\n\nToàn bộ Log:\n%s", execIDStr, exec.Status, fullLog)), nil
			}
		}
	}
}

func (s *MCPService) handleScheduleWorkflow(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	user, _, err := getUserFromContext(ctx)
	if err != nil {
		return mcp.NewToolResultError("Unauthorized"), nil
	}

	wfIDStr, err := request.RequireString("workflow_id")
	if err != nil {
		return mcp.NewToolResultError("Thiếu workflow_id"), nil
	}
	name, err := request.RequireString("name")
	if err != nil {
		return mcp.NewToolResultError("Thiếu name"), nil
	}
	schedType, err := request.RequireString("type")
	if err != nil {
		return mcp.NewToolResultError("Thiếu type"), nil
	}
	wfID, err := uuid.Parse(wfIDStr)
	if err != nil {
		return mcp.NewToolResultError("workflow_id không hợp lệ"), nil
	}

	wf, err := s.workflowService.GetWorkflowWithAction(wfID, user, "EXECUTE")
	if err != nil {
		return mcp.NewToolResultError("Không tìm thấy workflow hoặc không có quyền"), nil
	}

	schedule := &domain.Schedule{
		ID:          uuid.New(),
		NamespaceID: wf.NamespaceID,
		Name:        name,
		Type:        domain.ScheduleType(schedType),
		Status:      "ACTIVE",
		CreatedBy:   &user.ID,
	}

	if schedType == string(domain.ScheduleTypeRecurring) {
		cronExpr := request.GetString("cron_expression", "")
		if cronExpr == "" {
			return mcp.NewToolResultError("Thiếu cron_expression cho Recurring schedule"), nil
		}
		schedule.CronExpression = cronExpr
	} else if schedType == string(domain.ScheduleTypeOneTime) {
		nextRunStr := request.GetString("next_run_at", "")
		if nextRunStr == "" {
			return mcp.NewToolResultError("Thiếu next_run_at cho One-time schedule"), nil
		}
		parsedTime, err := time.Parse(time.RFC3339, nextRunStr)
		if err != nil {
			return mcp.NewToolResultError("next_run_at không đúng định dạng RFC3339"), nil
		}
		schedule.NextRunAt = &parsedTime
	} else {
		return mcp.NewToolResultError("type không hợp lệ (phải là ONE_TIME hoặc RECURRING)"), nil
	}

	inputs := request.GetString("inputs", "")

	swConfigs := []domain.ScheduleWorkflow{
		{
			ID:         uuid.New(),
			ScheduleID: schedule.ID,
			WorkflowID: wf.ID,
			Inputs:     inputs,
		},
	}

	if err := s.scheduleService.Create(schedule, swConfigs, user); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Không thể tạo schedule: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("Đã tạo lịch %s thành công. Schedule ID: %s", schedule.Name, schedule.ID.String())), nil
}
