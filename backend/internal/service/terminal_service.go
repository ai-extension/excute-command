package service

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"sync"

	"github.com/creack/pty"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/ssh"
)

type TerminalSession struct {
	ID        uuid.UUID
	SSHClient *ssh.Client
	Session   *ssh.Session
	LocalCmd  *exec.Cmd
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
		return s.startLocalSession(user)
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
		if ts.Session != nil {
			ts.Session.Close()
		}
		if ts.SSHClient != nil {
			ts.SSHClient.Close()
		}
		if ts.Stdin != nil {
			ts.Stdin.Close()
		}
		if ts.LocalCmd != nil && ts.LocalCmd.Process != nil {
			ts.LocalCmd.Process.Kill()
		}
		delete(s.sessions, sessionID)
	}
}

func (s *TerminalService) startLocalSession(user *domain.User) (string, error) {
	shell := "/bin/bash"
	if runtime.GOOS == "darwin" {
		shell = "/bin/zsh"
	} else if os.Getenv("SHELL") != "" {
		shell = os.Getenv("SHELL")
	}

	cmd := exec.Command(shell)

	// Start the command with a pty
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return "", fmt.Errorf("failed to start local pty: %w", err)
	}

	sessionID := uuid.New().String()
	ts := &TerminalSession{
		ID:       uuid.MustParse(sessionID),
		LocalCmd: cmd,
		Stdin:    ptmx,
		Stdout:   ptmx,
	}

	s.mu.Lock()
	s.sessions[sessionID] = ts
	s.mu.Unlock()

	// Stream output to Hub
	go func() {
		defer s.CloseSession(sessionID)
		buf := make([]byte, 1024)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				s.hub.BroadcastLog(sessionID, string(buf[:n]))
			}
			if err != nil {
				break
			}
		}
		cmd.Wait()
	}()

	return sessionID, nil
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

// RunCommandOnServer connects to a server, runs the given command, and returns its combined output.
// It supports the local server (running command locally via /bin/sh) as well as remote SSH servers.
func (s *TerminalService) RunCommandOnServer(serverID uuid.UUID) func(command string) (string, error) {
	return func(command string) (string, error) {
		// Local server: run via /bin/sh
		if serverID == domain.LocalServerID {
			session := &localCmdSession{}
			return session.Run(command)
		}

		server, err := s.repo.GetByID(serverID, nil)
		if err != nil {
			return "", fmt.Errorf("server not found: %w", err)
		}

		client, err := ConnectSSH(server, s.vpnConnector)
		if err != nil {
			return "", fmt.Errorf("ssh connect failed: %w", err)
		}
		defer client.Close()

		sess, err := client.NewSession()
		if err != nil {
			return "", fmt.Errorf("ssh session failed: %w", err)
		}
		defer sess.Close()

		out, err := sess.CombinedOutput(command)
		return string(out), err
	}
}

// localCmdSession is a helper to run a command on the local machine.
type localCmdSession struct{}

func (l *localCmdSession) Run(command string) (string, error) {
	var buf bytes.Buffer
	cmd := exec.Command("/bin/sh", "-c", command)
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	_ = cmd.Run() // Ignore exit code; return combined output
	return buf.String(), nil
}
