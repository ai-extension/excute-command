package service

import (
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/ssh"
)

type SSHPool struct {
	clients      map[uuid.UUID]*ssh.Client
	lastActivity map[uuid.UUID]time.Time
	mu           sync.Mutex
}

func NewSSHPool() *SSHPool {
	p := &SSHPool{
		clients:      make(map[uuid.UUID]*ssh.Client),
		lastActivity: make(map[uuid.UUID]time.Time),
	}
	go p.startCleanupTicker()
	return p
}

func (p *SSHPool) startCleanupTicker() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		p.cleanupIdleConnections()
	}
}

func (p *SSHPool) cleanupIdleConnections() {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	idleTimeout := 15 * time.Minute

	for id, lastActive := range p.lastActivity {
		if now.Sub(lastActive) > idleTimeout {
			if client, ok := p.clients[id]; ok {
				client.Close()
				delete(p.clients, id)
				delete(p.lastActivity, id)
				log.Printf("Closed idle SSH connection for server ID: %s (Idle > 15m)", id)
			}
		}
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
			p.lastActivity[server.ID] = time.Now() // Refresh activity
			return client, true, nil
		}
		// Connection dead or doesn't support keepalive (usually just returns error if dead)
		client.Close()
		delete(p.clients, server.ID)
		delete(p.lastActivity, server.ID)
		log.Printf("Cleaned up dead SSH connection for server: %s", server.Name)
	}

	newClient, err := ConnectSSH(server, vpnConnector)
	if err != nil {
		return nil, false, err
	}

	p.clients[server.ID] = newClient
	p.lastActivity[server.ID] = time.Now()
	log.Printf("Established new pooled SSH connection for server: %s", server.Name)
	return newClient, true, nil
}

func (p *SSHPool) CloseAll() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for id, client := range p.clients {
		client.Close()
		delete(p.clients, id)
		delete(p.lastActivity, id)
	}
}
