import React, { useMemo } from 'react';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { PageWidget } from '../../types';
import { useDatasetAggregate, AggregateBucket } from '../page-designer/useDatasetAggregate';

interface Props {
    widget: PageWidget;
    slug?: string;
    pageToken?: string | null;
}

const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#84cc16'];

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
    const data = useMemo(
        () => (isDataset ? items : parseStatic(widget.chart_static_data)),
        [isDataset, items, widget.chart_static_data]
    );

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
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Pie data={data} dataKey="value" nameKey="key" outerRadius="75%" label>
                            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        // Axes/grid/tooltip are inlined per chart rather than shared via a fragment —
        // Recharts inspects child types directly, and fragments can mask them.
        if (kind === 'line') {
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="key" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} />
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
                        <Area type="monotone" dataKey="value" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.3} />
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
                    <Bar dataKey="value" fill={COLORS[0]} />
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
                {loading && isDataset && (
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>
                )}
            </div>
            <div className="p-4 flex-1 min-h-[260px]">
                {renderChart()}
            </div>
        </div>
    );
};

export default ChartWidget;
