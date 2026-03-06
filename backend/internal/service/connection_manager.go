package service

import (
	"github.com/user/csm-backend/internal/domain"
)

func GetServerConnection(server *domain.Server, vpnConnector *VpnConnector) (domain.ServerConnection, error) {
	if server.ConnectionType == domain.ConnectionTypeLocal {
		return NewLocalConnection(server), nil
	}
	return NewSSHConnection(server, vpnConnector)
}
