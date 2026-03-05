package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/user/csm-backend/internal/service"
)

type SettingsHandler struct {
	settingsService *service.SettingsService
}

func NewSettingsHandler(settingsService *service.SettingsService) *SettingsHandler {
	return &SettingsHandler{settingsService: settingsService}
}

func (h *SettingsHandler) GetSettings(c *gin.Context) {
	settings, err := h.settingsService.GetAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make(map[string]string)
	for _, s := range settings {
		result[s.Key] = s.Value
	}

	c.JSON(http.StatusOK, result)
}

func (h *SettingsHandler) UpdateSetting(c *gin.Context) {
	var req struct {
		Key   string `json:"key" binding:"required"`
		Value string `json:"value" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.settingsService.SetSetting(req.Key, req.Value); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Setting updated successfully"})
}

func (h *SettingsHandler) GetPublicSettings(c *gin.Context) {
	allowReg, _ := h.settingsService.GetSetting("allow_registration")
	if allowReg == "" {
		allowReg = "false"
	}

	googleEnabled, _ := h.settingsService.GetSetting("google_auth_enabled")
	if googleEnabled == "" {
		googleEnabled = "false"
	}

	facebookEnabled, _ := h.settingsService.GetSetting("facebook_auth_enabled")
	if facebookEnabled == "" {
		facebookEnabled = "false"
	}

	c.JSON(http.StatusOK, gin.H{
		"allow_registration":    allowReg == "true",
		"google_auth_enabled":   googleEnabled == "true",
		"facebook_auth_enabled": facebookEnabled == "true",
	})
}
