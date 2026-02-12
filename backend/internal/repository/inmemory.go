package repository

import (
	"errors"
	"sync"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type InMemoryCommandRepo struct {
	mu       sync.RWMutex
	commands map[uuid.UUID]*domain.Command
}

func NewInMemoryCommandRepo() *InMemoryCommandRepo {
	return &InMemoryCommandRepo{
		commands: make(map[uuid.UUID]*domain.Command),
	}
}

func (r *InMemoryCommandRepo) Create(cmd *domain.Command) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.commands[cmd.ID] = cmd
	return nil
}

func (r *InMemoryCommandRepo) GetByID(id uuid.UUID) (*domain.Command, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	cmd, ok := r.commands[id]
	if !ok {
		return nil, errors.New("command not found")
	}
	return cmd, nil
}

func (r *InMemoryCommandRepo) List() ([]domain.Command, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var list []domain.Command
	for _, cmd := range r.commands {
		list = append(list, *cmd)
	}
	return list, nil
}

func (r *InMemoryCommandRepo) Update(cmd *domain.Command) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.commands[cmd.ID] = cmd
	return nil
}

func (r *InMemoryCommandRepo) Delete(id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.commands, id)
	return nil
}

type InMemoryStepRepo struct {
	mu    sync.RWMutex
	steps map[uuid.UUID]*domain.Step
}

func NewInMemoryStepRepo() *InMemoryStepRepo {
	return &InMemoryStepRepo{
		steps: make(map[uuid.UUID]*domain.Step),
	}
}

func (r *InMemoryStepRepo) Create(step *domain.Step) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.steps[step.ID] = step
	return nil
}

func (r *InMemoryStepRepo) GetByCommandID(commandID uuid.UUID) ([]domain.Step, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var list []domain.Step
	for _, step := range r.steps {
		if step.CommandID == commandID {
			list = append(list, *step)
		}
	}
	return list, nil
}

func (r *InMemoryStepRepo) Update(step *domain.Step) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.steps[step.ID] = step
	return nil
}

func (r *InMemoryStepRepo) Delete(id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.steps, id)
	return nil
}
