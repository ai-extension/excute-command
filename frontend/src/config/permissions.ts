/**
 * Configuration for application resources and permissions.
 * This file centralizes system-wide resource definitions.
 */

// Define which resource types support tagging.
// Adding a resource type here allows tag-based 'RESOURCE_READ' permissions
// to automatically grant visibility to the corresponding menu items.
export const TAGGABLE_RESOURCES = [
    'workflows',
    'schedules',
    'pages',
    'history'
];

// Define which resource types are scoped within a namespace.
// Hierarchical permissions (e.g., namespace 'RESOURCE_READ') will only
// grant access to these specific resources.
export const NAMESPACE_SCOPED_RESOURCES = [
    'workflows',
    'history',
    'executions',
    'variables',
    'global-variables',
    'schedules',
    'pages',
    'tags',
    'dashboard'
];

