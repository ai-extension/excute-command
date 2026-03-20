package middleware

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/csm-backend/internal/domain"
	"github.com/user/csm-backend/internal/service"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func AuthMiddleware(authService *service.AuthService, userRepo domain.UserRepository, apiKeyRepo domain.APIKeyRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Try API Key first (automation friendly)
		apiKeyStr := c.GetHeader("X-API-Key")
		if strings.HasPrefix(c.Request.URL.Path, "/api/mcp") {
			log.Printf("[Auth] MCP request from %s, X-API-Key present: %v", c.ClientIP(), apiKeyStr != "")
		}
		if apiKeyStr != "" && len(apiKeyStr) > 8 {
			prefix := apiKeyStr[:8]
			keys, err := apiKeyRepo.ListByPrefix(prefix)
			if err == nil {
				for _, key := range keys {
					if err := bcrypt.CompareHashAndPassword([]byte(key.KeyHash), []byte(apiKeyStr)); err == nil {
						// Found a matching key
						user, err := userRepo.GetByID(key.UserID)
						if err == nil {
							c.Set("user_id", user.ID)
							c.Set("username", user.Username)
							c.Set("user", user)
							c.Set("api_key_scopes", key.Scopes)
							c.Set("api_key_id", key.ID)
							c.Set("api_key_is_mcp", key.IsMCP)

							// Update last used in background
							go apiKeyRepo.UpdateLastUsed(key.ID)

							c.Next()
							return
						}
					}
				}
			}
		}

		var tokenStr string

		// 2. Try to get token from cookie first (preferred for web frontend)
		cookie, err := c.Cookie("auth_token")
		if err == nil && cookie != "" {
			tokenStr = cookie
		} else {
			// 3. Fallback to Authorization header (APIs)
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) == 2 && parts[0] == "Bearer" {
					tokenStr = parts[1]
				}
			}
		}

		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required (Missing cookie, Authorization header, or API Key)"})
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

func OptionalAuthMiddleware(authService *service.AuthService, userRepo domain.UserRepository, apiKeyRepo domain.APIKeyRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Try API Key first
		apiKeyStr := c.GetHeader("X-API-Key")
		if apiKeyStr != "" && len(apiKeyStr) > 8 {
			prefix := apiKeyStr[:8]
			keys, err := apiKeyRepo.ListByPrefix(prefix)
			if err == nil {
				for _, key := range keys {
					if err := bcrypt.CompareHashAndPassword([]byte(key.KeyHash), []byte(apiKeyStr)); err == nil {
						user, err := userRepo.GetByID(key.UserID)
						if err == nil {
							c.Set("user_id", user.ID)
							c.Set("username", user.Username)
							c.Set("user", user)
							c.Set("api_key_scopes", key.Scopes)
							c.Set("api_key_id", key.ID)
							c.Set("api_key_is_mcp", key.IsMCP)
							go apiKeyRepo.UpdateLastUsed(key.ID)
							c.Next()
							return
						}
					}
				}
			}
		}

		var tokenStr string

		// 2. Try cookie
		cookie, err := c.Cookie("auth_token")
		if err == nil && cookie != "" {
			tokenStr = cookie
		} else {
			// 3. Fallback to Authorization header
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) == 2 && parts[0] == "Bearer" {
					tokenStr = parts[1]
				}
			}
		}

		if tokenStr == "" {
			c.Next() // Allow request without authentication
			return
		}

		claims, err := authService.ValidateToken(tokenStr)
		if err != nil {
			c.Next() // Allow request without valid authentication
			return
		}

		c.Set("user_id", claims["user_id"])
		c.Set("username", claims["username"])

		// Attempt to fetch and set user object so RBAC check later works
		username := claims["username"].(string)
		if user, err := userRepo.GetByUsername(username); err == nil {
			c.Set("user", user)
		}

		c.Next()
	}
}

