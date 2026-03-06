package service

import (
	"context"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type ServerService struct {
	repo         domain.ServerRepository
	hub          *Hub
	vpnConnector *VpnConnector
}

func NewServerService(repo domain.ServerRepository, hub *Hub, vpnConnector *VpnConnector) *ServerService {
	return &ServerService{repo: repo, hub: hub, vpnConnector: vpnConnector}
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
	_, err := s.repo.GetByID(server.ID, &scope)
	if err != nil {
		return err
	}
	return s.repo.Update(server)
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

	conn, err := GetServerConnection(server, s.vpnConnector)
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
