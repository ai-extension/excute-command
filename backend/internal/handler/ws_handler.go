package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
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
}

func NewWSHandler(hub *service.Hub, terminalService *service.TerminalService, authService *service.AuthService, pageService *service.PageService) *WSHandler {
	return &WSHandler{
		hub:             hub,
		terminalService: terminalService,
		authService:     authService,
		pageService:     pageService,
	}
}

func (h *WSHandler) HandleWS(c *gin.Context) {
	token := c.Query("token")
	// If token is "cookie_managed" or empty, try to get it from cookie
	if token == "" || token == "cookie_managed" {
		if cookie, err := c.Cookie("auth_token"); err == nil {
			token = cookie
		}
	}
	slug := c.Query("slug")
	widgetID := c.Query("widget_id")

	var access service.AccessContext

	// 1. Try Admin JWT Token
	if claims, err := h.authService.ValidateToken(token); err == nil && claims != nil {
		access.IsAdmin = true
	} else if slug != "" {
		// 2. Try Public Page Token
		page, err := h.pageService.GetPageBySlug(slug)
		if err == nil && page.IsPublic {
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
	}

	if !access.IsAdmin && access.PageID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// 3. Widget Live Stream Logic (Public Pages Only)
	var streamWidget func(ctx context.Context, writers ...io.Writer) (string, error)
	if widgetID != "" && slug != "" && (access.PageID != nil || access.IsAdmin) {
		fmt.Printf("Widget WS request received: slug=%s, widgetID=%s\n", slug, widgetID)
		page, err := h.pageService.GetPageBySlug(slug)
		if err == nil {
			var layout struct {
				Widgets []struct {
					ID       string `json:"id"`
					Type     string `json:"type"`
					ServerID string `json:"server_id"`
					Command  string `json:"command"`
				} `json:"widgets"`
			}
			if err := json.Unmarshal([]byte(page.Layout), &layout); err == nil {
				for _, w := range layout.Widgets {
					if w.ID == widgetID && w.Type == "TERMINAL" {
						fmt.Printf("Found terminal widget %s. Setting up runner...\n", widgetID)
						parsedUUID, parseErr := uuid.Parse(w.ServerID)
						if parseErr == nil {
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

	client := &service.Client{Conn: conn, Access: access}
	h.hub.Register(conn, access)

	// If this is a realtime widget connection, start the persistent streaming session
	if streamWidget != nil {
		wWriter := &widgetWsWriter{conn: conn, mu: &sync.Mutex{}}
		go func() {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			// We can run the command in a loop to restart if it drops,
			// or just let the client reconnect. We will ping-pong it with a reconnect loop here:
			for {
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					break // Connection closed
				}

				wWriter.mu.Lock()
				msg := map[string]string{
					"type": "widget_stream_start",
				}
				jsonMsg, _ := json.Marshal(msg)
				conn.WriteMessage(websocket.TextMessage, jsonMsg)
				wWriter.mu.Unlock()

				fmt.Printf("Starting widget stream execution for widgetID: %s\n", widgetID)
				_, err := streamWidget(ctx, wWriter)
				fmt.Printf("Widget stream execution ended. Err: %v\n", err)
				if err == nil || err == context.Canceled {
					break
				}

				// Small delay before restart if command errored out
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

			// Parse incoming message
			var msg struct {
				Type        string `json:"type"`
				SessionID   string `json:"session_id"`
				ExecutionID string `json:"execution_id"`
				Content     string `json:"content"`
			}
			if err := json.Unmarshal(message, &msg); err == nil {
				if msg.Type == "input" {
					h.terminalService.HandleInput(msg.SessionID, msg.Content)
				} else if msg.Type == "request_catchup" && msg.ExecutionID != "" {
					buffer := h.hub.GetBuffer(msg.ExecutionID)

					// Send catchup_start to signal frontend to clear existing logs
					startMsg := map[string]string{
						"type":         "catchup_start",
						"execution_id": msg.ExecutionID,
					}
					jsonStartMsg, _ := json.Marshal(startMsg)
					conn.WriteMessage(websocket.TextMessage, jsonStartMsg)

					for _, entry := range buffer {
						resp := map[string]string{
							"type":         "log",
							"execution_id": msg.ExecutionID,
							"content":      entry.Content,
							"target_id":    entry.TargetID,
						}
						jsonResp, _ := json.Marshal(resp)
						conn.WriteMessage(websocket.TextMessage, jsonResp)
					}

					// Send catchup_end
					endMsg := map[string]string{
						"type":         "catchup_end",
						"execution_id": msg.ExecutionID,
					}
					jsonEndMsg, _ := json.Marshal(endMsg)
					conn.WriteMessage(websocket.TextMessage, jsonEndMsg)
				}
			}
		}
	}()
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