func RBACMiddleware(db *gorm.DB, userRepo domain.UserRepository, permType, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		currentUser, _ := c.Get("user")
		var user *domain.User
		var ok bool

		if currentUser != nil {
			user, ok = currentUser.(*domain.User)
		}

		if !ok {
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

		// 1. API Key Scope Check
		if scopesVal, exists := c.Get("api_key_scopes"); exists {
			scopes := scopesVal.(string)
			if scopes != "" {
				allowed := false
				scopeList := strings.Split(scopes, ",")
				for _, s := range scopeList {
					if strings.TrimSpace(s) == permType {
						allowed = true
						break
					}
				}
				if !allowed {
					c.JSON(http.StatusForbidden, gin.H{"error": "API key does not have access to this resource type (" + permType + ")"})
					c.Abort()
					return
				}
			}
		}

		// Root admin check
		if user.Username == "admin" {
			c.Next()
			return
		}

		resourceID := c.Param("id")
		namespaceID := c.Param("ns_id")
		var tagIDs []string

		// Hierarchical Resolution: If we have a resource ID but no namespace ID in URL, try to resolve it from DB
		if resourceID != "" && isNamespaceScoped(permType) {
			if namespaceID == "" {
				namespaceID = resolveNamespaceFromDB(db, permType, resourceID)
			}
			tagIDs = resolveTagsFromDB(db, permType, resourceID)
		}

		// Add UUIDs to context for Audit Logging
		if namespaceID != "" {
			if nsUUID, err := uuid.Parse(namespaceID); err == nil {
				c.Set("namespace_id", nsUUID)
			}
		}
		if resourceID != "" {
			if resUUID, err := uuid.Parse(resourceID); err == nil {
				c.Set("resource_id", resUUID)
			}
		}

		var resIDPtr, nsIDPtr *string
		if resourceID != "" {
			resIDPtr = &resourceID
		}
		if namespaceID != "" {
			nsIDPtr = &namespaceID
		}

		if domain.HasPermission(user, permType, action, nsIDPtr, resIDPtr, tagIDs) {
			c.Next()
			return
		}

		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
		c.Abort()
	}
}

func isNamespaceScoped(permType string) bool {
	switch permType {
	case "workflows", "history", "executions", "variables", "global-variables", "schedules", "pages", "tags":
		return true
	default:
		return false
	}
}

func resolveNamespaceFromDB(db *gorm.DB, permType string, resourceID string) string {
	if resourceID == "" {
		return ""
	}
	var nsID string
	var table string

	switch permType {
	case "workflows":
		table = "workflows"
	case "schedules":
		table = "schedules"
	case "pages":
		table = "pages"
	case "tags":
		table = "tags"
	case "global-variables":
		table = "global_variables"
	case "executions":
		// For executions, we might need to join with workflows
		db.Table("workflow_executions").
			Select("workflows.namespace_id").
			Joins("join workflows on workflows.id = workflow_executions.workflow_id").
			Where("workflow_executions.id = ?", resourceID).
			Limit(1).Scan(&nsID)
		return nsID
	default:
		return ""
	}

	db.Table(table).Select("namespace_id").Where("id = ?", resourceID).Limit(1).Scan(&nsID)
	return nsID
}

func resolveTagsFromDB(db *gorm.DB, permType string, resourceID string) []string {
	if resourceID == "" {
		return nil
	}
	var tagIDs []string
	var joinTable, joinCol string

	switch permType {
	case "workflows":
		joinTable = "workflow_tags"
		joinCol = "workflow_id"
	case "schedules":
		joinTable = "schedule_tags"
		joinCol = "schedule_id"
	case "pages":
		joinTable = "page_tags"
		joinCol = "page_id"
	case "executions":
		// For executions, we resolve tags from the associated workflow
		db.Table("workflow_tags").
			Select("tag_id").
			Joins("join workflow_executions on workflow_executions.workflow_id = workflow_tags.workflow_id").
			Where("workflow_executions.id = ?", resourceID).
			Scan(&tagIDs)
		return tagIDs
	default:
		return nil
	}

	db.Table(joinTable).Select("tag_id").Where(joinCol+" = ?", resourceID).Scan(&tagIDs)
	return tagIDs
}
