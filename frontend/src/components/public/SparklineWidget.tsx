import React, { useMemo } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { WidgetIcon } from '../../lib/widgetIcons';
import { PageWidget } from '../../types';
import { useDatasetAggregate } from '../page-designer/useDatasetAggregate';
import { formatMetric, toPairs, parseStaticPairs } from '../../lib/widgetData';

interface Props { widget: PageWidget; slug?: string; pageToken?: string | null; }

// Sparkline / trend: a small line of the aggregated series plus the current (last) value
// and its delta vs the first point — a compact "how is this trending" monitor tile.
const SparklineWidget: React.FC<Props> = ({ widget, slug, pageToken }) => {
    const isDataset = widget.data_source === 'dataset';
    const { items, loading, error } = useDatasetAggregate(
        isDataset ? widget.dataset : undefined,
        { publicSlug: slug, pageToken, reload: widget.reload_interval }
    );

    const pairs = useMemo(
        () => (isDataset ? toPairs(items, widget.dataset) : parseStaticPairs(widget.chart_static_data)),
        [isDataset, items, widget.dataset, widget.chart_static_data]
    );

    const current = pairs.length > 0 ? pairs[pairs.length - 1].value : 0;
    const firstVal = pairs.length > 0 ? pairs[0].value : 0;
    const delta = current - firstVal;
    const deltaPct = firstVal !== 0 ? (delta / Math.abs(firstVal)) * 100 : 0;
    const up = delta > 0, down = delta < 0;
    const TrendIcon = up ? TrendingUp : down ? TrendingDown : Minus;
    const trendColor = up ? 'text-emerald-500' : down ? 'text-rose-500' : 'text-muted-foreground';
    const lineColor = up ? '#10b981' : down ? '#f43f5e' : '#06b6d4';

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-cyan-500/10 text-cyan-500 ring-1 ring-cyan-500/20">
                    <WidgetIcon name={widget.icon} fallback={TrendingUp} className="w-4 h-4" />
                </div>
                <span className="text-sm font-black truncate">{widget.title || 'Trend'}</span>
                {loading && isDataset && <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>}
            </div>
            <div className="px-6 py-5 flex-1 flex flex-col justify-between gap-3">
                {error ? (
                    <p className="text-[10px] text-destructive">Error: {error}</p>
                ) : (
                    <>
                        <div className="flex items-end justify-between gap-2">
                            <div className="flex flex-col">
                                <span className="text-3xl font-black tracking-tight tabular-nums">
                                    {formatMetric(current, widget.metric_format)}
                                    {widget.metric_unit && <span className="text-base text-muted-foreground ml-1">{widget.metric_unit}</span>}
                                </span>
                                {(widget.metric_label) && <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{widget.metric_label}</span>}
                            </div>
                            {pairs.length > 1 && (
                                <span className={`flex items-center gap-1 text-xs font-bold tabular-nums ${trendColor}`}>
                                    <TrendIcon className="w-3.5 h-3.5" />
                                    {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
                                </span>
                            )}
                        </div>
                        <div className="h-14">
                            {pairs.length > 1 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={pairs} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
                                        <YAxis hide domain={['dataMin', 'dataMax']} />
                                        <Tooltip contentStyle={{ fontSize: 11 }} labelFormatter={(_, p) => (p && p[0] ? String(p[0].payload.key) : '')} />
                                        <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                                    {loading ? 'Loading…' : 'Not enough points'}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SparklineWidget;
