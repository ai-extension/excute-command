package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/pkg/sftp"
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

func (s *ServerService) ExecuteCommand(serverID uuid.UUID, commandText string, writers ...io.Writer) (string, error) {
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

	// Create multiwriters for capturing AND streaming
	stdoutWriters := append([]io.Writer{&stdout}, writers...)
	stderrWriters := append([]io.Writer{&stderr}, writers...)

	session.Stdout = io.MultiWriter(stdoutWriters...)
	session.Stderr = io.MultiWriter(stderrWriters...)

	if err := session.Run(commandText); err != nil {
		return stdout.String() + stderr.String(), fmt.Errorf("failed to run command: %w", err)
	}

	return stdout.String(), nil
}

func (s *ServerService) UploadFileToServers(ctx context.Context, serverIDs []uuid.UUID, localPath, remotePath string) error {
	localFile, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open local file %s: %w", localPath, err)
	}
	defer localFile.Close()

	fileInfo, err := localFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat local file: %w", err)
	}

	for _, serverID := range serverIDs {
		// Stop if context cancelled
		if err := ctx.Err(); err != nil {
			return err
		}

		server, err := s.repo.GetByID(serverID)
		if err != nil {
			return fmt.Errorf("failed to get server %s: %w", serverID, err)
		}

		var auth ssh.AuthMethod
		if server.AuthType == "PASSWORD" {
			auth = ssh.Password(server.Password)
		} else if server.AuthType == "PUBLIC_KEY" {
			signer, err := ssh.ParsePrivateKey([]byte(server.PrivateKey))
			if err != nil {
				return fmt.Errorf("server %s, failed to parse private key: %w", server.Name, err)
			}
			auth = ssh.PublicKeys(signer)
		} else {
			return fmt.Errorf("server %s, unsupported auth type: %s", server.Name, server.AuthType)
		}

		config := &ssh.ClientConfig{
			User:            server.User,
			Auth:            []ssh.AuthMethod{auth},
			HostKeyCallback: ssh.InsecureIgnoreHostKey(),
			Timeout:         10 * time.Second,
		}

		addr := fmt.Sprintf("%s:%d", server.Host, server.Port)
		client, err := ssh.Dial("tcp", addr, config)
		if err != nil {
			return fmt.Errorf("server %s, failed to dial ssh: %w", server.Name, err)
		}

		sftpClient, err := sftp.NewClient(client)
		if err != nil {
			client.Close()
			return fmt.Errorf("server %s, failed to start sftp subsystem: %w", server.Name, err)
		}

		// Ensure remote directory exists
		remoteDir := filepath.Dir(remotePath)
		if err := sftpClient.MkdirAll(remoteDir); err != nil {
			sftpClient.Close()
			client.Close()
			return fmt.Errorf("server %s, failed to create remote directory %s: %w", server.Name, remoteDir, err)
		}

		remoteFile, err := sftpClient.Create(remotePath)
		if err != nil {
			sftpClient.Close()
			client.Close()
			return fmt.Errorf("server %s, failed to create remote file %s: %w", server.Name, remotePath, err)
		}

		// Rewind local file for each server
		localFile.Seek(0, 0)
		_, err = io.Copy(remoteFile, localFile)

		// Attempt to set permissions similar to local or just 0644
		sftpClient.Chmod(remotePath, fileInfo.Mode())

		remoteFile.Close()
		sftpClient.Close()
		client.Close()

		if err != nil {
			return fmt.Errorf("server %s, failed to copy data to remote file: %w", server.Name, err)
		}
	}

	return nil
}
