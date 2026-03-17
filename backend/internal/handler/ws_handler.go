package handler

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for now
	},
}

type WSHandler struct {
	hub             *service.Hub
	terminalService *service.TerminalService
	authService     *service.AuthService
	pageService     *service.PageService
	workflowService *service.WorkflowService
}

func NewWSHandler(hub *service.Hub, terminalService *service.TerminalService, authService *service.AuthService, pageService *service.PageService, workflowService *service.WorkflowService) *WSHandler {
	return &WSHandler{
		hub:             hub,
		terminalService: terminalService,
		authService:     authService,
		pageService:     pageService,
		workflowService: workflowService,
	}
}

func (h *WSHandler) HandleWS(c *gin.Context) {
	token := c.Query("token")
	authToken := c.Query("auth_token")

	// If token is "cookie_managed" or empty, try to get it from auth_token query param first, then cookie
	if token == "" || token == "cookie_managed" {
		if authToken != "" {
			token = authToken
		} else if cookie, err := c.Cookie("auth_token"); err == nil {
			token = cookie
		}
	}
	slug := c.Query("slug")
	widgetID := c.Query("widget_id")
	statusOnly := c.Query("status_only") == "true"

	var access service.AccessContext
	access.StatusOnly = statusOnly

	var userObj *domain.User

	// 1. Try Admin/General JWT Token
	if claims, err := h.authService.ValidateToken(token); err == nil && claims != nil {
		if username, ok := claims["username"].(string); ok {
			userObj, _ = h.authService.GetUserByUsername(username)
			if userObj != nil {
				// User is authenticated, grant general access
				access.IsAdmin = true
			}
		}
	}

	if slug != "" {
		// 2. Try Public Page Token or RBAC
		page, err := h.pageService.GetPageBySlug(slug)
		if err == nil {
			if page.IsPublic {
				// Check expiration
				if page.ExpiresAt == nil || page.ExpiresAt.After(time.Now()) {
					// If page has no password, access granted
					if page.Password == "" {
						access.PageID = &page.ID
					} else if token != "" {
						// Validate page token
						if err := h.pageService.ValidatePageToken(page, token); err == nil {
							access.PageID = &page.ID
						}
					}
				}
			}

			// If not public or page token wasn't valid, check if user has RBAC access
			if access.PageID == nil && userObj != nil {
				nsIDStr := page.NamespaceID.String()
				pageIDStr := page.ID.String()
				if domain.HasPermission(userObj, "pages", "READ", &nsIDStr, &pageIDStr, nil) {
					access.PageID = &page.ID
					// Also grant admin if they have write/execute permissions, or just grant access
					access.IsAdmin = true // Give access to stream
				}
			}
		}
	}

	if !access.IsAdmin && access.PageID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// 3. Widget Live Stream Logic (Public Pages Only)
	var streamWidget func(ctx context.Context, writers ...io.Writer) (string, error)
	var streamInterval int
	if widgetID != "" && slug != "" && (access.PageID != nil || access.IsAdmin) {
		fmt.Printf("Widget WS request received: slug=%s, widgetID=%s\n", slug, widgetID)
		page, err := h.pageService.GetPageBySlug(slug)
		if err == nil {
			var layout struct {
				Widgets []struct {
					ID          string `json:"id"`
					Type        string `json:"type"`
					ServerID    string `json:"server_id"`
					Command     string `json:"command"`
					RunInterval int    `json:"run_interval"`
				} `json:"widgets"`
			}
			if err := json.Unmarshal([]byte(page.Layout), &layout); err == nil {
				for _, w := range layout.Widgets {
					if w.ID == widgetID && w.Type == "TERMINAL" {
						fmt.Printf("Found terminal widget %s. Setting up runner...\n", widgetID)
						parsedUUID, parseErr := uuid.Parse(w.ServerID)
						if parseErr == nil {
							streamInterval = w.RunInterval
							runner := h.terminalService.RunStreamingCommandOnServer(parsedUUID)
							streamWidget = func(ctx context.Context, writers ...io.Writer) (string, error) {
								return runner(ctx, w.Command, writers...)
							}
						}
						break
					}
				}
			}
		}
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade to websocket: %v", err)
		return
	}

	client := h.hub.Register(conn, access)

	// If this is a realtime terminal widget connection, automatically subscribe to its own ID as a topic
	// or handle it via the specialized streaming loop below.
	if widgetID != "" {
		h.hub.Subscribe(client, widgetID)
	}

	// If this is a realtime widget connection, start the persistent streaming session
	if streamWidget != nil {
		wWriter := &widgetWsWriter{conn: conn, mu: &sync.Mutex{}}
		go func() {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			for {
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					break // Connection closed
				}

				var cmdCtx context.Context
				var cmdCancel context.CancelFunc
				if streamInterval > 0 {
					cmdCtx, cmdCancel = context.WithTimeout(ctx, time.Duration(streamInterval)*time.Second)
				} else {
					cmdCtx, cmdCancel = context.WithCancel(ctx)
				}

				start := time.Now()

				wWriter.mu.Lock()
				msg := map[string]string{
					"type": "widget_stream_start",
				}
				jsonMsg, _ := json.Marshal(msg)
				conn.WriteMessage(websocket.TextMessage, jsonMsg)
				wWriter.mu.Unlock()

				fmt.Printf("Starting widget stream execution for widgetID: %s\n", widgetID)
				_, err := streamWidget(cmdCtx, wWriter)
				fmt.Printf("Widget stream execution ended. Err: %v\n", err)

				cmdCancel()

				if ctx.Err() != nil {
					break // The parent WebSocket context was cancelled (client dropped)
				}

				if streamInterval > 0 {
					elapsed := time.Since(start)
					intervalDur := time.Duration(streamInterval) * time.Second
					if elapsed < intervalDur {
						select {
						case <-ctx.Done():
							break
						case <-time.After(intervalDur - elapsed):
						}
					}
					continue
				}

				if err == nil || err == context.Canceled {
					break // Run once and exit if there's no interval
				}

				time.Sleep(2 * time.Second)
			}
		}()
	}

	// Keep connection alive until client closes it
	go func() {
		defer h.hub.Unregister(client)
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			fmt.Printf("[WS] Raw message received: %s\n", string(message))

			// Parse incoming message
			var msg struct {
				Type              string `json:"type"`
				SessionID         string `json:"session_id"`
				ExecutionID       string `json:"execution_id"`
				ParentExecutionID string `json:"parent_execution_id"`
				TargetID          string `json:"target_id"`
				Content           string `json:"content"`
			}
			if err := json.Unmarshal(message, &msg); err == nil {
				if msg.Type == "input" {
					fmt.Printf("[WS] Received input for session %s: %q\n", msg.SessionID, msg.Content)
					err := h.terminalService.HandleInput(msg.SessionID, msg.Content)
					if err != nil {
						fmt.Printf("[WS] Error handling input: %v\n", err)
					}
				} else if msg.Type == "request_catchup" && msg.ExecutionID != "" {
					fmt.Printf("[WS] Subscription request for: %s\n", msg.ExecutionID)
					// 1. Subscribe client to this execution's topic for future logs
					h.hub.Subscribe(client, msg.ExecutionID)

					go func() {
						// Indicate catchup start
						startMsg := map[string]string{
							"type":         "catchup_start",
							"execution_id": msg.ExecutionID,
						}
						jsonStartMsg, _ := json.Marshal(startMsg)
						client.Mu.Lock()
						conn.WriteMessage(websocket.TextMessage, jsonStartMsg)
						client.Mu.Unlock()

						// Defer sending catchup_end to ensure it always happens
						defer func() {
							endMsg := map[string]string{
								"type":         "catchup_end",
								"execution_id": msg.ExecutionID,
							}
							jsonEndMsg, _ := json.Marshal(endMsg)
							client.Mu.Lock()
							conn.WriteMessage(websocket.TextMessage, jsonEndMsg)
							client.Mu.Unlock()
						}()

						// 1.5 Replay buffered logs (crucial for transient/test runs)
						ramLogs := h.hub.GetLogBuffer(msg.ExecutionID)
						if len(ramLogs) > 0 {
							targetID := msg.TargetID
							for _, line := range ramLogs {
								h.sendLogMessage(client, msg.ExecutionID, targetID, line, true)
							}
						}

						// 1.6 Replay buffered step/group/execution statuses
						h.replayBufferedStatuses(conn, client, msg.ExecutionID)

						// 2. Fetch execution details to find parent if not provided
						// Skip DB lookup if this is a transient (test) execution to avoid log noise
						if h.hub.IsTransient(msg.ExecutionID) {
							return
						}

						execID, _ := uuid.Parse(msg.ExecutionID)
						execution, err := h.workflowService.GetExecution(execID, userObj)

						if err == nil {
							// 3. Stream parent logs first if it's a rerun
							parentIDStr := msg.ParentExecutionID
							if parentIDStr == "" && execution.ParentExecutionID != nil {
								parentIDStr = execution.ParentExecutionID.String()
							}

							if parentIDStr != "" {
								parentID, pErr := uuid.Parse(parentIDStr)
								if pErr == nil {
									parentExec, pDetailsErr := h.workflowService.GetExecution(parentID, userObj)
									if pDetailsErr == nil && parentExec.LogPath != "" {
										targetID := msg.TargetID
										if targetID == "" {
											targetID = execution.WorkflowID.String()
										}
										h.sendLogMessage(client, msg.ExecutionID, targetID, "\033[1;30m--- PREVIOUS EXECUTION LOGS ---\033[0m\n", true)
										h.streamFileLogs(client, msg.ExecutionID, targetID, parentExec.LogPath)
										h.sendLogMessage(client, msg.ExecutionID, targetID, "\033[1;30m--- END OF PREVIOUS EXECUTION ---\033[0m\n\n", true)
									}
								}
							}

							// 4. Stream current execution logs
							if execution.LogPath != "" {
								targetID := msg.TargetID
								if targetID == "" {
									targetID = execution.WorkflowID.String()
								}

								// If target is a specific step, we might need a different log file
								// (Assuming steps write to separate files or we filter the main log)
								// For now, if it's GLOBAL or the Workflow ID, we stream the main log.
								if targetID == "GLOBAL" || targetID == execution.WorkflowID.String() {
									h.streamFileLogs(client, msg.ExecutionID, targetID, execution.LogPath)
								} else {
									// Specific step/group catchup
									// The main log contains all output, so we stream it but we should ideally filter.
									// However, for simplicity and since we are already reading from disk, we'll just stream the main log.
									// If steps have separate logs in data/logs/executions/<exec_id>/<step_id>.log, we use that.
									stepLogPath := filepath.Join(filepath.Dir(execution.LogPath), targetID+".log")
									if _, err := os.Stat(stepLogPath); err == nil {
										h.streamFileLogs(client, msg.ExecutionID, targetID, stepLogPath)
									} else {
										// Fallback to main log if step-specific log doesn't exist
										h.streamFileLogs(client, msg.ExecutionID, targetID, execution.LogPath)
									}
								}
							}
						}

						// If execution logic below fails, defer above will still send catchup_end
					}()
				} else if msg.Type == "subscribe" && msg.ExecutionID != "" {
					h.hub.Subscribe(client, msg.ExecutionID)
					// Also replay statuses on subscribe so the client is always current
					h.replayBufferedStatuses(conn, client, msg.ExecutionID)
				} else if msg.Type == "unsubscribe" && msg.ExecutionID != "" {
					h.hub.Unsubscribe(client, msg.ExecutionID)
				}
			}
		}
	}()
}

