package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"

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

func (s *ServerService) CreateServer(server *domain.Server, user *domain.User) error {
	if server.ID == uuid.Nil {
		server.ID = uuid.New()
	}
	if user != nil {
		server.CreatedBy = &user.ID
		server.CreatedByUsername = user.Username
	}
	return s.repo.Create(server)
}

func (s *ServerService) GetServer(id uuid.UUID, user *domain.User) (*domain.Server, error) {
	scope := domain.GetPermissionScope(user, "servers", "READ")
	return s.repo.GetByID(id, &scope)
}

func (s *ServerService) ListServers(user *domain.User) ([]domain.Server, error) {
	scope := domain.GetPermissionScope(user, "servers", "READ")
	return s.repo.List(&scope)
}

func (s *ServerService) ListServersPaginated(limit, offset int, searchTerm string, authType string, vpnID *uuid.UUID, user *domain.User) ([]domain.Server, int64, error) {
	scope := domain.GetPermissionScope(user, "servers", "READ")
	return s.repo.ListPaginated(limit, offset, searchTerm, authType, vpnID, &scope)
}

func (s *ServerService) UpdateServer(server *domain.Server, user *domain.User) error {

	scope := domain.GetPermissionScope(user, "servers", "WRITE")
	_, err := s.repo.GetByID(server.ID, &scope)
	if err != nil {
		return err
	}
	return s.repo.Update(server)
}

func (s *ServerService) DeleteServer(id uuid.UUID, user *domain.User) error {
	if id == domain.LocalServerID {
		return fmt.Errorf("cannot delete the default local server")
	}
	scope := domain.GetPermissionScope(user, "servers", "DELETE")
	_, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return err
	}
	return s.repo.Delete(id)
}

func (s *ServerService) ExecuteCommand(serverID uuid.UUID, commandText string, user *domain.User, writers ...io.Writer) (string, error) {
	if serverID == domain.LocalServerID || serverID == uuid.Nil {
		return s.executeLocalCommand(commandText, writers...)
	}

	var server *domain.Server
	var err error

	if user == nil {
		// Internal system request: bypass RBAC
		scope := domain.PermissionScope{IsGlobal: true}
		server, err = s.repo.GetByID(serverID, &scope)
	} else {
		scope := domain.GetPermissionScope(user, "servers", "EXECUTE")
		server, err = s.repo.GetByID(serverID, &scope)
	}

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

func (s *ServerService) DownloadFileFromServer(ctx context.Context, serverID uuid.UUID, remotePath, localPath string, user *domain.User) error {
	if serverID == domain.LocalServerID || serverID == uuid.Nil {
		return s.copyFileLocally(remotePath, localPath)
	}

	var server *domain.Server
	var err error

	if user == nil {
		// Internal system request: bypass RBAC
		scope := domain.PermissionScope{IsGlobal: true}
		server, err = s.repo.GetByID(serverID, &scope)
	} else {
		scope := domain.GetPermissionScope(user, "servers", "READ")
		server, err = s.repo.GetByID(serverID, &scope)
	}

	if err != nil {
		return fmt.Errorf("failed to get server %s: %w", serverID, err)
	}

	client, err := ConnectSSH(server)
	if err != nil {
		return err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		// Fallback: Try downloading via SSH cat
		log.Printf("SFTP failed for server %s during download, attempting SSH fallback: %v", server.Name, err)
		return s.downloadFileViaSSH(client, remotePath, localPath)
	}
	defer sftpClient.Close()

	remoteFile, err := sftpClient.Open(remotePath)
	if err != nil {
		return fmt.Errorf("server %s, failed to open remote file %s: %w", server.Name, remotePath, err)
	}
	defer remoteFile.Close()

	// Ensure local directory exists
	localDir := filepath.Dir(localPath)
	if err := os.MkdirAll(localDir, 0755); err != nil {
		return fmt.Errorf("failed to create local directory %s: %w", localDir, err)
	}

	localFile, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("failed to create local file %s: %w", localPath, err)
	}
	defer localFile.Close()

	_, err = io.Copy(localFile, remoteFile)
	if err != nil {
		return fmt.Errorf("server %s, failed to download data from remote file: %w", server.Name, err)
	}

	return nil
}

