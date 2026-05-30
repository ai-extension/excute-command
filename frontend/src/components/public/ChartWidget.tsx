import React, { useMemo } from 'react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { PageWidget, SelectAggregation, AggregateFn } from '../../types';
import { useDatasetAggregate, AggregateBucket } from '../page-designer/useDatasetAggregate';

interface Props {
    widget: PageWidget;
    slug?: string;
    pageToken?: string | null;
}

const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#84cc16'];
const EMPTY_KEY_LABEL = '(empty)';

const labelFor = (s: SelectAggregation, fallbackIndex: number): string => {
    if (s.label && s.label.trim()) return s.label.trim();
    const fn = s.fn || 'count';
    if (s.field) return `${fn}(${s.field})`;
    return fallbackIndex === 0 ? String(fn) : `${fn}_${fallbackIndex + 1}`;
};

// Build a list of {label} entries describing each series Recharts should render. Pulls
// from the new selects[] array when set, falling back to the legacy single fn+metric
// shape, or finally to a hardcoded "value" series for static-data charts.
const resolveSeries = (widget: PageWidget): { label: string }[] => {
    const ds = widget.dataset;
    if (widget.data_source === 'dataset' && ds) {
        if (ds.selects && ds.selects.length > 0) {
            return ds.selects.map((s, i) => ({ label: labelFor(s, i) }));
        }
        if (ds.fn || ds.metric) {
            const fn = (ds.fn || 'count') as AggregateFn;
            return [{ label: ds.metric ? `${fn}(${ds.metric})` : fn }];
        }
    }
    // Static data uses bucket.value directly under the key "value".
    return [{ label: 'value' }];
};

// Flatten {key, count, values:{label:n}, value} → {key, label1:n, label2:n} so Recharts
// can use each label as a `dataKey` for a series.
const flattenBucket = (b: AggregateBucket, series: { label: string }[]): Record<string, any> => {
    const out: Record<string, any> = { key: b.key === '' ? EMPTY_KEY_LABEL : b.key, count: b.count };
    if (b.values) {
        for (const s of series) {
            out[s.label] = b.values[s.label] ?? 0;
        }
    } else {
        // Legacy single-value bucket — map onto the first series.
        if (series.length > 0) out[series[0].label] = b.value ?? 0;
    }
    return out;
};

const parseStatic = (raw?: string): AggregateBucket[] => {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw);
        if (!Array.isArray(v)) return [];
        return v.filter(x => x && typeof x === 'object').map((x: any) => ({
            key: String(x.key ?? x.label ?? ''),
            value: Number(x.value ?? 0),
            count: Number(x.count ?? 0),
        }));
    } catch { return []; }
};

const ChartWidget: React.FC<Props> = ({ widget, slug, pageToken }) => {
    const isDataset = widget.data_source === 'dataset';
    const { items, loading, error } = useDatasetAggregate(
        isDataset ? widget.dataset : undefined,
        { publicSlug: slug, pageToken, reload: widget.reload_interval }
    );

    const series = useMemo(() => resolveSeries(widget), [widget]);
    const data = useMemo(() => {
        const raw = isDataset ? items : parseStatic(widget.chart_static_data);
        return raw.map(b => flattenBucket(b, series));
    }, [isDataset, items, widget.chart_static_data, series]);

    // Hint state: dataset chart that produced exactly one empty-key bucket — usually
    // means group_bys (or legacy group_by) wasn't configured.
    const isSingleEmptyBucket = isDataset && data.length === 1 && data[0].key === EMPTY_KEY_LABEL;
    const missingGroupBy = isDataset
        && !(widget.dataset?.group_bys && widget.dataset.group_bys.length > 0)
        && !widget.dataset?.group_by;

    const kind = widget.chart_kind || 'bar';

    const renderChart = () => {
        if (data.length === 0) {
            return (
                <div className="h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    {loading ? 'Loading…' : error ? `Error: ${error}` : 'No data'}
                </div>
            );
        }

        if (kind === 'pie') {
            // Pie can only show one dimension — render the first series.
            const seriesKey = series[0]?.label || 'value';
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Pie data={data} dataKey={seriesKey} nameKey="key" outerRadius="75%" label>
                            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        if (kind === 'line') {
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="key" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {series.map((s, i) => (
                            <Line key={s.label} type="monotone" dataKey={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );
        }
        if (kind === 'area') {
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="key" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {series.map((s, i) => (
                            <Area key={s.label} type="monotone" dataKey={s.label} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            );
        }
        return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="key" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {series.map((s, i) => (
                        <Bar key={s.label} dataKey={s.label} fill={COLORS[i % COLORS.length]} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    };

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-cyan-500/10 text-cyan-500 ring-1 ring-cyan-500/20">
                    <BarChart3 className="w-4 h-4" />
                </div>
                <span className="text-sm font-black truncate">{widget.title || 'Chart'}</span>
                {isSingleEmptyBucket && missingGroupBy && (
                    <span
                        className="ml-auto text-[9px] font-bold uppercase tracking-widest text-amber-500/90"
                        title="No Group By field is configured, so all records are bucketed together. Set a Group By field in the widget settings to see distinct values."
                    >
                        Group By missing
                    </span>
                )}
                {loading && isDataset && !isSingleEmptyBucket && (
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>
                )}
            </div>
            <div className="p-4 h-[300px] flex-shrink-0">
                {renderChart()}
            </div>
        </div>
    );
};

export default ChartWidget;
