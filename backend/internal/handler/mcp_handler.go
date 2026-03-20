package handler

import (
	"context"
	"io"
	"log"
	"net/http"
	"strings"

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
	path := c.Request.URL.Path
	log.Printf("[MCP] >>> Incoming %s request on %s from %s", method, path, c.ClientIP())

	// Log headers (excluding sensitive ones or truncating)
	for name, values := range c.Request.Header {
		log.Printf("[MCP] Header: %s = %s", name, strings.Join(values, ", "))
	}

	if method == "POST" {
		// Log a bit of the body if it's a POST
		bodyBytes, _ := io.ReadAll(c.Request.Body)
		c.Request.Body = io.NopCloser(strings.NewReader(string(bodyBytes))) // Restore body for later
		bodyStr := string(bodyBytes)
		if len(bodyStr) > 500 {
			log.Printf("[MCP] Body (truncated): %s...", bodyStr[:500])
		} else {
			log.Printf("[MCP] Body: %s", bodyStr)
		}

		if strings.Contains(bodyStr, "\"method\":\"initialize\"") && c.Query("sessionId") == "" {
			log.Printf("[MCP] WARNING: Client sent 'initialize' without sessionId. SSE handshake (GET) must happen first!")
		}
	}

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
