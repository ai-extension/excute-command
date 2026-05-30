import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
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

    const value = useMemo(() => {
        if (!isDataset) {
            const n = Number(widget.metric_static_value);
            return Number.isFinite(n) ? n : 0;
        }
        // Take the first bucket's value (group_by usually empty for METRIC).
        return items.length > 0 ? items[0].value : 0;
    }, [isDataset, items, widget.metric_static_value]);

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                    <Activity className="w-4 h-4" />
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
                        {widget.metric_label && (
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {widget.metric_label}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MetricWidget;
