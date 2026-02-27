package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/user/csm-backend/internal/domain"
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
		// Basic check for admin, actual fine-grained checks should use HasPermission
		username := c.GetString("username")
		if username == "admin" {
			c.Next()
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
		c.Abort()
	}
}

// HasPermission checks if the given user has the specified action permission for the resource.
// If resourceID is nil or empty, it checks if the user has the permission for ALL resources of that type.
func HasPermission(user *domain.User, permType, action string, resourceID *string) bool {
	// Root admin check
	if user.Username == "admin" {
		return true
	}

	for _, role := range user.Roles {
		for _, rp := range role.Permissions {
			if rp.Permission != nil && rp.Permission.Type == permType && rp.Permission.Action == action {
				// If this role permission applies to ALL resources (nil ResourceID), grant access.
				if rp.ResourceID == nil || *rp.ResourceID == "" {
					return true
				}
				// If checking a specific resource, verify it matches the grant.
				if resourceID != nil && *rp.ResourceID == *resourceID {
					return true
				}
			}
		}
	}
	return false
}
