package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os/exec"
	"time"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type ExecutorService struct {
	repo     domain.CommandRepository
	stepRepo domain.StepRepository
	hub      *Hub
}

type wsWriter struct {
	hub      *Hub
	targetID string
	buffer   io.Writer
}

func (w *wsWriter) Write(p []byte) (n int, err error) {
	n, err = w.buffer.Write(p)
	w.hub.BroadcastLog(w.targetID, string(p))
	return n, err
}

func NewExecutorService(repo domain.CommandRepository, stepRepo domain.StepRepository, hub *Hub) *ExecutorService {
	return &ExecutorService{
		repo:     repo,
		stepRepo: stepRepo,
		hub:      hub,
	}
}

func (s *ExecutorService) ExecuteCommand(ctx context.Context, commandID uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "commands", "EXECUTE")
	cmd, err := s.repo.GetByID(commandID, &scope)
	if err != nil {
		return err
	}

	steps, err := s.stepRepo.GetByCommandID(commandID)
	if err != nil {
		return err
	}

	cmd.Status = domain.StatusRunning
	now := time.Now()
	cmd.LastRun = &now
	s.repo.Update(cmd)

	for i := range steps {
		step := &steps[i]
		err := s.runStep(ctx, step)
		if err != nil {
			cmd.Status = domain.StatusFailed
			s.repo.Update(cmd)
			return err
		}
	}

	cmd.Status = domain.StatusSuccess
	return s.repo.Update(cmd)
}

func (s *ExecutorService) runStep(ctx context.Context, step *domain.Step) error {
	step.Status = domain.StatusRunning
	s.stepRepo.Update(step)

	// In a real app, we might want to use a more sophisticated shell exec
	c := exec.CommandContext(ctx, "sh", "-c", step.CommandText)
	var out bytes.Buffer
	writer := &wsWriter{hub: s.hub, targetID: step.CommandID.String(), buffer: &out}
	c.Stdout = writer
	c.Stderr = writer

	err := c.Run()
	step.Output = out.String()

	if err != nil {
		step.Status = domain.StatusFailed
		s.stepRepo.Update(step)
		return fmt.Errorf("step %d failed: %w, output: %s", step.Order, err, step.Output)
	}

	step.Status = domain.StatusSuccess
	return s.stepRepo.Update(step)
}
