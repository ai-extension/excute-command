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
	// If the user has access to *some* items, we let them pass the middleware.
	// The DB repository layer will then filter the results using AllowedItemIDs.
	if resourceID == nil && (action == "READ" || action == "EXECUTE") {
		scope := GetPermissionScope(user, permType, action)
		fmt.Printf("DEBUG HasPermission: test user=%s, permType=%s, action=%s, scope=%+v\n", user.Username, permType, action, scope)
		if scope.IsGlobal || len(scope.AllowedItemIDs) > 0 || len(scope.AllowedNamespaceIDs) > 0 || len(scope.AllowedTagIDs) > 0 {
			return true
		}
	}

	fmt.Printf("DEBUG HasPermission: Failed. user=%s, permType=%s, action=%s, resourceID=%v\n", user.Username, permType, action, resourceID)
	return false
}

// checkLevel is a helper to check permission at a specific scope
func checkLevel(user *User, permType, action string, resourceID *string) bool {
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
					scope.IsGlobal = true // Has resource access across ALL namespaces
				} else {
					scope.AllowedNamespaceIDs = append(scope.AllowedNamespaceIDs, *rp.ResourceID)
				}
			}

			// 2. Check for hierarchy: Tag RESOURCE_* permissions
			if rp.Permission.Type == "tags" && rp.Permission.Action == "RESOURCE_"+action {
				if rp.ResourceID == nil || *rp.ResourceID == "" {
					scope.IsGlobal = true // Has resource access across ALL tags
				} else {
					scope.AllowedTagIDs = append(scope.AllowedTagIDs, *rp.ResourceID)
				}
			}

			// 3. Check for specific Item permissions
			if rp.Permission.Type == permType && rp.Permission.Action == action {
				if rp.ResourceID == nil || *rp.ResourceID == "" {
					scope.IsGlobal = true // Has global access to this resource type
				} else {
					scope.AllowedItemIDs = append(scope.AllowedItemIDs, *rp.ResourceID)
				}
			}
		}
	}

	return scope
}
