package service

import (
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/ssh"
)

type SSHPool struct {
	clients map[uuid.UUID]*ssh.Client
	mu      sync.Mutex
}

func NewSSHPool() *SSHPool {
	return &SSHPool{
		clients: make(map[uuid.UUID]*ssh.Client),
	}
}

func (p *SSHPool) GetClient(server *domain.Server, vpnConnector *VpnConnector) (*ssh.Client, bool, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	client, ok := p.clients[server.ID]
	if ok {
		// Check if connection is still alive via a no-op request
		_, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
		if err == nil {
			return client, true, nil
		}
		// Connection dead or doesn't support keepalive (usually just returns error if dead)
		client.Close()
		delete(p.clients, server.ID)
		log.Printf("Cleaned up dead SSH connection for server: %s", server.Name)
	}

	newClient, err := ConnectSSH(server, vpnConnector)
	if err != nil {
		return nil, false, err
	}

	p.clients[server.ID] = newClient
	log.Printf("Established new pooled SSH connection for server: %s", server.Name)
	return newClient, true, nil
}

func (p *SSHPool) CloseAll() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for id, client := range p.clients {
		client.Close()
		delete(p.clients, id)
	}
}
