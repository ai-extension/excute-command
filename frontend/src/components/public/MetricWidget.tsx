import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { WidgetIcon } from '../../lib/widgetIcons';
import { PageWidget } from '../../types';
import { useDatasetAggregate } from '../page-designer/useDatasetAggregate';

interface Props {
    widget: PageWidget;
    slug?: string;
    pageToken?: string | null;
}

const formatNumber = (n: number, fmt: PageWidget['metric_format']): string => {
    if (!Number.isFinite(n)) return '—';
    switch (fmt) {
        case 'percent':
            return `${(n * 100).toFixed(1)}%`;
        case 'currency':
            return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
        default: {
            // Compact for big numbers
            if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
            return Number.isInteger(n) ? n.toString() : n.toFixed(2);
        }
    }
};

const MetricWidget: React.FC<Props> = ({ widget, slug, pageToken }) => {
    const isDataset = widget.data_source === 'dataset';
    const { items, loading, error } = useDatasetAggregate(
        isDataset ? widget.dataset : undefined,
        { publicSlug: slug, pageToken, reload: widget.reload_interval }
    );

    const firstSelect = widget.dataset?.selects?.[0];
    const value = useMemo(() => {
        if (!isDataset) {
            const n = Number(widget.metric_static_value);
            return Number.isFinite(n) ? n : 0;
        }
        if (items.length === 0) return 0;
        // Prefer the first select's value by label when present; fall back to the legacy
        // bucket.value (mirrors first select on the backend anyway).
        const first = items[0];
        if (firstSelect?.label && first.values && first.values[firstSelect.label] !== undefined) {
            return first.values[firstSelect.label];
        }
        return first.value;
    }, [isDataset, items, widget.metric_static_value, firstSelect?.label]);

    // Use the first select's label as the metric label when admin didn't set one.
    const displayLabel = widget.metric_label || firstSelect?.label || '';

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                    <WidgetIcon name={widget.icon} fallback={Activity} className="w-4 h-4" />
                </div>
                <span className="text-sm font-black truncate">{widget.title || 'Metric'}</span>
                {loading && isDataset && (
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>
                )}
            </div>
            <div className="px-6 py-6 flex-1 flex flex-col items-center justify-center gap-2">
                {error ? (
                    <p className="text-[10px] text-destructive">Error: {error}</p>
                ) : (
                    <>
                        <div className="text-4xl font-black tracking-tight tabular-nums text-foreground">
                            {formatNumber(value, widget.metric_format)}
                            {widget.metric_unit && <span className="text-lg text-muted-foreground ml-1">{widget.metric_unit}</span>}
                        </div>
                        {displayLabel && (
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {displayLabel}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MetricWidget;
