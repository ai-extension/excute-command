package domain

import (
	"fmt"
)

// HasPermission checks if a user has a specific permission, considering hierarchy.
func HasPermission(user *User, permType, action string, namespaceID *string, resourceID *string, tagIDs []string) bool {
	if user.Username == "admin" {
		return true
	}

	// 1. Check Namespace level: If user has RESOURCE_* permission on this namespace, grant access.
	if namespaceID != nil && *namespaceID != "" {
		if checkLevel(user, "namespaces", "RESOURCE_"+action, namespaceID) {
			return true
		}
	}

	// 2. Check Tag level: If user has RESOURCE_* permission on any of the tags, grant access.
	for _, tagID := range tagIDs {
		if tagID != "" {
			if checkLevel(user, "tags", "RESOURCE_"+action, &tagID) {
				return true
			}
		}
	}

	// 3. Check specific Item level: If user has direct permission on this item.
	if resourceID != nil && *resourceID != "" {
		if checkLevel(user, permType, action, resourceID) {
			return true
		}
	}

	// 4. Check Resource Type level: If user has global access to this resource type.
	if checkLevel(user, permType, action, nil) {
		return true
	}

	// 5. Fallback for List operations (no specific resource ID)
	if resourceID == nil && (action == "READ" || action == "EXECUTE") {
		scope := GetPermissionScope(user, permType, action)
		if scope.IsGlobal || len(scope.AllowedItemIDs) > 0 || len(scope.AllowedNamespaceIDs) > 0 || len(scope.AllowedTagIDs) > 0 {
			return true
		}
	}

	fmt.Printf("DEBUG HasPermission: Failed. user=%s, permType=%s, action=%s, resourceID=%v, roles_count=%d, direct_perms_count=%d\n",
		user.Username, permType, action, resourceID, len(user.Roles), len(user.Permissions))
	return false
}

// checkLevel is a helper to check permission at a specific scope
func checkLevel(user *User, permType, action string, resourceID *string) bool {
	// Check Role-based permissions
	for _, role := range user.Roles {
		for _, rp := range role.Permissions {
			if rp.Permission != nil && rp.Permission.Type == permType && rp.Permission.Action == action {
				if rp.ResourceID == nil || *rp.ResourceID == "" {
					return true
				}
				if resourceID != nil && *rp.ResourceID == *resourceID {
					return true
				}
			}
		}
	}

	// Check Direct User permissions (if any)
	for _, p := range user.Permissions {
		if p.Type == permType && p.Action == action {
			return true // For now, direct perms are always global scope or item scope is not handled here
		}
	}
	return false
}

// GetPermissionScope returns the allowed scopes for a user for a given permission type and action.
func GetPermissionScope(user *User, permType, action string) PermissionScope {
	scope := PermissionScope{
		IsGlobal:            false,
		AllowedItemIDs:      []string{},
		AllowedNamespaceIDs: []string{},
		AllowedTagIDs:       []string{},
	}

	if user == nil || user.Username == "admin" {
		scope.IsGlobal = true
		return scope
	}

	for _, role := range user.Roles {
		for _, rp := range role.Permissions {
			if rp.Permission == nil {
				continue
			}

			// 1. Check for hierarchy: Namespace RESOURCE_* permissions
			if rp.Permission.Type == "namespaces" && rp.Permission.Action == "RESOURCE_"+action {
				if rp.ResourceID == nil || *rp.ResourceID == "" {
					scope.IsGlobal = true
				} else {
					scope.AllowedNamespaceIDs = append(scope.AllowedNamespaceIDs, *rp.ResourceID)
				}
			}

			// 2. Check for hierarchy: Tag RESOURCE_* permissions
			if rp.Permission.Type == "tags" && rp.Permission.Action == "RESOURCE_"+action {
				if rp.ResourceID == nil || *rp.ResourceID == "" {
					scope.IsGlobal = true
				} else {
					scope.AllowedTagIDs = append(scope.AllowedTagIDs, *rp.ResourceID)
				}
			}

			// 3. Check for specific Item permissions
			if rp.Permission.Type == permType && rp.Permission.Action == action {
				if rp.ResourceID == nil || *rp.ResourceID == "" {
					scope.IsGlobal = true
				} else {
					scope.AllowedItemIDs = append(scope.AllowedItemIDs, *rp.ResourceID)
				}
			}
		}
	}

	// 4. Check Direct User permissions
	for _, p := range user.Permissions {
		if p.Type == permType && p.Action == action {
			scope.IsGlobal = true // Direct user perms currently assumed global
		}
		// Direct hierarchical perms could be added here
	}

	fmt.Printf("DEBUG GetPermissionScope: user=%s, permType=%s, action=%s, roles=%d, scope=%+v\n",
		user.Username, permType, action, len(user.Roles), scope)

	return scope
}
