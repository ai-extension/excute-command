package service

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type LogEntry struct {
	TargetID string
	Content  string
}

type LogStream struct {
	Buffer       []LogEntry
	Ch           chan string
	PageID       *uuid.UUID // Associated page if this is a public execution
	LastActivity time.Time
	mu           sync.Mutex
}

type AccessContext struct {
	IsAdmin bool
	PageID  *uuid.UUID // Which page this client is authorized to view (if public)
}

type Client struct {
	Conn   *websocket.Conn
	Access AccessContext
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
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
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 1024), // Larger buffer for non-blocking reliability
		register:   make(chan *Client),
		unregister: make(chan *Client),
		streams:    make(map[string]*LogStream),
	}
}

func (h *Hub) CreateStream(executionID string, pageID *uuid.UUID) *LogStream {
	h.mu.Lock()
	defer h.mu.Unlock()
	stream := &LogStream{
		Buffer:       make([]LogEntry, 0),
		Ch:           make(chan string, 100),
		PageID:       pageID,
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

func (h *Hub) GetBuffer(executionID string) []LogEntry {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		defer s.mu.Unlock()
		// Return a copy to avoid race conditions
		buf := make([]LogEntry, len(s.Buffer))
		copy(buf, s.Buffer)
		return buf
	}
	return nil
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
				client.Conn.Close()
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.processBroadcast(message)
		case <-ticker.C:
			h.processBroadcast([]byte(`{"type":"ping"}`))
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

func (h *Hub) processBroadcast(message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Parse message partially to find execution_id if it's a log/status update
	var meta struct {
		Type        string `json:"type"`
		ExecutionID string `json:"execution_id"`
	}
	json.Unmarshal(message, &meta)

	var streamPageID *uuid.UUID
	if meta.ExecutionID != "" {
		if s, ok := h.streams[meta.ExecutionID]; ok {
			streamPageID = s.PageID
		}
	}

	for client := range h.clients {
		// Security Check:
		// 1. Admins see everything.
		// 2. Public users only see messages with execution_id matching their authorized PageID.
		// 3. Pings are sent to everyone.
		isAllowed := false
		if meta.Type == "ping" || client.Access.IsAdmin {
			isAllowed = true
		} else if meta.ExecutionID != "" && streamPageID != nil && client.Access.PageID != nil {
			if streamPageID.String() == client.Access.PageID.String() {
				isAllowed = true
			}
		}

		if isAllowed {
			err := client.Conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Printf("websocket write error: %v", err)
				client.Conn.Close()
				delete(h.clients, client)
			}
		}
	}
}

func (h *Hub) BroadcastLog(targetID string, executionID string, content string) {
	// Buffer the log if a stream exists for this execution
	h.mu.Lock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		s.Buffer = append(s.Buffer, LogEntry{TargetID: targetID, Content: content})
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

func (h *Hub) Register(conn *websocket.Conn, access AccessContext) {
	h.register <- &Client{Conn: conn, Access: access}
}

func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}
