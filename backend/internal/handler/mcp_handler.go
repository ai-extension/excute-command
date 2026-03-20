package handler

import (
	"context"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/mark3labs/mcp-go/server"
	"github.com/user/csm-backend/internal/service"
)

type MCPHandler struct {
	mcpService *service.MCPService
	sseServer  *server.SSEServer
}

func NewMCPHandler(mcpService *service.MCPService) *MCPHandler {
	// Khởi tạo SSEServer, trỏ endpoint message cho các client POST vào
	// "/api/v1/mcp/messages" là endpoint chuẩn trên router
	return &MCPHandler{
		mcpService: mcpService,
		sseServer:  server.NewSSEServer(mcpService.GetServer(), server.WithMessageEndpoint("/api/mcp/messages")),
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

func (h *MCPHandler) HandleSSE(c *gin.Context) {
	log.Printf("[MCP] SSE connection attempt from %s", c.ClientIP())
	ctx := h.enrichContext(c)
	req := c.Request.WithContext(*ctx)
	h.sseServer.SSEHandler().ServeHTTP(c.Writer, req)
}

func (h *MCPHandler) HandleMessage(c *gin.Context) {
	log.Printf("[MCP] Message received from %s", c.ClientIP())
	ctx := h.enrichContext(c)
	req := c.Request.WithContext(*ctx)
	h.sseServer.MessageHandler().ServeHTTP(c.Writer, req)
}
