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

func (s *WorkflowFileService) UploadFile(workflowID uuid.UUID, file *multipart.FileHeader, targetPath string) (*domain.WorkflowFile, error) {
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

func (s *WorkflowFileService) ListFiles(workflowID uuid.UUID) ([]domain.WorkflowFile, error) {
	return s.repo.GetByWorkflowID(workflowID)
}

func (s *WorkflowFileService) DeleteFile(fileID uuid.UUID) error {
	file, err := s.repo.GetByID(fileID)
	if err != nil {
		return err
	}

	// Remove from filesystem
	if err := os.Remove(file.LocalPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete file from disk: %w", err)
	}

	return s.repo.Delete(fileID)
}

func (s *WorkflowFileService) UpdateTargetPath(fileID uuid.UUID, newTargetPath string) (*domain.WorkflowFile, error) {
	file, err := s.repo.GetByID(fileID)
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
