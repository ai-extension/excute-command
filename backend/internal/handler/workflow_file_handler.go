package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
)

type WorkflowFileHandler struct {
	service  *service.WorkflowFileService
	auditLog domain.AuditLogService
}

func NewWorkflowFileHandler(s *service.WorkflowFileService, auditLog domain.AuditLogService) *WorkflowFileHandler {
	return &WorkflowFileHandler{service: s, auditLog: auditLog}
}

func (h *WorkflowFileHandler) Upload(c *gin.Context) {
	wfID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow id"})
		return
	}

	targetPath := c.PostForm("target_path")
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	user, _ := c.Get("user")
	wfFile, err := h.service.UploadFile(wfID, file, targetPath, user.(*domain.User))
	if err != nil {
		h.auditLog.LogAction(c, "UPLOAD_FILE", "WORKFLOW", wfID.String(), map[string]string{"filename": file.Filename, "error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "UPLOAD_FILE", "WORKFLOW", wfID.String(), map[string]string{"filename": file.Filename, "file_id": wfFile.ID.String()}, "SUCCESS")
	c.JSON(http.StatusCreated, wfFile)
}

func (h *WorkflowFileHandler) List(c *gin.Context) {
	wfID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workflow id"})
		return
	}

	user, _ := c.Get("user")
	files, err := h.service.ListFiles(wfID, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, files)
}

func (h *WorkflowFileHandler) Delete(c *gin.Context) {
	fileID, err := uuid.Parse(c.Param("file_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file id"})
		return
	}

	user, _ := c.Get("user")
	// Try to get file for audit log context
	file, _ := h.service.GetFileByID(fileID, user.(*domain.User))

	if err := h.service.DeleteFile(fileID, user.(*domain.User)); err != nil {
		meta := map[string]string{"error": err.Error()}
		if file != nil {
			meta["filename"] = file.FileName
		}
		h.auditLog.LogAction(c, "DELETE_FILE", "WORKFLOW", fileID.String(), meta, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	meta := map[string]string{}
	if file != nil {
		meta["filename"] = file.FileName
	}
	h.auditLog.LogAction(c, "DELETE_FILE", "WORKFLOW", fileID.String(), meta, "SUCCESS")
	c.Status(http.StatusNoContent)
}

func (h *WorkflowFileHandler) UpdateTargetPath(c *gin.Context) {
	fileID, err := uuid.Parse(c.Param("file_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file id"})
		return
	}

	var req struct {
		TargetPath string `json:"target_path" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, _ := c.Get("user")
	updatedFile, err := h.service.UpdateTargetPath(fileID, req.TargetPath, user.(*domain.User))
	if err != nil {
		h.auditLog.LogAction(c, "UPDATE_FILE_PATH", "WORKFLOW", fileID.String(), map[string]string{"target_path": req.TargetPath, "error": err.Error()}, "FAILED")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.auditLog.LogAction(c, "UPDATE_FILE_PATH", "WORKFLOW", fileID.String(), map[string]string{"target_path": req.TargetPath}, "SUCCESS")
	c.JSON(http.StatusOK, updatedFile)
}
func (h *WorkflowFileHandler) UpdateSubstitution(c *gin.Context) {
	fileID, err := uuid.Parse(c.Param("file_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file id"})
		return
	}

	var req struct {
		UseSubstitution bool `json:"use_variable_substitution"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, _ := c.Get("user")
	updatedFile, err := h.service.UpdateSubstitution(fileID, req.UseSubstitution, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, updatedFile)
}

func (h *WorkflowFileHandler) Download(c *gin.Context) {
	fileID, err := uuid.Parse(c.Param("file_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid file id"})
		return
	}

	user, _ := c.Get("user")
	file, err := h.service.GetFileByID(fileID, user.(*domain.User))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.FileAttachment(file.LocalPath, file.FileName)
}
