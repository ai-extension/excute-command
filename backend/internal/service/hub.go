package service

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mu         sync.Mutex
}

type terminalMessage struct {
	SessionID string `json:"session_id"`
	Content   string `json:"content"`
	Type      string `json:"type"` // "input", "resize", etc.
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
	}
}

func (h *Hub) Run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Close()
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.broadcastToAll(message)
		case <-ticker.C:
			h.broadcastToAll([]byte(`{"type":"ping"}`))
		}
	}
}

func (h *Hub) broadcastToAll(message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.clients {
		err := client.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			log.Printf("websocket write error: %v", err)
			client.Close()
			delete(h.clients, client)
		}
	}
}

func (h *Hub) BroadcastLog(targetID string, executionID string, content string) {
	msg := map[string]string{
		"type":         "log",
		"target_id":    targetID,
		"execution_id": executionID,
		"content":      content,
	}
	jsonMsg, _ := json.Marshal(msg)
	h.broadcast <- jsonMsg
}

func (h *Hub) BroadcastStatus(targetID string, executionID string, targetType string, status string) {
	msg := map[string]string{
		"type":         "status",
		"target_id":    targetID,
		"execution_id": executionID,
		"target_type":  targetType, // workflow, group, or step
		"status":       status,
	}
	jsonMsg, _ := json.Marshal(msg)
	h.broadcast <- jsonMsg
}

func (h *Hub) Register(conn *websocket.Conn) {
	h.register <- conn
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.unregister <- conn
}
