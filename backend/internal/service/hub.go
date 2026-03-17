package service

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type BufferedStatus struct {
	Status string `json:"status"`
	Type   string `json:"type"`
}

type LogStream struct {
	Ch           chan string
	Logs         []string   // In-memory buffer for transient/test runs
	PageID       *uuid.UUID // Associated page if this is a public execution
	LastActivity time.Time
	StepStatuses map[string]BufferedStatus // targetID -> BufferedStatus
	mu           sync.Mutex
}

type AccessContext struct {
	IsAdmin    bool
	PageID     *uuid.UUID // Which page this client is authorized to view (if public)
	StatusOnly bool
}

type Client struct {
	Conn   *websocket.Conn
	Access AccessContext
	Mu     sync.Mutex // Protects Conn from concurrent writes
}

type Hub struct {
	clients          map[*Client]bool
	topicSubscribers map[string]map[*Client]bool // Key: topic (executionID or global)
	broadcast        chan []byte
	register         chan *Client
	unregister       chan *Client
	subscribe        chan subscription
	unsubscribe      chan subscription
	streams          map[string]*LogStream // Key: executionID
	mu               sync.Mutex
}

type subscription struct {
	client  *Client
	topicID string
}

func NewHub() *Hub {
	return &Hub{
		clients:          make(map[*Client]bool),
		topicSubscribers: make(map[string]map[*Client]bool),
		broadcast:        make(chan []byte, 4096),
		register:         make(chan *Client),
		unregister:       make(chan *Client),
		subscribe:        make(chan subscription),
		unsubscribe:      make(chan subscription),
		streams:          make(map[string]*LogStream),
	}
}

func (h *Hub) CreateStream(executionID string, pageID *uuid.UUID) *LogStream {
	h.mu.Lock()
	defer h.mu.Unlock()
	stream := &LogStream{
		Ch:           make(chan string, 200),
		Logs:         make([]string, 0, 100),
		PageID:       pageID,
		LastActivity: time.Now(),
		StepStatuses: make(map[string]BufferedStatus),
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

// GetBuffer removed as per user request to use file-based logs

func (h *Hub) CloseStream(executionID string) {
	msg := map[string]string{
		"type":         "close_stream",
		"execution_id": executionID,
	}
	jsonMsg, _ := json.Marshal(msg)
	h.broadcast <- jsonMsg
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
			h.handleUnregister(client)
		case sub := <-h.subscribe:
			h.handleSubscribe(sub)
		case sub := <-h.unsubscribe:
			h.handleUnsubscribe(sub)
		case message := <-h.broadcast:
			h.processBroadcast(message)
		case <-ticker.C:
			h.processBroadcast([]byte(`{"type":"ping"}`))
		case <-cleanupTicker.C:
			h.cleanupOrphanedStreams()
		}
	}
}

func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		client.Conn.Close()
		// Cleanup all subscriptions for this client
		for topicID := range h.topicSubscribers {
			delete(h.topicSubscribers[topicID], client)
		}
	}
}

func (h *Hub) handleSubscribe(sub subscription) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.topicSubscribers[sub.topicID] == nil {
		h.topicSubscribers[sub.topicID] = make(map[*Client]bool)
	}
	h.topicSubscribers[sub.topicID][sub.client] = true
	log.Printf("[Hub] Client subscribed to topic: %s. Total subscribers: %d", sub.topicID, len(h.topicSubscribers[sub.topicID]))
}

func (h *Hub) handleUnsubscribe(sub subscription) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if subs, ok := h.topicSubscribers[sub.topicID]; ok {
		delete(subs, sub.client)
		if len(subs) == 0 {
			delete(h.topicSubscribers, sub.topicID)
		}
	}
}

func (h *Hub) cleanupOrphanedStreams() {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := time.Now()
	for id, s := range h.streams {
		s.mu.Lock()
		if now.Sub(s.LastActivity) > 15*time.Minute {
			close(s.Ch)
			delete(h.streams, id)
			delete(h.topicSubscribers, id)
			log.Printf("Cleaned up orphaned LogStream for execution: %s (Idle > 15m)", id)
		}
		s.mu.Unlock()
	}
}

