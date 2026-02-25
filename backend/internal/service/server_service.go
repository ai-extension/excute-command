package service

import (
	"bytes"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/ssh"
)

type ServerService struct {
	repo domain.ServerRepository
	hub  *Hub
}

func NewServerService(repo domain.ServerRepository, hub *Hub) *ServerService {
	return &ServerService{repo: repo, hub: hub}
}

func (s *ServerService) CreateServer(server *domain.Server) error {
	if server.ID == uuid.Nil {
		server.ID = uuid.New()
	}
	return s.repo.Create(server)
}

func (s *ServerService) GetServer(id uuid.UUID) (*domain.Server, error) {
	return s.repo.GetByID(id)
}

func (s *ServerService) ListServers() ([]domain.Server, error) {
	return s.repo.List()
}

func (s *ServerService) UpdateServer(server *domain.Server) error {
	return s.repo.Update(server)
}

func (s *ServerService) DeleteServer(id uuid.UUID) error {
	return s.repo.Delete(id)
}

func (s *ServerService) ExecuteCommand(serverID uuid.UUID, commandText string) (string, error) {
	server, err := s.repo.GetByID(serverID)
	if err != nil {
		return "", fmt.Errorf("failed to get server: %w", err)
	}

	var auth ssh.AuthMethod
	if server.AuthType == "PASSWORD" {
		auth = ssh.Password(server.Password)
	} else if server.AuthType == "PUBLIC_KEY" {
		signer, err := ssh.ParsePrivateKey([]byte(server.PrivateKey))
		if err != nil {
			return "", fmt.Errorf("failed to parse private key: %w", err)
		}
		auth = ssh.PublicKeys(signer)
	} else {
		return "", fmt.Errorf("unsupported auth type: %s", server.AuthType)
	}

	config := &ssh.ClientConfig{
		User:            server.User,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // For simplicity, in production you should verify host keys
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", server.Host, server.Port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return "", fmt.Errorf("failed to dial: %w", err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	var stdout, stderr bytes.Buffer
	stdoutWriter := &wsWriter{hub: s.hub, targetID: serverID.String(), buffer: &stdout}
	stderrWriter := &wsWriter{hub: s.hub, targetID: serverID.String(), buffer: &stderr}
	session.Stdout = stdoutWriter
	session.Stderr = stderrWriter

	if err := session.Run(commandText); err != nil {
		return stdout.String() + stderr.String(), fmt.Errorf("failed to run command: %w", err)
	}

	return stdout.String(), nil
}
