package service

import (
	"encoding/json"
	"io"
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
	logMirrors       map[string]*logMirror // Key: source (child) executionID
	mu               sync.Mutex
}

// logMirror duplicates a child execution's main log stream onto a parent: the
// parent step's terminal + step log file, and (when dstMainTargetID is set) the
// parent's global/aggregated terminal + main log file. It is registered while a
// WORKFLOW step (WaitToFinish=true) synchronously waits for its target workflow,
// so the child execution's output shows inline both under the parent step and in
// the parent's global view — live, on reconnect (catchup), and in the historical
// view (each view reads its own file). Only lines whose target_id ==
// sourceTargetID (the child workflow ID, i.e. the child's main log stream) are
// mirrored, to avoid duplicating the per-step trace stream which carries the
// same command output under a different target_id. The two destinations use
// distinct target_ids and distinct files, so no view sees a line twice.
type logMirror struct {
	sourceTargetID  string    // child workflow ID — only mirror this stream
	dstTargetID     string    // parent step ID
	dstExecutionID  string    // parent execution ID
	dstMainTargetID string    // parent workflow ID — global/aggregated terminal ("" to skip)
	file            io.Writer // parent step log file (for catchup/historical)
	mainFile        io.Writer // parent main log file (global catchup/historical; nil to skip)
	mu              sync.Mutex
	active          bool
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
		logMirrors:       make(map[string]*logMirror),
	}
}

// AddLogMirror starts mirroring the child execution srcExecutionID's main log
// stream (lines broadcast with target_id == sourceTargetID) onto the parent.
// It targets the parent step terminal (dstTargetID, dstExecutionID) and, when
// dstMainTargetID is non-empty, also the parent's global/aggregated terminal
// (dstMainTargetID, dstExecutionID) — so a WORKFLOW step's child output shows
// inline in the parent view without selecting the step, matching how LOCAL/
// REMOTE steps already surface there. file and mainFile, if non-nil, receive
// the same content so catchup/historical reads pick it up (step view and global
// view respectively). Call RemoveLogMirror when the synchronous wait ends
// (before the step log file is closed).
func (h *Hub) AddLogMirror(srcExecutionID, sourceTargetID, dstTargetID, dstExecutionID, dstMainTargetID string, file, mainFile io.Writer) {
	h.mu.Lock()
	h.logMirrors[srcExecutionID] = &logMirror{
		sourceTargetID:  sourceTargetID,
		dstTargetID:     dstTargetID,
		dstExecutionID:  dstExecutionID,
		dstMainTargetID: dstMainTargetID,
		file:            file,
		mainFile:        mainFile,
		active:          true,
	}
	h.mu.Unlock()
}

// RemoveLogMirror stops a mirror previously started with AddLogMirror. After it
// returns, no further writes to the mirror's file happen, so the caller may
// safely close that file.
func (h *Hub) RemoveLogMirror(srcExecutionID string) {
	h.mu.Lock()
	m := h.logMirrors[srcExecutionID]
	delete(h.logMirrors, srcExecutionID)
	h.mu.Unlock()
	if m != nil {
		m.mu.Lock()
		m.active = false
		m.mu.Unlock()
	}
}

func (h *Hub) CreateStream(executionID string, pageID *uuid.UUID) *LogStream {
	h.mu.Lock()
	defer h.mu.Unlock()
	stream := &LogStream{
		Ch:           make(chan string, 200),
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
		select {
		case s.Ch <- content:
		default:
		}
		s.mu.Unlock()
	}
	mir := h.logMirrors[executionID]
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

	// Mirror the child execution's main stream onto a parent step, if a
	// synchronous sub-workflow step is waiting on this execution.
	if mir != nil && targetID == mir.sourceTargetID {
		h.mirrorLog(mir, content)
	}
}

// mirrorLog forwards a child log line onto the parent. It appends to the parent
// step log file and (when configured) the parent main log file for catchup/
// historical reads, then broadcasts a copy under the parent step terminal
// (dstTargetID) and, when dstMainTargetID is set, under the parent global
// terminal (dstMainTargetID) — both keyed to the parent execution_id so the
// live views show it. The step terminal and the global view subscribe by
// (execution_id, target_id), so the two broadcasts never double up in one view.
func (h *Hub) mirrorLog(mir *logMirror, content string) {
	mir.mu.Lock()
	if !mir.active {
		mir.mu.Unlock()
		return
	}
	if mir.file != nil {
		mir.file.Write([]byte(content)) //nolint:errcheck
	}
	if mir.mainFile != nil {
		mir.mainFile.Write([]byte(content)) //nolint:errcheck
	}
	dstTarget, dstExec, dstMain := mir.dstTargetID, mir.dstExecutionID, mir.dstMainTargetID
	mir.mu.Unlock()

	// Keep the parent execution's stream alive so the long-running child does
	// not let cleanupOrphanedStreams reap the parent's subscription.
	h.mu.Lock()
	if s, ok := h.streams[dstExec]; ok {
		s.mu.Lock()
		s.LastActivity = time.Now()
		s.mu.Unlock()
	}
	h.mu.Unlock()

	h.emitMirrored(dstTarget, dstExec, content)
	if dstMain != "" {
		h.emitMirrored(dstMain, dstExec, content)
	}
}

// emitMirrored broadcasts a single mirrored log line under (targetID,
// executionID) on the parent execution's topic.
func (h *Hub) emitMirrored(targetID, executionID, content string) {
	mmsg := map[string]interface{}{
		"type":         "log",
		"target_id":    targetID,
		"execution_id": executionID,
		"content":      content,
		"is_catchup":   false,
	}
	jsonMmsg, _ := json.Marshal(mmsg)
	h.broadcast <- jsonMmsg
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

	// Status messages carry terminal state (RUNNING -> SUCCESS/FAILED). They must
	// not be dropped: a non-blocking send discarded the SUCCESS whenever the
	// channel was momentarily full (e.g. flooded by the step's own log output),
	// leaving the step stuck on RUNNING in the UI. Send blocking like BroadcastLog
	// so a full channel delays the status instead of losing it. The per-target
	// buffer above (s.StepStatuses) still backs late subscribers via catch-up.
	h.broadcast <- jsonMsg
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