func (h *Hub) processBroadcast(message []byte) {
	// Parse message partially to find execution_id
	var meta struct {
		Type        string `json:"type"`
		ExecutionID string `json:"execution_id"`
	}
	if err := json.Unmarshal(message, &meta); err != nil {
		log.Printf("[Hub] Failed to unmarshal broadcast meta: %v", err)
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	// 1. Determine target clients
	var targets map[*Client]bool
	if meta.Type == "ping" {
		targets = h.clients
	} else if meta.ExecutionID != "" {
		targets = h.topicSubscribers[meta.ExecutionID]
	} else {
		// Global message? Fallback to all clients for now
		targets = h.clients
	}

	var streamPageID *uuid.UUID
	if meta.ExecutionID != "" {
		if s, ok := h.streams[meta.ExecutionID]; ok {
			streamPageID = s.PageID
		}
	}

	for client := range targets {
		// Security Check
		isAllowed := false
		if meta.Type == "ping" || client.Access.IsAdmin {
			isAllowed = true
		} else if meta.ExecutionID != "" && streamPageID != nil && client.Access.PageID != nil {
			if streamPageID.String() == client.Access.PageID.String() {
				isAllowed = true
			}
		}

		if !isAllowed {
			log.Printf("[Hub] Message NOT allowed for client. Admin: %v, PageID: %v, StreamPageID: %v", client.Access.IsAdmin, client.Access.PageID, streamPageID)
		}

		if isAllowed {
			if client.Access.StatusOnly && meta.Type == "log" {
				continue
			}

			client.Mu.Lock()
			err := client.Conn.WriteMessage(websocket.TextMessage, message)
			client.Mu.Unlock()
			if err != nil {
				client.Conn.Close()
				delete(h.clients, client)
				// Subscription cleanup will happen on next unregister or here
				for topicID := range h.topicSubscribers {
					delete(h.topicSubscribers[topicID], client)
				}
			}
		}
	}

	// 2. Optimization: RAM buffer removed. Catchup handled by file reading.

	// 3. Graceful cleanup: Handle close_stream message in order
	if meta.Type == "close_stream" && meta.ExecutionID != "" {
		if s, ok := h.streams[meta.ExecutionID]; ok {
			close(s.Ch)
			delete(h.streams, meta.ExecutionID)
			delete(h.topicSubscribers, meta.ExecutionID)
			log.Printf("Gracefully closed LogStream for execution: %s", meta.ExecutionID)
		}
	}
}

func (h *Hub) BroadcastLog(targetID string, executionID string, content string) {
	h.mu.Lock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		s.LastActivity = time.Now()
		// Buffer logs for catchup (important for test runs)
		s.Logs = append(s.Logs, content)
		if len(s.Logs) > 1000 {
			s.Logs = s.Logs[len(s.Logs)-1000:]
		}

		select {
		case s.Ch <- content:
		default:
		}
		s.mu.Unlock()
	}
	h.mu.Unlock()

	msg := map[string]interface{}{
		"type":         "log",
		"target_id":    targetID,
		"execution_id": executionID,
		"content":      content,
		"is_catchup":   false,
	}
	jsonMsg, _ := json.Marshal(msg)

	h.broadcast <- jsonMsg
}

func (h *Hub) BroadcastStatus(targetID string, executionID string, targetType string, status string) {
	h.mu.Lock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		s.LastActivity = time.Now()
		if targetType == "step" || targetType == "group" {
			s.StepStatuses[targetID] = BufferedStatus{Status: status, Type: targetType}
		}
		s.mu.Unlock()
	}
	h.mu.Unlock()

	msg := map[string]string{
		"type":         "status",
		"target_id":    targetID,
		"execution_id": executionID,
		"target_type":  targetType,
		"status":       status,
	}
	jsonMsg, _ := json.Marshal(msg)

	select {
	case h.broadcast <- jsonMsg:
	default:
	}
}

func (h *Hub) Register(conn *websocket.Conn, access AccessContext) *Client {
	c := &Client{Conn: conn, Access: access}
	h.register <- c
	return c
}

func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

func (h *Hub) Subscribe(client *Client, executionID string) {
	h.subscribe <- subscription{client: client, topicID: executionID}
}

func (h *Hub) Unsubscribe(client *Client, executionID string) {
	h.unsubscribe <- subscription{client: client, topicID: executionID}
}

func (h *Hub) GetLogBuffer(executionID string) []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		defer s.mu.Unlock()
		cp := make([]string, len(s.Logs))
		copy(cp, s.Logs)
		return cp
	}
	return nil
}

func (h *Hub) GetStepStatuses(executionID string) map[string]BufferedStatus {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		defer s.mu.Unlock()
		copy := make(map[string]BufferedStatus)
		for k, v := range s.StepStatuses {
			copy[k] = v
		}
		return copy
	}
	return nil
}
