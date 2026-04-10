package service

import (
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
)

type WorkflowFileService struct {
	repo    domain.WorkflowFileRepository
	baseDir string
}

func NewWorkflowFileService(repo domain.WorkflowFileRepository) *WorkflowFileService {
	// Root dir for all workflow uploads
	baseDir := filepath.Join("data", "uploads", "workflows")
	os.MkdirAll(baseDir, 0755)

	return &WorkflowFileService{
		repo:    repo,
		baseDir: baseDir,
	}
}

func (s *WorkflowFileService) UploadFile(workflowID uuid.UUID, file *multipart.FileHeader, targetPath string, user *domain.User) (*domain.WorkflowFile, error) {
	_ = domain.GetPermissionScope(user, "workflows", "WRITE")
	// For now we just add the param to satisfy handlers.
	// In a real scenario, we'd use the scope to filter or verify workflowID existence.

	if targetPath == "" {
		targetPath = fmt.Sprintf("/tmp/%s", file.Filename)
	}

	wfFile := &domain.WorkflowFile{
		ID:         uuid.New(),
		WorkflowID: workflowID,
		FileName:   file.Filename,
		FileSize:   file.Size,
		TargetPath: targetPath,
	}

	workflowDir := filepath.Join(s.baseDir, workflowID.String())
	if err := os.MkdirAll(workflowDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create workflow directory: %w", err)
	}

	localPath := filepath.Join(workflowDir, wfFile.ID.String()+"_"+file.Filename)
	wfFile.LocalPath = localPath

	src, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open uploaded file: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create destination file: %w", err)
	}
	defer dst.Close()

	if _, err = io.Copy(dst, src); err != nil {
		return nil, fmt.Errorf("failed to save file: %w", err)
	}

	wfFile.CreatedAt = time.Now()
	wfFile.UpdatedAt = time.Now()

	if err := s.repo.Create(wfFile); err != nil {
		// Clean up file if db insert fails
		os.Remove(localPath)
		return nil, err
	}

	return wfFile, nil
}

func (s *WorkflowFileService) ListFiles(workflowID uuid.UUID, user *domain.User) ([]domain.WorkflowFile, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.repo.GetByWorkflowID(workflowID, &scope)
}

func (s *WorkflowFileService) DeleteFile(fileID uuid.UUID, user *domain.User) error {
	scope := domain.GetPermissionScope(user, "workflows", "WRITE")
	file, err := s.repo.GetByID(fileID, &scope)
	if err != nil {
		return err
	}

	// Remove from filesystem
	if err := os.Remove(file.LocalPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete file from disk: %w", err)
	}

	return s.repo.Delete(fileID)
}

func (s *WorkflowFileService) UpdateTargetPath(fileID uuid.UUID, newTargetPath string, user *domain.User) (*domain.WorkflowFile, error) {
	scope := domain.GetPermissionScope(user, "workflows", "WRITE")
	file, err := s.repo.GetByID(fileID, &scope)
	if err != nil {
		return nil, err
	}

	file.TargetPath = newTargetPath
	file.UpdatedAt = time.Now()

	if err := s.repo.Update(file); err != nil {
		return nil, err
	}

	return file, nil
}

func (s *WorkflowFileService) UpdateSubstitution(fileID uuid.UUID, useSubstitution bool, user *domain.User) (*domain.WorkflowFile, error) {
	scope := domain.GetPermissionScope(user, "workflows", "WRITE")
	file, err := s.repo.GetByID(fileID, &scope)
	if err != nil {
		return nil, err
	}

	file.UseVariableSubstitution = useSubstitution
	file.UpdatedAt = time.Now()

	if err := s.repo.Update(file); err != nil {
		return nil, err
	}

	return file, nil
}

func (s *WorkflowFileService) GetFileByID(fileID uuid.UUID, user *domain.User) (*domain.WorkflowFile, error) {
	scope := domain.GetPermissionScope(user, "workflows", "READ")
	return s.repo.GetByID(fileID, &scope)
}
