package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
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

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade to websocket: %v", err)
		return
	}

	client := &service.Client{Conn: conn, Access: access}
	h.hub.Register(conn, access)

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
