import React, { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { WidgetIcon } from '../../lib/widgetIcons';
import { PageWidget } from '../../types';
import { useDatasetAggregate } from '../page-designer/useDatasetAggregate';
import { formatMetric, firstValue } from '../../lib/widgetData';

interface Props { widget: PageWidget; slug?: string; pageToken?: string | null; }

// Semicircle radial gauge: an aggregated single value plotted against [min, max] with
// optional warn/crit colour thresholds. Reuses the dataset aggregate contract.
const GaugeWidget: React.FC<Props> = ({ widget, slug, pageToken }) => {
    const isDataset = widget.data_source === 'dataset';
    const { items, loading, error } = useDatasetAggregate(
        isDataset ? widget.dataset : undefined,
        { publicSlug: slug, pageToken, reload: widget.reload_interval }
    );

    const value = useMemo(() => {
        if (!isDataset) { const n = Number(widget.metric_static_value); return Number.isFinite(n) ? n : 0; }
        return firstValue(items, widget.dataset);
    }, [isDataset, items, widget.metric_static_value, widget.dataset]);

    const min = widget.gauge_min ?? 0;
    const max = widget.gauge_max ?? 100;
    const span = max - min || 1;
    const pct = Math.max(0, Math.min(1, (value - min) / span));

    // Threshold colour: crit ≥ warn ≥ ok. Unset thresholds → single accent colour.
    const color = (() => {
        if (widget.gauge_crit != null && value >= widget.gauge_crit) return '#f43f5e'; // rose
        if (widget.gauge_warn != null && value >= widget.gauge_warn) return '#f59e0b'; // amber
        return '#10b981'; // emerald
    })();

    const R = 50, CX = 60, CY = 60;
    const ARC_LEN = Math.PI * R; // semicircle circumference
    const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
                    <WidgetIcon name={widget.icon} fallback={Gauge} className="w-4 h-4" />
                </div>
                <span className="text-sm font-black truncate">{widget.title || 'Gauge'}</span>
                {loading && isDataset && <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>}
            </div>
            <div className="px-6 py-6 flex-1 flex flex-col items-center justify-center gap-1">
                {error ? (
                    <p className="text-[10px] text-destructive">Error: {error}</p>
                ) : (
                    <>
                        <svg viewBox="0 0 120 72" className="w-44 max-w-full">
                            <path d={arcPath} fill="none" strokeLinecap="round" strokeWidth={12} className="stroke-muted-foreground/15" />
                            <path
                                d={arcPath}
                                fill="none"
                                strokeLinecap="round"
                                strokeWidth={12}
                                stroke={color}
                                strokeDasharray={`${pct * ARC_LEN} ${ARC_LEN}`}
                            />
                        </svg>
                        <div className="text-3xl font-black tracking-tight tabular-nums -mt-6" style={{ color }}>
                            {formatMetric(value, widget.metric_format)}
                            {widget.metric_unit && <span className="text-base text-muted-foreground ml-1">{widget.metric_unit}</span>}
                        </div>
                        <div className="flex w-44 max-w-full justify-between text-[9px] font-bold text-muted-foreground/60 tabular-nums">
                            <span>{min}</span><span>{max}</span>
                        </div>
                        {(widget.metric_label) && (
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">{widget.metric_label}</div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default GaugeWidget;
