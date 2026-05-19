import { PageLayout, PageWidget } from '../types';

export interface PageTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    layout: PageLayout;
}

const id = () => Math.random().toString(36).slice(2, 10);

export const PAGE_TEMPLATES: PageTemplate[] = [
    {
        id: 'blank',
        name: 'Blank Page',
        description: 'Start from scratch with an empty canvas',
        icon: 'blank',
        layout: { widgets: [] },
    },
    {
        id: 'team-links',
        name: 'Team Links Hub',
        description: 'A collection of useful links for your team',
        icon: 'links',
        layout: {
            widgets: (() => {
                const sectionId = id();
                return [
                    { id: id(), type: 'TEXT' as const, title: 'Welcome', size: 'full' as const, content: 'Quick access to all team resources. Click any link below to get started.' },
                    { id: sectionId, type: 'SECTION' as const, title: 'Quick Links', size: 'full' as const, description: 'Frequently used resources' },
                    { id: id(), type: 'LINK' as const, title: 'Documentation', size: 'third' as const, url: 'https://', label: 'Open Docs', new_tab: true, style: 'bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.3)]', parent_id: sectionId },
                    { id: id(), type: 'LINK' as const, title: 'Dashboard', size: 'third' as const, url: 'https://', label: 'View Dashboard', new_tab: true, style: 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]', parent_id: sectionId },
                    { id: id(), type: 'LINK' as const, title: 'Support', size: 'third' as const, url: 'https://', label: 'Get Help', new_tab: true, style: 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]', parent_id: sectionId },
                ];
            })(),
        },
    },
    {
        id: 'quick-actions',
        name: 'Quick Actions Panel',
        description: 'Common workflow actions with descriptions',
        icon: 'actions',
        layout: {
            widgets: (() => {
                const sectionId = id();
                return [
                    { id: id(), type: 'TEXT' as const, title: 'Operations Panel', size: 'full' as const, content: 'Use the buttons below to run common operations. Each button triggers a pre-configured workflow.' },
                    { id: sectionId, type: 'SECTION' as const, title: 'Actions', size: 'full' as const, description: 'Click to run' },
                    { id: id(), type: 'ENDPOINT' as const, title: 'Action 1', size: 'half' as const, workflow_id: '', label: 'Run Action', style: 'premium-gradient', show_log: true, description: 'Configure this with your workflow', parent_id: sectionId },
                    { id: id(), type: 'ENDPOINT' as const, title: 'Action 2', size: 'half' as const, workflow_id: '', label: 'Run Action', style: 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]', show_log: true, description: 'Configure this with your workflow', parent_id: sectionId },
                ];
            })(),
        },
    },
    {
        id: 'monitoring',
        name: 'Monitoring Dashboard',
        description: 'Service status indicators with an embedded dashboard',
        icon: 'monitoring',
        layout: {
            widgets: [
                { id: id(), type: 'TEXT' as const, title: 'System Status', size: 'full' as const, content: 'Real-time service health overview. Green = healthy, Yellow = degraded, Red = outage.' },
                { id: id(), type: 'STATUS' as const, title: 'API Server', size: 'third' as const, status_label: 'API Server', status_value: 'ok' as const },
                { id: id(), type: 'STATUS' as const, title: 'Database', size: 'third' as const, status_label: 'Database', status_value: 'ok' as const },
                { id: id(), type: 'STATUS' as const, title: 'Worker Queue', size: 'third' as const, status_label: 'Worker Queue', status_value: 'ok' as const },
                { id: id(), type: 'IFRAME' as const, title: 'Metrics Dashboard', size: 'full' as const, iframe_url: '', iframe_height: 500 },
            ],
        },
    },
    {
        id: 'status-page',
        name: 'Status Page',
        description: 'Public-facing service status page for your team',
        icon: 'status',
        layout: {
            widgets: (() => {
                const sectionId = id();
                return [
                    { id: id(), type: 'TEXT' as const, title: 'Service Status', size: 'full' as const, content: 'Current operational status of all services. Last updated automatically.' },
                    { id: sectionId, type: 'SECTION' as const, title: 'Services', size: 'full' as const, description: 'All monitored services' },
                    { id: id(), type: 'STATUS' as const, title: 'Web Application', size: 'half' as const, status_label: 'Web Application', status_value: 'ok' as const, description: 'Main web application', parent_id: sectionId },
                    { id: id(), type: 'STATUS' as const, title: 'API Gateway', size: 'half' as const, status_label: 'API Gateway', status_value: 'ok' as const, description: 'REST API endpoints', parent_id: sectionId },
                    { id: id(), type: 'STATUS' as const, title: 'Background Jobs', size: 'half' as const, status_label: 'Background Jobs', status_value: 'ok' as const, description: 'Async task processing', parent_id: sectionId },
                    { id: id(), type: 'STATUS' as const, title: 'CDN / Assets', size: 'half' as const, status_label: 'CDN / Assets', status_value: 'ok' as const, description: 'Static file delivery', parent_id: sectionId },
                ];
            })(),
        },
    },
];
