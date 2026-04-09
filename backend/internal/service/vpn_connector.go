package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/user/csm-backend/internal/domain"
)

type VpnConnector struct {
	// activeConnections maps interface names to their type
	activeConnections sync.Map
}

func NewVpnConnector() *VpnConnector {
	return &VpnConnector{}
}

// Connect establishes a VPN connection and returns the interface name and a cleanup function
func (v *VpnConnector) Connect(config *domain.VpnConfig) (string, func(), error) {
	switch config.VpnType {
	case "SSH":
		// SSH Jump Host is handled separately in ConnectSSH
		return "", func() {}, nil
	case "OPENVPN":
		return v.connectOpenVpn(config)
	case "WIREGUARD":
		return v.connectWireGuard(config)
	default:
		return "", func() {}, fmt.Errorf("unsupported vpn type: %s", config.VpnType)
	}
}

func (v *VpnConnector) connectOpenVpn(config *domain.VpnConfig) (string, func(), error) {
	tmpFile, err := v.writeTempConfig(config.ID.String(), ".ovpn", config.ConfigFile)
	if err != nil {
		return "", func() {}, err
	}

	// We'll use a unique name for the management socket/process if possible,
	// but OpenVPN usually creates tunX devices.
	// For simplicity, we assume the system handles device allocation.
	// In a real production environment, we'd need more robust management.

	cmd := exec.Command("sudo", "openvpn", "--config", tmpFile, "--daemon")
	if err := cmd.Run(); err != nil {
		os.Remove(tmpFile)
		return "", func() {}, fmt.Errorf("failed to start openvpn: %w", err)
	}

	// Wait for interface to appear (very naive implementation)
	// Improved version would parse logs or check ip addr
	time.Sleep(2 * time.Second)

	cleanup := func() {
		// This is tricky without a specific PID or interface name.
		// Usually we'd use --writepid.
		exec.Command("sudo", "pkill", "-f", tmpFile).Run()
		os.Remove(tmpFile)
	}

	return "tun", cleanup, nil
}

func (v *VpnConnector) connectWireGuard(config *domain.VpnConfig) (string, func(), error) {
	ifName := fmt.Sprintf("wg-%s", config.ID.String()[:8])
	tmpFile := filepath.Join("/etc/wireguard", ifName+".conf")

	// Requires sudo to write to /etc/wireguard
	err := exec.Command("sudo", "sh", "-c", fmt.Sprintf("echo %q > %s", config.ConfigFile, tmpFile)).Run()
	if err != nil {
		return "", func() {}, fmt.Errorf("failed to write wireguard config: %w", err)
	}

	cmd := exec.Command("sudo", "wg-quick", "up", ifName)
	if err := cmd.Run(); err != nil {
		exec.Command("sudo", "rm", "-f", tmpFile).Run()
		return "", func() {}, fmt.Errorf("failed to start wireguard (%s): %w", ifName, err)
	}

	cleanup := func() {
		exec.Command("sudo", "wg-quick", "down", ifName).Run()
		exec.Command("sudo", "rm", "-f", tmpFile).Run()
	}

	return ifName, cleanup, nil
}

func (v *VpnConnector) writeTempConfig(id, ext, content string) (string, error) {
	tmpDir := filepath.Join("data", "tmp", "vpn")
	if err := os.MkdirAll(tmpDir, 0700); err != nil {
		return "", err
	}

	tmpFile := filepath.Join(tmpDir, id+ext)
	if err := os.WriteFile(tmpFile, []byte(content), 0600); err != nil {
		return "", err
	}

	return tmpFile, nil
}
