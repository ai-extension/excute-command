/**
 * Configuration for application resources and permissions.
 * This file centralizes system-wide resource definitions.
 */

// Define which resource types support tagging.
// Adding a resource type here allows tag-based 'RESOURCE_READ' permissions
// to automatically grant visibility to the corresponding menu items.
export const TAGGABLE_RESOURCES = [
    'workflows',
    'schedules'
];
