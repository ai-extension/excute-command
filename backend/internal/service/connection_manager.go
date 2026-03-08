package service

import (
	"github.com/user/csm-backend/internal/domain"
)

func GetServerConnection(server *domain.Server, vpnConnector *VpnConnector, sshPool *SSHPool) (domain.ServerConnection, error) {
	if server.ConnectionType == domain.ConnectionTypeLocal {
		return NewLocalConnection(server), nil
	}
	if sshPool != nil {
		client, isPooled, err := sshPool.GetClient(server, vpnConnector)
		if err != nil {
			return nil, err
		}
		return &SSHConnection{client: client, server: server, pooled: isPooled}, nil
	}
	return NewSSHConnection(server, vpnConnector)
}
