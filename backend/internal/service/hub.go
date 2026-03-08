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
	IsAdmin    bool
	PageID     *uuid.UUID // Which page this client is authorized to view (if public)
	StatusOnly bool
}

type Client struct {
	Conn   *websocket.Conn
	Access AccessContext
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
		broadcast:        make(chan []byte, 1024),
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
		// Return a copy
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
		// Also cleanup topic subscribers for this execution
		delete(h.topicSubscribers, executionID)
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
		if now.Sub(s.LastActivity) > 30*time.Minute {
			close(s.Ch)
			delete(h.streams, id)
			delete(h.topicSubscribers, id)
			log.Printf("Cleaned up orphaned LogStream for execution: %s (Idle > 30m)", id)
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
	json.Unmarshal(message, &meta)

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

		if isAllowed {
			if client.Access.StatusOnly && meta.Type == "log" {
				continue
			}

			err := client.Conn.WriteMessage(websocket.TextMessage, message)
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

	// 2. Optimization: Clear log from RAM after successful broadcast (per user request)
	if meta.Type == "log" && meta.ExecutionID != "" {
		if s, ok := h.streams[meta.ExecutionID]; ok {
			s.mu.Lock()
			// Clear buffer since it was just sent to active subscribers.
			// This implements the "queue-style" where data is discarded after transmission.
			// Catch-up will only show logs that were buffered BETWEEN catch-up request and now,
			// or we could keep a very small tail if needed. For now, following "clear after sending".
			s.Buffer = s.Buffer[:0]
			s.mu.Unlock()
		}
	}
}

func (h *Hub) BroadcastLog(targetID string, executionID string, content string) {
	h.mu.Lock()
	if s, ok := h.streams[executionID]; ok {
		s.mu.Lock()
		s.Buffer = append(s.Buffer, LogEntry{TargetID: targetID, Content: content})
		s.LastActivity = time.Now()
		select {
		case s.Ch <- content:
		default:
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

	select {
	case h.broadcast <- jsonMsg:
	default:
	}
}

func (h *Hub) BroadcastStatus(targetID string, executionID string, targetType string, status string) {
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
