package service

import (
	"github.com/user/csm-backend/internal/domain"
)

type SettingsService struct {
	repo domain.SystemSettingRepository
}

func NewSettingsService(repo domain.SystemSettingRepository) *SettingsService {
	return &SettingsService{repo: repo}
}

func (s *SettingsService) GetSetting(key string) (string, error) {
	setting, err := s.repo.GetByKey(key)
	if err != nil {
		return "", err
	}
	return setting.Value, nil
}

func (s *SettingsService) SetSetting(key, value string) error {
	setting := &domain.SystemSetting{
		Key:   key,
		Value: value,
	}
	return s.repo.Upsert(setting)
}

func (s *SettingsService) GetAll() ([]domain.SystemSetting, error) {
	return s.repo.List()
}
