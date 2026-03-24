package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type ServerService struct {
	repo         domain.ServerRepository
	hub          *Hub
	vpnConnector *VpnConnector
	sshPool      *SSHPool
}

func NewServerService(repo domain.ServerRepository, hub *Hub, vpnConnector *VpnConnector, sshPool *SSHPool) *ServerService {
	return &ServerService{repo: repo, hub: hub, vpnConnector: vpnConnector, sshPool: sshPool}
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

func (s *ServerService) ListServersPaginated(limit, offset int, searchTerm string, authType string, vpnID *uuid.UUID, createdBy *uuid.UUID, user *domain.User) ([]domain.Server, int64, error) {
	scope := domain.GetPermissionScope(user, "servers", "READ")
	return s.repo.ListPaginated(limit, offset, searchTerm, authType, vpnID, createdBy, &scope)
}

func (s *ServerService) UpdateServer(server *domain.Server, user *domain.User) error {

	scope := domain.GetPermissionScope(user, "servers", "WRITE")
	existing, err := s.repo.GetByID(server.ID, &scope)
	if err != nil {
		return err
	}

	// Merge updatable fields from partial server into existing record
	if server.Name != "" {
		existing.Name = server.Name
	}
	if server.Description != "" {
		existing.Description = server.Description
	}
	if server.ConnectionType != "" {
		existing.ConnectionType = server.ConnectionType
	}
	if server.Host != "" {
		existing.Host = server.Host
	}
	if server.Port > 0 {
		existing.Port = server.Port
	}
	if server.User != "" {
		existing.User = server.User
	}
	if server.AuthType != "" {
		existing.AuthType = server.AuthType
	}
	if server.Password != "" {
		existing.Password = server.Password
	}
	if server.PrivateKey != "" {
		existing.PrivateKey = server.PrivateKey
	}
	if server.VpnID != nil {
		existing.VpnID = server.VpnID
	}
	if server.HostKeyFingerprint != "" {
		existing.HostKeyFingerprint = server.HostKeyFingerprint
	}

	return s.repo.Update(existing)
}

func (s *ServerService) DeleteServer(id uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "servers", "DELETE")
	server, err := s.repo.GetByID(id, &scope)
	if err != nil {
		return err
	}
	if server.ConnectionType == domain.ConnectionTypeLocal {
		return fmt.Errorf("cannot delete the local server")
	}
	return s.repo.Delete(id)
}

func (s *ServerService) getConnection(ctx context.Context, serverID uuid.UUID, user *domain.User, action string) (domain.ServerConnection, *domain.Server, error) {
	var server *domain.Server
	var err error

	if user == nil {
		scope := domain.PermissionScope{IsGlobal: true}
		server, err = s.repo.GetByID(serverID, &scope)
	} else {
		scope := domain.GetPermissionScope(user, "servers", action)
		server, err = s.repo.GetByID(serverID, &scope)
	}

	if err != nil {
		return nil, nil, err
	}

	conn, err := GetServerConnection(server, s.vpnConnector, s.sshPool)
	if err != nil {
		return nil, nil, err
	}

	return conn, server, nil
}

func (s *ServerService) ExecuteCommand(ctx context.Context, serverID uuid.UUID, commandText string, user *domain.User, writers ...io.Writer) (string, error) {
	conn, _, err := s.getConnection(ctx, serverID, user, "EXECUTE")
	if err != nil {
		return "", err
	}
	defer conn.Close()

	return conn.Execute(ctx, commandText, writers...)
}

func (s *ServerService) DownloadFileFromServer(ctx context.Context, serverID uuid.UUID, remotePath, localPath string, user *domain.User) error {
	conn, _, err := s.getConnection(ctx, serverID, user, "READ")
	if err != nil {
		return err
	}
	defer conn.Close()

	return conn.Download(ctx, remotePath, localPath)
}

func (s *ServerService) UploadFileToServers(ctx context.Context, serverIDs []uuid.UUID, localPath, remotePath string, user *domain.User) error {
	for _, serverID := range serverIDs {
		// Stop if context cancelled
		if err := ctx.Err(); err != nil {
			return err
		}

		err := func() error {
			conn, _, err := s.getConnection(ctx, serverID, user, "WRITE")
			if err != nil {
				return err
			}
			defer conn.Close()

			return conn.Upload(ctx, localPath, remotePath)
		}()

		if err != nil {
			return fmt.Errorf("failed to upload to server %s: %w", serverID, err)
		}
	}

	return nil
}