func (h *WSHandler) replayBufferedStatuses(conn *websocket.Conn, client *service.Client, executionID string) {
	bufferedStatuses := h.hub.GetStepStatuses(executionID)
	for tid, bs := range bufferedStatuses {
		statusMsg := map[string]string{
			"type":         "status",
			"target_id":    tid,
			"execution_id": executionID,
			"target_type":  bs.Type,
			"status":       bs.Status,
		}
		jsonStatusMsg, _ := json.Marshal(statusMsg)
		client.Mu.Lock()
		conn.WriteMessage(websocket.TextMessage, jsonStatusMsg)
		client.Mu.Unlock()
	}
}

func (h *WSHandler) sendLogMessage(client *service.Client, executionID, targetID, content string, isCatchup bool) {
	resp := map[string]interface{}{
		"type":         "log",
		"execution_id": executionID,
		"content":      content,
		"target_id":    targetID,
		"is_catchup":   isCatchup,
	}
	jsonResp, _ := json.Marshal(resp)
	client.Mu.Lock()
	client.Conn.WriteMessage(websocket.TextMessage, jsonResp)
	client.Mu.Unlock()
}

func (h *WSHandler) streamFileLogs(client *service.Client, executionID, targetID, logPath string) {
	file, err := os.Open(logPath)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		h.sendLogMessage(client, executionID, targetID, scanner.Text()+"\n", true)
	}
}

// widgetWsWriter writes streamed output directly to the WebSocket
type widgetWsWriter struct {
	conn *websocket.Conn
	mu   *sync.Mutex
}

func (w *widgetWsWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	msg := map[string]string{
		"type":    "widget_output",
		"content": string(p),
	}
	jsonMsg, _ := json.Marshal(msg)
	err = w.conn.WriteMessage(websocket.TextMessage, jsonMsg)
	return len(p), err
}
