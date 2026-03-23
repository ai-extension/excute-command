package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"github.com/creack/pty"
	"github.com/user/csm-backend/internal/domain"
)

// LocalConnection implements domain.ServerConnection for the local host
type LocalConnection struct {
	server *domain.Server
}

func NewLocalConnection(server *domain.Server) *LocalConnection {
	return &LocalConnection{server: server}
}

func (c *LocalConnection) Execute(ctx context.Context, command string, writers ...io.Writer) (string, error) {
	cmd := exec.Command("sh", "-c", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var stdout, stderr bytes.Buffer
	var filteredWriters []io.Writer
	for _, w := range writers {
		if w != nil {
			filteredWriters = append(filteredWriters, w)
		}
	}

	stdoutWriters := append([]io.Writer{&stdout}, filteredWriters...)
	stderrWriters := append([]io.Writer{&stderr}, filteredWriters...)

	cmd.Stdout = io.MultiWriter(stdoutWriters...)
	cmd.Stderr = io.MultiWriter(stderrWriters...)

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start local command: %w", err)
	}

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-ctx.Done():
		// Kill the entire process group
		syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		<-done // Wait for Wait() to return
		return stdout.String() + stderr.String(), ctx.Err()
	case err := <-done:
		if err != nil {
			return stdout.String() + stderr.String(), fmt.Errorf("failed to run local command: %w", err)
		}
	}

	return stdout.String(), nil
}

func (c *LocalConnection) Upload(ctx context.Context, localPath, remotePath string) error {
	return c.copyFileLocally(localPath, remotePath)
}

func (c *LocalConnection) Download(ctx context.Context, remotePath, localPath string) error {
	return c.copyFileLocally(remotePath, localPath)
}

func (c *LocalConnection) StartTerminal(ctx context.Context) (io.WriteCloser, io.Reader, io.Reader, error) {
	shell := detectShell()

	cmd := exec.Command(shell)
	homeDir, err := os.UserHomeDir()
	if err == nil {
		cmd.Dir = homeDir
	}

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to start local pty: %w", err)
	}

	return ptmx, ptmx, nil, nil
}

func (c *LocalConnection) Close() error {
	return nil
}

// detectShell tìm shell khả dụng trên hệ thống hiện tại.
// Ưu tiên: $SHELL env → bash → zsh → sh
func detectShell() string {
	if envShell := os.Getenv("SHELL"); envShell != "" {
		if _, err := exec.LookPath(envShell); err == nil {
			return envShell
		}
	}
	for _, sh := range []string{"bash", "zsh", "sh"} {
		if path, err := exec.LookPath(sh); err == nil {
			return path
		}
	}
	return "/bin/sh"
}

func (c *LocalConnection) copyFileLocally(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destDir := filepath.Dir(dst)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	if err != nil {
		return err
	}

	sourceInfo, err := os.Stat(src)
	if err == nil {
		os.Chmod(dst, sourceInfo.Mode())
	}
	return nil
}
