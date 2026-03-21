package handler

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mark3labs/mcp-go/server"
	"github.com/user/csm-backend/internal/service"
)

type MCPHandler struct {
	mcpService *service.MCPService
	server     *server.StreamableHTTPServer
}

func NewMCPHandler(mcpService *service.MCPService) *MCPHandler {
	return &MCPHandler{
		mcpService: mcpService,
		server:     server.NewStreamableHTTPServer(mcpService.GetServer(), server.WithStateLess(true)),
	}
}

func (h *MCPHandler) enrichContext(c *gin.Context) *context.Context {
	ctx := c.Request.Context()

	if user, exists := c.Get("user"); exists {
		ctx = context.WithValue(ctx, "user", user)
	}
	if apiKeyID, exists := c.Get("api_key_id"); exists {
		ctx = context.WithValue(ctx, "api_key_id", apiKeyID)
	}

	return &ctx
}

func (h *MCPHandler) HandleMCP(c *gin.Context) {
	method := c.Request.Method

	ctx := h.enrichContext(c)
	req := c.Request.WithContext(*ctx)

	if method == "GET" || method == "POST" {
		h.server.ServeHTTP(c.Writer, req)
		return
	}

	switch method {
	case "DELETE":
		c.Status(200)
	default:
		c.JSON(http.StatusMethodNotAllowed, gin.H{"error": "Method not allowed"})
	}
}

func (h *MCPHandler) HandleSSE(c *gin.Context) {
	h.HandleMCP(c)
}

func (h *MCPHandler) HandleMessage(c *gin.Context) {
	h.HandleMCP(c)
}
