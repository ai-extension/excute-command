package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/pkg/sftp"
	"github.com/user/csm-backend/internal/domain"
	"golang.org/x/crypto/ssh"
)

// SSHConnection implements domain.ServerConnection for remote servers
type SSHConnection struct {
	client *ssh.Client
	server *domain.Server
	pooled bool
}

func NewSSHConnection(server *domain.Server, vpnConnector *VpnConnector) (*SSHConnection, error) {
	client, err := ConnectSSH(server, vpnConnector)
	if err != nil {
		return nil, err
	}
	return &SSHConnection{client: client, server: server}, nil
}

// reapRemote force-kills the remote process recorded in pidPath — its PID, its
// process group (leading "-"), and its direct children (pkill -P) — over a fresh
// SSH session, then removes the pidfile. Immediate SIGKILL, no TERM grace, so a
// stop/timeout halts the command without delay. Best-effort + fully POSIX; the
// group/pkill variants cover the cases the bare PID misses, and pkill may be
// absent (busybox) so errors are swallowed.
func (c *SSHConnection) reapRemote(pidPath string) {
	ks, err := c.client.NewSession()
	if err != nil {
		return
	}
	defer ks.Close()
	_ = ks.Run(fmt.Sprintf(
		"P=$(cat %s 2>/dev/null); "+
			"if [ -n \"$P\" ]; then "+
			"kill -KILL -\"$P\" 2>/dev/null; kill -KILL \"$P\" 2>/dev/null; pkill -KILL -P \"$P\" 2>/dev/null; "+
			"fi; rm -f %s",
		pidPath, pidPath))
}

func (c *SSHConnection) Execute(ctx context.Context, command string, writers ...io.Writer) (string, error) {
	session, err := c.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	var stdout, stderr bytes.Buffer
	var filteredWriters []io.Writer
	for _, w := range writers {
		if w != nil {
			filteredWriters = append(filteredWriters, w)
		}
	}

	stdoutWriters := append([]io.Writer{&stdout}, filteredWriters...)
	stderrWriters := append([]io.Writer{&stderr}, filteredWriters...)

	session.Stdout = io.MultiWriter(stdoutWriters...)
	session.Stderr = io.MultiWriter(stderrWriters...)

	// Without a PTY, closing the SSH session does NOT reliably signal the remote
	// process, so a cancelled command can keep running (orphaned) on the server.
	// Mitigation: the remote shell records its PID to a pidfile (and removes it on
	// exit via a trap); on cancellation we reap it via reapRemote. echo/trap write
	// to a file, not stdout, so the command's real output (and the CWD marker) is
	// unaffected.
	pidPath := fmt.Sprintf("/tmp/.wf_%s.pid", uuid.New().String())
	wrapped := fmt.Sprintf("echo $$ > %s; trap 'rm -f %s' EXIT; %s", pidPath, pidPath, command)

	done := make(chan struct{})
	killDone := make(chan struct{})

	go func() {
		defer close(killDone)
		select {
		case <-ctx.Done():
			// Unblock the local Run first, then reap the remote process tree.
			session.Close()
			c.reapRemote(pidPath)
		case <-done:
		}
	}()

	runErr := session.Run(wrapped)
	close(done)
	<-killDone // ensure the reaper finished while c.client is still open

	if runErr != nil {
		if ctx.Err() != nil {
			return stdout.String() + stderr.String(), ctx.Err()
		}
		return stdout.String() + stderr.String(), fmt.Errorf("failed to run command: %w", runErr)
	}

	return stdout.String(), nil
}

func (c *SSHConnection) Upload(ctx context.Context, localPath, remotePath string) error {
	sftpClient, err := sftp.NewClient(c.client)
	if err != nil {
		// Fallback to SSH cat
		f, err := os.Open(localPath)
		if err != nil {
			return err
		}
		defer f.Close()
		return c.uploadFileViaSSH(f, remotePath)
	}
	defer sftpClient.Close()

	// Ensure remote directory exists
	remoteDir := filepath.Dir(remotePath)
	if err := sftpClient.MkdirAll(remoteDir); err != nil {
		return fmt.Errorf("failed to create remote directory %s: %w", remoteDir, err)
	}

	remoteFile, err := sftpClient.Create(remotePath)
	if err != nil {
		return fmt.Errorf("failed to create remote file %s: %w", remotePath, err)
	}
	defer remoteFile.Close()

	localFile, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer localFile.Close()

	_, err = io.Copy(remoteFile, localFile)
	return err
}

func (c *SSHConnection) Download(ctx context.Context, remotePath, localPath string) error {
	sftpClient, err := sftp.NewClient(c.client)
	if err != nil {
		// Fallback to SSH cat
		return c.downloadFileViaSSH(remotePath, localPath)
	}
	defer sftpClient.Close()

	remoteFile, err := sftpClient.Open(remotePath)
	if err != nil {
		return fmt.Errorf("failed to open remote file %s: %w", remotePath, err)
	}
	defer remoteFile.Close()

	localDir := filepath.Dir(localPath)
	if err := os.MkdirAll(localDir, 0755); err != nil {
		return fmt.Errorf("failed to create local directory %s: %w", localDir, err)
	}

	localFile, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("failed to create local file %s: %w", localPath, err)
	}
	defer localFile.Close()

	_, err = io.Copy(localFile, remoteFile)
	return err
}

