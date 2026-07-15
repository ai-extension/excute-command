import { DynamicIcon, iconNames } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import type { LucideIcon } from 'lucide-react';

// Full lucide icon set is loaded lazily, one icon at a time, via DynamicIcon — so the app
// bundle stays small and only the icons a page actually renders get fetched (code-split).
// Icon names are lucide's kebab-case names (e.g. "chart-column"), the value stored in
// PageWidget.icon.

const NAME_SET = new Set<string>(iconNames);

// All available icon names (~1900), used by the searchable picker.
export const ALL_ICON_NAMES: string[] = iconNames as unknown as string[];

// Icons shown before the user types anything — keeps the picker approachable.
export const POPULAR_ICON_NAMES: string[] = [
    'zap', 'play', 'rocket', 'terminal', 'server', 'database', 'globe', 'link-2', 'file-text',
    'image', 'frame', 'activity', 'table-2', 'chart-column', 'trending-up', 'type', 'bell', 'settings',
    'circle-check', 'triangle-alert', 'clock', 'cloud', 'cpu', 'hard-drive', 'lock', 'mail', 'star',
    'heart', 'folder', 'download', 'upload', 'refresh-cw', 'git-branch', 'package', 'wrench',
];

export function isIconName(name: string | undefined): name is string {
    return !!name && NAME_SET.has(name);
}

// searchIcons returns up to `limit` icon names matching the query (case-insensitive
// substring). An empty query returns the popular default set.
export function searchIcons(query: string, limit = 72): string[] {
    const q = query.trim().toLowerCase();
    if (!q) return POPULAR_ICON_NAMES;
    const out: string[] = [];
    for (const name of ALL_ICON_NAMES) {
        if (name.includes(q)) {
            out.push(name);
            if (out.length >= limit) break;
        }
    }
    return out;
}

// WidgetIcon renders the picked lucide icon (lazily loaded) when `name` is a known icon,
// otherwise the per-type `fallback` component (so existing widgets keep their look).
// Passing no fallback renders nothing while an unknown/empty name is given.
export function WidgetIcon({ name, fallback: Fallback, className }: {
    name?: string;
    fallback?: LucideIcon;
    className?: string;
}) {
    if (isIconName(name)) {
        return <DynamicIcon name={name as IconName} className={className} />;
    }
    return Fallback ? <Fallback className={className} /> : null;
}
