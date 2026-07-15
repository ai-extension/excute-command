import React, { useMemo } from 'react';
import { Target } from 'lucide-react';
import { WidgetIcon } from '../../lib/widgetIcons';
import { PageWidget } from '../../types';
import { useDatasetAggregate } from '../page-designer/useDatasetAggregate';
import { formatMetric, firstValue } from '../../lib/widgetData';

interface Props { widget: PageWidget; slug?: string; pageToken?: string | null; }

// Linear progress bar: an aggregated value against a target, shown as value / target and a
// filled bar. Colour flips to emerald once the target is reached.
const ProgressWidget: React.FC<Props> = ({ widget, slug, pageToken }) => {
    const isDataset = widget.data_source === 'dataset';
    const { items, loading, error } = useDatasetAggregate(
        isDataset ? widget.dataset : undefined,
        { publicSlug: slug, pageToken, reload: widget.reload_interval }
    );

    const value = useMemo(() => {
        if (!isDataset) { const n = Number(widget.metric_static_value); return Number.isFinite(n) ? n : 0; }
        return firstValue(items, widget.dataset);
    }, [isDataset, items, widget.metric_static_value, widget.dataset]);

    const target = widget.progress_target && widget.progress_target !== 0 ? widget.progress_target : 100;
    const pct = Math.max(0, Math.min(1, value / target));
    const reached = value >= target;
    const barColor = reached ? 'bg-emerald-500' : 'bg-primary';

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/20">
                    <WidgetIcon name={widget.icon} fallback={Target} className="w-4 h-4" />
                </div>
                <span className="text-sm font-black truncate">{widget.title || 'Progress'}</span>
                {loading && isDataset && <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>}
            </div>
            <div className="px-6 py-6 flex-1 flex flex-col justify-center gap-3">
                {error ? (
                    <p className="text-[10px] text-destructive">Error: {error}</p>
                ) : (
                    <>
                        <div className="flex items-end justify-between gap-2">
                            <span className="text-2xl font-black tracking-tight tabular-nums">
                                {formatMetric(value, widget.metric_format)}
                                {widget.metric_unit && <span className="text-sm text-muted-foreground ml-1">{widget.metric_unit}</span>}
                            </span>
                            <span className="text-xs font-bold text-muted-foreground tabular-nums">/ {formatMetric(target, widget.metric_format)}</span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-muted-foreground/15 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct * 100}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            <span>{widget.metric_label || 'Progress'}</span>
                            <span className="tabular-nums">{Math.round(pct * 100)}%</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ProgressWidget;