func (c *SSHConnection) StartTerminal(ctx context.Context) (io.WriteCloser, io.Reader, io.Reader, error) {
	session, err := c.client.NewSession()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to create session: %w", err)
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", 40, 80, modes); err != nil {
		session.Close()
		return nil, nil, nil, fmt.Errorf("failed to request pty: %w", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		return nil, nil, nil, fmt.Errorf("failed to get stdin: %w", err)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		return nil, nil, nil, fmt.Errorf("failed to get stdout: %w", err)
	}

	if err := session.Shell(); err != nil {
		session.Close()
		return nil, nil, nil, fmt.Errorf("failed to start shell: %w", err)
	}

	return stdin, stdout, nil, nil // SSH session combined stdout/stderr into stdout for shell
}

// ExecuteWithTTY chạy lệnh trên remote server qua SSH với PTY được cấp.
// Cho phép các lệnh cần tty (sudo, npm login, ...) hoạt động bình thường.
// stdinCh: goroutine auto-input ghi vào đây để mô phỏng keystrokes.
func (c *SSHConnection) ExecuteWithTTY(ctx context.Context, command string, stdinCh <-chan string, writers ...io.Writer) (string, error) {
	session, err := c.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	// Request PTY — cho phép remote process thấy mình đang trong terminal
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", 40, 200, modes); err != nil {
		return "", fmt.Errorf("failed to request pty: %w", err)
	}

	// Stdin pipe để auto-input goroutine có thể ghi vào
	stdinPipe, err := session.StdinPipe()
	if err != nil {
		return "", fmt.Errorf("failed to get stdin pipe: %w", err)
	}
	defer stdinPipe.Close()

	var capBuf bytes.Buffer
	var validWriters []io.Writer
	validWriters = append(validWriters, &capBuf)
	for _, w := range writers {
		if w != nil {
			validWriters = append(validWriters, w)
		}
	}
	mw := io.MultiWriter(validWriters...)
	session.Stdout = mw
	session.Stderr = mw

	// Auto-input goroutine: đọc từ stdinCh → ghi vào stdin pipe của SSH session
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
					stdinPipe.Write([]byte(line + "\n")) //nolint:errcheck
				}
			}
		}()
	}

	// A PTY session.Close() only sends SIGHUP; commands that ignore SIGHUP (or
	// spawned children) survive a stop/timeout. So, like the non-PTY Execute, record
	// the remote shell PID and on cancellation reap it via reapRemote (SIGKILL of the
	// process, its group, and its direct children). The pidfile write/trap go to a
	// file (not the PTY), so interactive output and auto-input are unaffected.
	pidPath := fmt.Sprintf("/tmp/.wf_%s.pid", uuid.New().String())
	wrapped := fmt.Sprintf("echo $$ > %s; trap 'rm -f %s' EXIT; %s", pidPath, pidPath, command)

	done := make(chan struct{})
	killDone := make(chan struct{})
	go func() {
		defer close(killDone)
		select {
		case <-ctx.Done():
			// Unblock the local Run first, then reap the remote process tree.
			session.Close()
			c.reapRemote(pidPath)
		case <-done:
		}
	}()

	runErr := session.Run(wrapped)
	close(done)
	<-killDone // ensure the reaper finished while c.client is still open

	if runErr != nil {
		if ctx.Err() != nil {
			return capBuf.String(), ctx.Err()
		}
		return capBuf.String(), fmt.Errorf("tty command failed: %w", runErr)
	}
	return capBuf.String(), nil
}

func (c *SSHConnection) Close() error {
	if c.pooled {
		return nil // Client is managed by pool
	}
	return c.client.Close()
}

func (c *SSHConnection) uploadFileViaSSH(localFile *os.File, remotePath string) error {
	session, err := c.client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	remoteDir := filepath.Dir(remotePath)
	mkdirCmd := fmt.Sprintf("mkdir -p %s", remoteDir)
	session.Run(mkdirCmd)

	session2, _ := c.client.NewSession()
	defer session2.Close()
	session2.Stdin = localFile
	cmd := fmt.Sprintf("cat > %s", remotePath)
	return session2.Run(cmd)
}

func (c *SSHConnection) downloadFileViaSSH(remotePath, localPath string) error {
	session, err := c.client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	localDir := filepath.Dir(localPath)
	os.MkdirAll(localDir, 0755)

	localFile, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer localFile.Close()

	session.Stdout = localFile
	cmd := fmt.Sprintf("cat %s", remotePath)
	return session.Run(cmd)
}
