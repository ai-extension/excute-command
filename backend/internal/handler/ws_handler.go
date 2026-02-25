package handler

import (
	"encoding/json"
	"log"
	"net/http"

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
}

func NewWSHandler(hub *service.Hub, terminalService *service.TerminalService) *WSHandler {
	return &WSHandler{hub: hub, terminalService: terminalService}
}

func (h *WSHandler) HandleWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade to websocket: %v", err)
		return
	}

	h.hub.Register(conn)

	// Keep connection alive until client closes it
	go func() {
		defer h.hub.Unregister(conn)
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}

			// Parse terminal input
			var msg struct {
				Type      string `json:"type"`
				SessionID string `json:"session_id"`
				Content   string `json:"content"`
			}
			if err := json.Unmarshal(message, &msg); err == nil && msg.Type == "input" {
				h.terminalService.HandleInput(msg.SessionID, msg.Content)
			}
		}
	}()
}
