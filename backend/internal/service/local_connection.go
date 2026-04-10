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

// ExecuteWithTTY chạy lệnh trong PTY (pseudo-terminal) cục bộ.
// - Output được ghi ra tất cả writers.
// - Nếu stdinCh != nil, goroutine sẽ đọc từ channel và ghi vào stdin của PTY.
// TTY mode cho phép các lệnh cần tty (sudo, npm login, ...) hoạt động bình thường.
func (c *LocalConnection) ExecuteWithTTY(ctx context.Context, command string, stdinCh <-chan string, writers ...io.Writer) (string, error) {
	cmd := exec.CommandContext(ctx, "sh", "-c", command)

	// Spawn PTY
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return "", fmt.Errorf("failed to start pty: %w", err)
	}
	defer ptmx.Close()

	var capBuf bytes.Buffer

	// Build output pipeline: PTY master → capture buffer + all external writers
	var validWriters []io.Writer
	validWriters = append(validWriters, &capBuf)
	for _, w := range writers {
		if w != nil {
			validWriters = append(validWriters, w)
		}
	}
	mw := io.MultiWriter(validWriters...)

	// Goroutine: forward PTY output → writers (chạy như terminal thực)
	copyDone := make(chan struct{})
	go func() {
		defer close(copyDone)
		io.Copy(mw, ptmx) //nolint:errcheck — EOF là expected khi PTY đóng
	}()

	// Goroutine: forward stdinCh → PTY stdin (auto-input)
	if stdinCh != nil {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case line, ok := <-stdinCh:
					if !ok {
						return
					}
					ptmx.Write([]byte(line + "\n")) //nolint:errcheck
				}
			}
		}()
	}

	// Chờ process kết thúc hoặc context cancel
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	select {
	case <-ctx.Done():
		syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		<-done
		<-copyDone
		return capBuf.String(), ctx.Err()
	case err := <-done:
		<-copyDone // đảm bảo toàn bộ output đã flush
		if err != nil {
			return capBuf.String(), fmt.Errorf("tty command failed: %w", err)
		}
	}

	return capBuf.String(), nil
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