func (s *ServerService) UploadFileToServers(ctx context.Context, serverIDs []uuid.UUID, localPath, remotePath string, user *domain.User) error {
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

		if serverID == domain.LocalServerID || serverID == uuid.Nil {
			if err := s.copyFileLocally(localPath, remotePath); err != nil {
				return fmt.Errorf("local server, failed to copy file: %w", err)
			}
			continue
		}

		var server *domain.Server
		var err error

		if user == nil {
			// Internal system request: bypass RBAC
			scope := domain.PermissionScope{IsGlobal: true}
			server, err = s.repo.GetByID(serverID, &scope)
		} else {
			scope := domain.GetPermissionScope(user, "servers", "WRITE")
			server, err = s.repo.GetByID(serverID, &scope)
		}

		if err != nil {
			return fmt.Errorf("failed to get server %s: %w", serverID, err)
		}

		client, err := ConnectSSH(server)

		if err != nil {
			return err
		}

		sftpClient, err := sftp.NewClient(client)
		if err != nil {
			// Fallback: Try uploading via SSH cat if SFTP subsystem is missing
			log.Printf("SFTP failed for server %s, attempting SSH fallback: %v", server.Name, err)
			localFile.Seek(0, 0)
			if fallbackErr := s.uploadFileViaSSH(client, localFile, remotePath); fallbackErr != nil {
				client.Close()
				return fmt.Errorf("server %s, sftp failed and ssh fallback failed: %w", server.Name, fallbackErr)
			}
			client.Close()
			continue
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

func (s *ServerService) downloadFileViaSSH(client *ssh.Client, remotePath, localPath string) error {
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	// Ensure local directory exists
	localDir := filepath.Dir(localPath)
	if err := os.MkdirAll(localDir, 0755); err != nil {
		return fmt.Errorf("failed to create local directory: %w", err)
	}

	localFile, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("failed to create local file: %w", err)
	}
	defer localFile.Close()

	session.Stdout = localFile
	cmd := fmt.Sprintf("cat %s", strconv.Quote(remotePath))
	if err := session.Run(cmd); err != nil {
		return fmt.Errorf("failed to download file via ssh cat: %w", err)
	}

	return nil
}

func (s *ServerService) uploadFileViaSSH(client *ssh.Client, localFile *os.File, remotePath string) error {
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	// Ensure remote directory exists
	remoteDir := filepath.Dir(remotePath)
	mkdirCmd := fmt.Sprintf("mkdir -p %s", strconv.Quote(remoteDir))
	if err := session.Run(mkdirCmd); err != nil {
		return fmt.Errorf("failed to create remote directory via ssh: %w", err)
	}

	// Create a new session for the actual transfer
	session, err = client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	session.Stdin = localFile
	cmd := fmt.Sprintf("cat > %s", strconv.Quote(remotePath))
	if err := session.Run(cmd); err != nil {
		return fmt.Errorf("failed to upload file via ssh cat: %w", err)
	}

	return nil
}

func (s *ServerService) executeLocalCommand(commandText string, writers ...io.Writer) (string, error) {
	cmd := exec.Command("sh", "-c", commandText)
	var stdout, stderr bytes.Buffer

	stdoutWriters := append([]io.Writer{&stdout}, writers...)
	stderrWriters := append([]io.Writer{&stderr}, writers...)

	cmd.Stdout = io.MultiWriter(stdoutWriters...)
	cmd.Stderr = io.MultiWriter(stderrWriters...)

	if err := cmd.Run(); err != nil {
		return stdout.String() + stderr.String(), fmt.Errorf("failed to run local command: %w", err)
	}

	return stdout.String(), nil
}

func (s *ServerService) copyFileLocally(localPath, remotePath string) error {
	sourceFile, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	// Ensure remote directory exists
	remoteDir := filepath.Dir(remotePath)
	if err := os.MkdirAll(remoteDir, 0755); err != nil {
		return err
	}

	destFile, err := os.Create(remotePath)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	if err != nil {
		return err
	}

	sourceInfo, err := os.Stat(localPath)
	if err == nil {
		os.Chmod(remotePath, sourceInfo.Mode())
	}

	return nil
}
