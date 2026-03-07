package service

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type LogStream struct {
	Buffer       []string
	Ch           chan string
	LastActivity time.Time
	mu           sync.Mutex
}

type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	streams    map[string]*LogStream // Key: executionID
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
		broadcast:  make(chan []byte, 1024), // Larger buffer for non-blocking reliability
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
		streams:    make(map[string]*LogStream),
	}
}

func (h *Hub) CreateStream(executionID string) *LogStream {
	h.mu.Lock()
	defer h.mu.Unlock()
	stream := &LogStream{
		Buffer:       make([]string, 0),
		Ch:           make(chan string, 100),
		LastActivity: time.Now(),
	}
	h.streams[executionID] = stream
	return stream
}

func (h *Hub) GetStream(executionID string) (*LogStream, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	s, ok := h.streams[executionID]
	return s, ok
}

func (h *Hub) CloseStream(executionID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s, ok := h.streams[executionID]; ok {
		close(s.Ch)
		delete(h.streams, executionID)
	}
}

func (h *Hub) Run() {
	ticker := time.NewTicker(30 * time.Second)
	cleanupTicker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	defer cleanupTicker.Stop()

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
		case <-cleanupTicker.C:
			h.cleanupOrphanedStreams()
		}
	}
}

func (h *Hub) cleanupOrphanedStreams() {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := time.Now()
	for id, s := range h.streams {
		s.mu.Lock()
		if now.Sub(s.LastActivity) > 30*time.Minute {
			close(s.Ch)
			delete(h.streams, id)
			log.Printf("Cleaned up orphaned LogStream for execution: %s (Idle > 30m)", id)
		}
		s.mu.Unlock()
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
	// Buffer the log if a stream exists for this execution
	h.mu.Lock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		s.Buffer = append(s.Buffer, content)
		s.LastActivity = time.Now()
		select {
		case s.Ch <- content:
		default:
			// Stream channel full, drop to prevent stalling engine
		}
		s.mu.Unlock()
	}
	h.mu.Unlock()

	msg := map[string]string{
		"type":         "log",
		"target_id":    targetID,
		"execution_id": executionID,
		"content":      content,
	}
	jsonMsg, _ := json.Marshal(msg)

	// Non-blocking broadcast
	select {
	case h.broadcast <- jsonMsg:
	default:
		log.Printf("Warning: Broadcast log channel full, dropping message for %s", executionID)
	}
}

func (h *Hub) BroadcastStatus(targetID string, executionID string, targetType string, status string) {
	// Update stream activity if it exists
	h.mu.Lock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		s.LastActivity = time.Now()
		s.mu.Unlock()
	}
	h.mu.Unlock()

	msg := map[string]string{
		"type":         "status",
		"target_id":    targetID,
		"execution_id": executionID,
		"target_type":  targetType, // workflow, group, or step
		"status":       status,
	}
	jsonMsg, _ := json.Marshal(msg)

	// Non-blocking broadcast
	select {
	case h.broadcast <- jsonMsg:
	default:
		log.Printf("Warning: Broadcast status channel full, dropping message for %s", executionID)
	}
}

func (h *Hub) Register(conn *websocket.Conn) {
	h.register <- conn
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.unregister <- conn
}
