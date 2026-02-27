package service

import (
	"fmt"
	"time"

	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/ssh"
)

func getSSHAuthMethod(authType, password, privateKey string) (ssh.AuthMethod, error) {
	if authType == "PASSWORD" {
		return ssh.Password(password), nil
	} else if authType == "PUBLIC_KEY" {
		signer, err := ssh.ParsePrivateKey([]byte(privateKey))
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %w", err)
		}
		return ssh.PublicKeys(signer), nil
	}
	return nil, fmt.Errorf("unsupported auth type: %s", authType)
}

func ConnectSSH(server *domain.Server) (*ssh.Client, error) {
	targetAuth, err := getSSHAuthMethod(server.AuthType, server.Password, server.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("target server %s: %w", server.Name, err)
	}

	targetConfig := &ssh.ClientConfig{
		User:            server.User,
		Auth:            []ssh.AuthMethod{targetAuth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	targetAddr := fmt.Sprintf("%s:%d", server.Host, server.Port)

	// Direct connection if no VPN
	if server.Vpn == nil {
		client, err := ssh.Dial("tcp", targetAddr, targetConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to dial target server: %w", err)
		}
		return client, nil
	}

	// Connect via VPN (Jump Host)
	vpnAuth, err := getSSHAuthMethod(server.Vpn.AuthType, server.Vpn.Password, server.Vpn.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("vpn %s: %w", server.Vpn.Name, err)
	}

	vpnConfig := &ssh.ClientConfig{
		User:            server.Vpn.User,
		Auth:            []ssh.AuthMethod{vpnAuth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	vpnAddr := fmt.Sprintf("%s:%d", server.Vpn.Host, server.Vpn.Port)

	vpnClient, err := ssh.Dial("tcp", vpnAddr, vpnConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to dial vpn jump host: %w", err)
	}

	// Dial the target server through the VPN connection
	conn, err := vpnClient.Dial("tcp", targetAddr)
	if err != nil {
		vpnClient.Close()
		return nil, fmt.Errorf("failed to dial target via vpn: %w", err)
	}

	// Establish SSH connection over the proxied connection
	ncc, chans, reqs, err := ssh.NewClientConn(conn, targetAddr, targetConfig)
	if err != nil {
		conn.Close()
		vpnClient.Close()
		return nil, fmt.Errorf("failed to establish ssh over proxy: %w", err)
	}

	targetClient := ssh.NewClient(ncc, chans, reqs)

	// Ensure that when the target client is closed, the underlying connections are also closed
	go func() {
		targetClient.Wait()
		vpnClient.Close()
	}()

	return targetClient, nil
}