func (s *ServerService) GetServerMetrics(id uuid.UUID, user *domain.User) (*domain.ServerMetrics, error) {
	// OS-aware monitoring command for Linux and macOS
	monitorCmd := `
		if [[ "$(uname)" == "Darwin" ]]; then
			# macOS
			cpu=$(top -l 1 | grep "CPU usage" | head -n1 | awk '{print $3}' | sed 's/%//')
			ram=$(ps -A -o %mem | awk '{s+=$1} END {print s}')
			disk=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
			uptime=$(uptime | awk -F'up ' '{print $2}' | awk -F', ' '{print $1}')
			echo "$cpu|$ram|$disk|$uptime"
		else
			# Linux
			cpu=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
			ram=$(free -m | awk 'NR==2{printf "%.2f", $3*100/$2 }')
			disk=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
			uptime=$(uptime -p)
			echo "$cpu|$ram|$disk|$uptime"
		fi
	`

	output, err := s.ExecuteCommand(context.Background(), id, monitorCmd, user)
	if err != nil {
		return nil, err
	}

	parts := strings.Split(strings.TrimSpace(output), "|")
	if len(parts) < 4 {
		return nil, fmt.Errorf("unexpected metrics format: %s", output)
	}

	cpu, _ := strconv.ParseFloat(parts[0], 64)
	ram, _ := strconv.ParseFloat(parts[1], 64)
	disk, _ := strconv.ParseFloat(parts[2], 64)

	return &domain.ServerMetrics{
		CPUUsage:  cpu,
		RAMUsage:  ram,
		DiskUsage: disk,
		Uptime:    parts[3],
	}, nil
}
func (s *ServerService) ExecuteHttp(ctx context.Context, serverID uuid.UUID, method, url, body, headersStr string, user *domain.User, logWriter io.Writer) (string, error) {
	var headers map[string]string
	if headersStr != "" {
		json.Unmarshal([]byte(headersStr), &headers)
	}

	// 1. Check for curl existence
	checkCmd := "command -v curl >/dev/null 2>&1 && echo 'yes' || echo 'no'"
	hasCurl := false
	if serverID != uuid.Nil {
		out, _ := s.ExecuteCommand(ctx, serverID, checkCmd, user)
		if strings.TrimSpace(out) == "yes" {
			hasCurl = true
		}
	} else {
		// Local check
		_, err := exec.LookPath("curl")
		hasCurl = (err == nil)
	}

	if hasCurl {
		curlCmd := fmt.Sprintf("curl -s -X %s", strconv.Quote(method))
		for k, v := range headers {
			curlCmd += fmt.Sprintf(" -H %s", strconv.Quote(fmt.Sprintf("%s: %s", k, v)))
		}
		if body != "" {
			curlCmd += fmt.Sprintf(" -d %s", strconv.Quote(body))
		}
		curlCmd += fmt.Sprintf(" %s", strconv.Quote(url))

		return s.ExecuteCommand(ctx, serverID, curlCmd, user, logWriter)
	}

	// 2. Binary Injection Fallback (Trick #4)
	if logWriter != nil {
		fmt.Fprint(logWriter, "\033[90m⚙ curl not found, using httpget injection...\033[0m\n")
	}

	unameOut := "linux x86_64"
	if serverID != uuid.Nil {
		out, _ := s.ExecuteCommand(ctx, serverID, "uname -s; uname -m", user)
		unameOut = strings.ToLower(strings.TrimSpace(out))
	} else {
		c := exec.CommandContext(ctx, "sh", "-c", "uname -s; uname -m")
		b, _ := c.Output()
		unameOut = strings.ToLower(strings.TrimSpace(string(b)))
	}

	osPrefix := "linux"
	if strings.Contains(unameOut, "darwin") {
		osPrefix = "darwin"
	}

	goArch := "amd64"
	if strings.Contains(unameOut, "x86_64") || strings.Contains(unameOut, "amd64") {
		goArch = "amd64"
	} else if strings.Contains(unameOut, "aarch64") || strings.Contains(unameOut, "arm64") {
		goArch = "arm64"
	} else if strings.Contains(unameOut, "386") || strings.Contains(unameOut, "686") {
		goArch = "386"
	} else if strings.Contains(unameOut, "arm") {
		goArch = "arm"
	}

	baseDir, _ := os.Getwd()
	localBinary := filepath.Join(baseDir, "data", "httpget", "httpget-"+osPrefix+"-"+goArch)
	remoteBinary := "/tmp/httpget"

	if serverID != uuid.Nil {
		if _, err := os.Stat(localBinary); err == nil {
			upErr := s.UploadFileToServers(ctx, []uuid.UUID{serverID}, localBinary, remoteBinary, user)
			if upErr != nil && logWriter != nil {
				fmt.Fprintf(logWriter, "\033[1;33m⚠ Failed to inject httpget binary: %v\033[0m\n", upErr)
			}
		} else if logWriter != nil {
			fmt.Fprintf(logWriter, "\033[1;33m⚠ httpget binary for %s not found\033[0m\n", goArch)
		}
	} else {
		// For local fallback if curl is missing (unlikely but possible)
		remoteBinary = localBinary
	}

	// Construct httpget command
	httpgetCmd := fmt.Sprintf("chmod +x %s 2>/dev/null; %s -u %s -X %s -H %s",
		remoteBinary, remoteBinary, strconv.Quote(url), strconv.Quote(method), strconv.Quote(headersStr))
	if body != "" {
		httpgetCmd += fmt.Sprintf(" -d %s", strconv.Quote(body))
	}

	return s.ExecuteCommand(ctx, serverID, httpgetCmd, user, logWriter)
}
