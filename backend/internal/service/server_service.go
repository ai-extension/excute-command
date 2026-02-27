package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/pkg/sftp"
	"github.com/user/csm-backend/internal/domain"
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

	client, err := ConnectSSH(server)
	if err != nil {
		return "", err
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

		client, err := ConnectSSH(server)
		if err != nil {
			return err
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
