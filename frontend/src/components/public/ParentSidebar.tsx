import React from 'react';
import {
    Home, ChevronRight, ExternalLink, Zap, Terminal, Link2, FileText, ImageIcon,
    Frame, Activity, Table2, BarChart3, TrendingUp, Type, PanelLeftClose,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WidgetIcon } from '../../lib/widgetIcons';
import { PageWidget } from '../../types';

// ParentSidebar renders a page's *parent* widgets as a compact, read-only panel on the
// public page. Widgets are grouped under their parent SECTION (mirroring the parent's own
// layout) and are never executed here — interactive/data widgets deep-link back to the
// parent's public page instead, so no parent token/workflow wiring is needed.

const defaultIconFor: Record<string, LucideIcon> = {
    ENDPOINT: Zap,
    TERMINAL: Terminal,
    LINK: Link2,
    TEXT: FileText,
    IMAGE: ImageIcon,
    IFRAME: Frame,
    STATUS: Activity,
    TABLE: Table2,
    CHART: BarChart3,
    METRIC: TrendingUp,
    SECTION: Type,
};

// Widget types that can render self-contained, static content in the narrow sidebar.
// Everything else becomes a deep-link chip pointing back to the parent page.
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    ok: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: 'bg-emerald-500' },
    warning: { bg: 'bg-amber-500/10', text: 'text-amber-500', dot: 'bg-amber-500' },
    error: { bg: 'bg-rose-500/10', text: 'text-rose-500', dot: 'bg-rose-500' },
    info: { bg: 'bg-sky-500/10', text: 'text-sky-500', dot: 'bg-sky-500' },
};

const ParentSidebar: React.FC<{
    parentTitle: string;
    parentSlug: string;
    widgets: PageWidget[];
    // When provided, renders a collapse button in the header (desktop rail toggle).
    onCollapse?: () => void;
}> = ({ parentTitle, parentSlug, widgets, onCollapse }) => {
    const parentHref = `/public/pages/${parentSlug}`;

    // A single widget rendered as a compact row. Self-contained widgets (TEXT/STATUS/LINK)
    // render inline; all others become a chip that opens the parent page in a new tab.
    const renderRow = (w: PageWidget): React.ReactNode => {
        const fallback = defaultIconFor[w.type] || Zap;
        const title = w.title || w.type;

        if (w.type === 'TEXT') {
            return (
                <div className="rounded-md border border-border/60 bg-card px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                        <WidgetIcon name={w.icon} fallback={fallback} className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        <span className="text-xs font-bold truncate">{title}</span>
                    </div>
                    {w.content && (
                        <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-4 whitespace-pre-wrap">{w.content}</p>
                    )}
                </div>
            );
        }

        if (w.type === 'STATUS') {
            const sc = STATUS_COLORS[w.status_value || 'ok'] || STATUS_COLORS.ok;
            return (
                <div className={cn('flex items-center gap-2.5 rounded-md border border-border/60 px-3 py-2.5', sc.bg)}>
                    <span className={cn('w-2.5 h-2.5 rounded-full shrink-0 animate-pulse', sc.dot)} />
                    <span className={cn('text-xs font-bold uppercase tracking-tight truncate', sc.text)}>{w.status_label || title}</span>
                </div>
            );
        }

        if (w.type === 'LINK' && w.url) {
            return (
                <a
                    href={w.url}
                    target={w.new_tab ? '_blank' : '_self'}
                    rel="noreferrer"
                    className="group flex items-center gap-2.5 rounded-md border border-border/60 bg-card px-3 py-2.5 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors"
                >
                    <span className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-500 shrink-0">
                        <WidgetIcon name={w.icon} fallback={Link2} className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold truncate flex-1 min-w-0">{title}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-indigo-500 transition-colors shrink-0" />
                </a>
            );
        }

        // Fallback: deep-link chip to the parent page (ENDPOINT / TERMINAL / CHART / TABLE /
        // METRIC / IMAGE / IFRAME). Read-only — the parent page runs the real widget.
        return (
            <a
                href={parentHref}
                className="group flex items-center gap-2.5 rounded-md border border-border/60 bg-card px-3 py-2.5 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                title={`Open "${title}" on ${parentTitle || 'parent page'}`}
            >
                <span className="p-1.5 rounded-md bg-muted/60 text-foreground/70 shrink-0">
                    <WidgetIcon name={w.icon} fallback={fallback} className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-bold truncate flex-1 min-w-0">{title}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
            </a>
        );
    };

    const topLevel = widgets.filter(w => !w.parent_id);

    const body = topLevel.map(w => {
        if (w.type === 'SECTION') {
            const children = widgets.filter(c => c.parent_id === w.id);
            return (
                <div key={w.id} className="space-y-2">
                    <div className="flex items-center gap-1.5 px-1 pt-1">
                        <WidgetIcon name={w.icon} fallback={Type} className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">
                            {w.title || 'Section'}
                        </span>
                    </div>
                    {children.length > 0
                        ? <div className="space-y-2">{children.map(c => <div key={c.id}>{renderRow(c)}</div>)}</div>
                        : <p className="text-[10px] text-muted-foreground/40 px-1">No widgets</p>}
                </div>
            );
        }
        return <div key={w.id}>{renderRow(w)}</div>;
    });

    return (
        // Bounded height so the widget list scrolls internally while the header stays pinned.
        // max-h matches the drawer offset in PublicPageView (top-32 → calc(100vh-10rem)).
        <div className="flex flex-col max-h-[calc(100vh-10rem)] rounded-xl border border-border bg-card shadow-premium overflow-hidden">
            <div className="flex items-center gap-2 p-3.5 pb-3 shrink-0 border-b border-border/40">
                <a
                    href={parentHref}
                    className="group flex items-center gap-2 px-1 flex-1 min-w-0 text-muted-foreground hover:text-amber-500 transition-colors"
                    title={`Back to ${parentTitle || 'parent page'}`}
                >
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20 transition-colors shrink-0">
                        <Home className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex flex-col min-w-0">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Parent</span>
                        <span className="text-xs font-black truncate">{parentTitle || 'Parent page'}</span>
                    </span>
                </a>
                {onCollapse && (
                    <button
                        type="button"
                        onClick={onCollapse}
                        title="Collapse sidebar"
                        className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                    >
                        <PanelLeftClose className="w-4 h-4" />
                    </button>
                )}
            </div>
            <div className="space-y-3 overflow-y-auto custom-scrollbar p-3.5 pt-3 min-h-0">{body}</div>
        </div>
    );
};

export default ParentSidebar;
