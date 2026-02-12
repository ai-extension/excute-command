package repository

import (
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"gorm.io/gorm"
)

type PostgresCommandRepo struct {
	db *gorm.DB
}

func NewPostgresCommandRepo(db *gorm.DB) *PostgresCommandRepo {
	return &PostgresCommandRepo{db: db}
}

func (r *PostgresCommandRepo) Create(cmd *domain.Command) error {
	return r.db.Create(cmd).Error
}

func (r *PostgresCommandRepo) GetByID(id uuid.UUID) (*domain.Command, error) {
	var cmd domain.Command
	if err := r.db.Preload("Steps").First(&cmd, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &cmd, nil
}

func (r *PostgresCommandRepo) List() ([]domain.Command, error) {
	var cmds []domain.Command
	if err := r.db.Find(&cmds).Error; err != nil {
		return nil, err
	}
	return cmds, nil
}

func (r *PostgresCommandRepo) Update(cmd *domain.Command) error {
	return r.db.Save(cmd).Error
}

func (r *PostgresCommandRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Command{}, "id = ?", id).Error
}

type PostgresStepRepo struct {
	db *gorm.DB
}

func NewPostgresStepRepo(db *gorm.DB) *PostgresStepRepo {
	return &PostgresStepRepo{db: db}
}

func (r *PostgresStepRepo) Create(step *domain.Step) error {
	return r.db.Create(step).Error
}

func (r *PostgresStepRepo) GetByCommandID(commandID uuid.UUID) ([]domain.Step, error) {
	var steps []domain.Step
	if err := r.db.Find(&steps, "command_id = ?", commandID).Order("\"order\" asc").Error; err != nil {
		return nil, err
	}
	return steps, nil
}

func (r *PostgresStepRepo) Update(step *domain.Step) error {
	return r.db.Save(step).Error
}

func (r *PostgresStepRepo) Delete(id uuid.UUID) error {
	return r.db.Delete(&domain.Step{}, "id = ?", id).Error
}
