package service

import (
	"fmt"
	"io"
	"sync"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/ssh"
)

type TerminalSession struct {
	ID        uuid.UUID
	SSHClient *ssh.Client
	Session   *ssh.Session
	Stdin     io.WriteCloser
	Stdout    io.Reader
	Stderr    io.Reader
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

	if server.ID == domain.LocalServerID {
		return "", fmt.Errorf("terminal session is not supported for the local server")
	}

	client, err := ConnectSSH(server, s.vpnConnector)

	if err != nil {
		return "", err
	}

	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return "", fmt.Errorf("failed to create session: %w", err)
	}

	// Request PTY
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", 40, 80, modes); err != nil {
		session.Close()
		client.Close()
		return "", fmt.Errorf("failed to request pty: %w", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		return "", fmt.Errorf("failed to get stdin: %w", err)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		client.Close()
		return "", fmt.Errorf("failed to get stdout: %w", err)
	}

	sessionID := uuid.New().String()
	ts := &TerminalSession{
		ID:        uuid.MustParse(sessionID),
		SSHClient: client,
		Session:   session,
		Stdin:     stdin,
		Stdout:    stdout,
	}

	s.mu.Lock()
	s.sessions[sessionID] = ts
	s.mu.Unlock()

	// Start shell
	if err := session.Shell(); err != nil {
		s.CloseSession(sessionID)
		return "", fmt.Errorf("failed to start shell: %w", err)
	}

	// Stream output to Hub
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				s.hub.BroadcastLog(sessionID, string(buf[:n]))
			}
			if err != nil {
				s.CloseSession(sessionID)
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
		ts.Session.Close()
		ts.SSHClient.Close()
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
