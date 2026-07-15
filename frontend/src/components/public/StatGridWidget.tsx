import React, { useMemo } from 'react';
import { LayoutGrid } from 'lucide-react';
import { WidgetIcon } from '../../lib/widgetIcons';
import { PageWidget } from '../../types';
import { useDatasetAggregate } from '../page-designer/useDatasetAggregate';
import { formatMetric, toPairs, parseStaticPairs } from '../../lib/widgetData';

interface Props { widget: PageWidget; slug?: string; pageToken?: string | null; }

// KPI grid: a group_by aggregation rendered as a grid of stat tiles (one per bucket), so
// several monitored values (e.g. count per status) show at a glance.
const StatGridWidget: React.FC<Props> = ({ widget, slug, pageToken }) => {
    const isDataset = widget.data_source === 'dataset';
    const { items, loading, error } = useDatasetAggregate(
        isDataset ? widget.dataset : undefined,
        { publicSlug: slug, pageToken, reload: widget.reload_interval }
    );

    const pairs = useMemo(
        () => (isDataset ? toPairs(items, widget.dataset) : parseStaticPairs(widget.chart_static_data)),
        [isDataset, items, widget.dataset, widget.chart_static_data]
    );

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/20">
                    <WidgetIcon name={widget.icon} fallback={LayoutGrid} className="w-4 h-4" />
                </div>
                <span className="text-sm font-black truncate">{widget.title || 'Stats'}</span>
                {loading && isDataset && <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>}
            </div>
            <div className="p-4 flex-1">
                {error ? (
                    <p className="text-[10px] text-destructive">Error: {error}</p>
                ) : pairs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                        {loading ? 'Loading…' : 'No data'}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {pairs.map((p, i) => (
                            <div key={`${p.key}-${i}`} className="rounded-md border border-border/60 bg-muted/20 px-3 py-3 flex flex-col gap-1">
                                <span className="text-lg font-black tracking-tight tabular-nums truncate">
                                    {formatMetric(p.value, widget.metric_format)}
                                    {widget.metric_unit && <span className="text-xs text-muted-foreground ml-1">{widget.metric_unit}</span>}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate" title={p.key}>{p.key}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatGridWidget;
