package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/user/csm-backend/internal/service"
)

func AuthMiddleware(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header format must be Bearer {token}"})
			c.Abort()
			return
		}

		claims, err := authService.ValidateToken(parts[1])
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			c.Abort()
			return
		}

		c.Set("user_id", claims["user_id"])
		c.Set("username", claims["username"])
		c.Next()
	}
}

func RBACMiddleware(requiredPermission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// This is a placeholder. In a full implementation, you'd fetch the user's permissions
		// from the database (or include them in the JWT claims) and check them here.
		// For now, we'll assume "admin" role has everything.

		// To be fully functional, this middleware needs access to userRepo or a processed list of permissions.
		// Let's keep it simple for now: if user is admin, allow.

		username := c.GetString("username")
		if username == "admin" {
			c.Next()
			return
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
		c.Abort()
	}
}
