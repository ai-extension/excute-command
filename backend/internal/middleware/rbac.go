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
		var tokenStr string

		// 1. Try to get token from cookie first (preferred for web frontend)
		cookie, err := c.Cookie("auth_token")
		if err == nil && cookie != "" {
			tokenStr = cookie
		} else {
			// 2. Fallback to Authorization header (APIs)
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) == 2 && parts[0] == "Bearer" {
					tokenStr = parts[1]
				}
			}
		}

		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required (Missing cookie or Authorization header)"})
			c.Abort()
			return
		}

		claims, err := authService.ValidateToken(tokenStr)
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

func RBACMiddleware(userRepo domain.UserRepository, permType, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUser, _ := c.Get("user") // Attempt to get user object directly if set by previous middleware
		var user *domain.User
		var ok bool

		if currentUser != nil {
			user, ok = currentUser.(*domain.User)
		}

		if !ok {
			// fallback to fetching by username from context
			username := c.GetString("username")
			if username == "" {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
				c.Abort()
				return
			}

			var err error
			user, err = userRepo.GetByUsername(username)
			if err != nil {
				c.JSON(http.StatusForbidden, gin.H{"error": "User not found"})
				c.Abort()
				return
			}
			c.Set("user", user)
		}

		// Root admin check
		if user.Username == "admin" {
			c.Next()
			return
		}

		// Check for hierarchical permission
		resourceID := c.Param("id")
		namespaceID := c.Param("ns_id")

		var resIDPtr, nsIDPtr *string
		if resourceID != "" {
			resIDPtr = &resourceID
		}
		if namespaceID != "" {
			nsIDPtr = &namespaceID
		}

		// Tags logic skip for generic middleware
		if domain.HasPermission(user, permType, action, nsIDPtr, resIDPtr, nil) {
			c.Next()
			return
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
		c.Abort()
	}
}
