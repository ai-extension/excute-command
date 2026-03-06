package service

import (
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type TerminalSession struct {
	ID     uuid.UUID
	Conn   domain.ServerConnection
	Stdin  io.WriteCloser
	Stdout io.Reader
	Stderr io.Reader
}

type TerminalService struct {
	repo         domain.ServerRepository
	hub          *Hub
	vpnConnector *VpnConnector
	sessions     map[string]*TerminalSession
	mu           sync.Mutex
}

func NewTerminalService(repo domain.ServerRepository, hub *Hub, vpnConnector *VpnConnector) *TerminalService {
	return &TerminalService{
		repo:         repo,
		hub:          hub,
		vpnConnector: vpnConnector,
		sessions:     make(map[string]*TerminalSession),
	}
}

func (s *TerminalService) StartSession(serverID uuid.UUID, user *domain.User) (string, error) {
	scope := domain.GetPermissionScope(user, "servers", "EXECUTE")
	server, err := s.repo.GetByID(serverID, &scope)
	if err != nil {
		return "", fmt.Errorf("failed to get server: %w", err)
	}

	conn, err := GetServerConnection(server, s.vpnConnector)
	if err != nil {
		return "", err
	}

	stdin, stdout, stderr, err := conn.StartTerminal(context.Background())
	if err != nil {
		conn.Close()
		return "", err
	}

	sessionID := uuid.New().String()
	ts := &TerminalSession{
		ID:     uuid.MustParse(sessionID),
		Conn:   conn,
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
	}

	s.mu.Lock()
	s.sessions[sessionID] = ts
	s.mu.Unlock()

	// Stream output to Hub
	go func() {
		defer s.CloseSession(sessionID)
		buf := make([]byte, 1024)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				s.hub.BroadcastLog(sessionID, string(buf[:n]))
			}
			if err != nil {
				break
			}
		}
	}()

	return sessionID, nil
}

func (s *TerminalService) CloseSession(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ts, ok := s.sessions[sessionID]; ok {
		if ts.Conn != nil {
			ts.Conn.Close()
		}
		delete(s.sessions, sessionID)
	}
}

func (s *TerminalService) HandleInput(sessionID string, input string) error {
	s.mu.Lock()
	ts, ok := s.sessions[sessionID]
	s.mu.Unlock()

	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	_, err := ts.Stdin.Write([]byte(input))
	return err
}

// RunCommandOnServer returns a function to run commands on a given server.
// It now uses the unified ServerConnection interface.
func (s *TerminalService) RunCommandOnServer(serverID uuid.UUID) func(command string) (string, error) {
	return func(command string) (string, error) {
		server, err := s.repo.GetByID(serverID, nil)
		if err != nil {
			return "", fmt.Errorf("server not found: %w", err)
		}

		conn, err := GetServerConnection(server, s.vpnConnector)
		if err != nil {
			return "", err
		}
		defer conn.Close()

		return conn.Execute(context.Background(), command)
	}
}
