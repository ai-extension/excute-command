import React, { useEffect, useMemo, useState } from 'react';
import { Table2 } from 'lucide-react';
import { WidgetIcon } from '../../lib/widgetIcons';
import { PageWidget, DatasetRecord, PageWidgetReload, SelectAggregation } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../lib/api';
import { useDatasetAggregate } from '../page-designer/useDatasetAggregate';

interface Props {
    widget: PageWidget;
    slug?: string;
    pageToken?: string | null;
}

const reloadToMs = (r?: PageWidgetReload): number | null => {
    if (!r) return null;
    if (r === 'realtime') return 5000;
    const n = parseInt(r, 10);
    return Number.isFinite(n) && n > 0 ? n * 1000 : null;
};

const parseData = (raw?: string): Record<string, any> => {
    if (!raw) return {};
    try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
};

const cellText = (v: any): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

// Label for a select, mirroring the backend's default-label rule when admin left it blank.
const selectLabel = (s: SelectAggregation, idx: number): string => {
    if (s.label && s.label.trim()) return s.label.trim();
    const fn = s.fn || 'count';
    if (s.field) return `${fn}(${s.field})`;
    return idx === 0 ? String(fn) : `${fn}_${idx + 1}`;
};

const DatasetTableWidget: React.FC<Props> = ({ widget, slug, pageToken }) => {
    const { apiFetch } = useAuth();

    const ds = widget.dataset;
    const cols = ds?.columns && ds.columns.length > 0 ? ds.columns : [];
    const limit = ds?.limit && ds.limit > 0 ? ds.limit : 50;

    // Trigger aggregate mode when admin configured EITHER group fields or selects.
    // Selects-only (no group) is a valid "summary row" case — backend returns one bucket
    // with each aggregation as a column.
    const hasGroups = !!ds?.group_bys?.length;
    const hasSelects = !!ds?.selects?.length;
    const aggregateMode = !!ds && (hasGroups || hasSelects);

    // Aggregate mode: use the shared hook. We pass undefined when not in aggregate mode
    // so the hook stays inert (no fetch, empty items).
    const aggregate = useDatasetAggregate(
        aggregateMode ? ds : undefined,
        { publicSlug: slug, pageToken, reload: widget.reload_interval }
    );

    // Records mode: classic raw-records fetch.
    const [records, setRecords] = useState<DatasetRecord[]>([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [recordsError, setRecordsError] = useState<string | null>(null);

    useEffect(() => {
        if (aggregateMode || !ds?.dataset_id) {
            setRecords([]);
            setRecordsError(null);
            setRecordsLoading(false);
            return;
        }
        const guard = { cancelled: false };

        const fetchOnce = async (isFirst: boolean) => {
            if (isFirst) setRecordsLoading(true);
            try {
                const qs = new URLSearchParams();
                qs.set('limit', String(limit));
                if (ds.filter) qs.set('filter', ds.filter);
                let res: Response;
                if (slug) {
                    const headers: Record<string, string> = {};
                    if (pageToken) headers['X-Page-Token'] = pageToken;
                    res = await fetch(`${API_BASE_URL}/public/pages/${slug}/datasets/${ds.dataset_id}/records?${qs}`, {
                        headers, credentials: 'include',
                    });
                } else {
                    res = await apiFetch(`${API_BASE_URL}/datasets/${ds.dataset_id}/records?${qs}`);
                }
                const data = await res.json();
                if (guard.cancelled) return;
                if (!res.ok) {
                    setRecordsError(data?.error || 'Failed to load');
                    return;
                }
                setRecordsError(null);
                setRecords(Array.isArray(data.items) ? data.items : []);
            } catch (e: any) {
                if (!guard.cancelled) setRecordsError(e?.message || 'Network error');
            } finally {
                if (!guard.cancelled && isFirst) setRecordsLoading(false);
            }
        };

        fetchOnce(true);
        const ms = reloadToMs(widget.reload_interval);
        let timer: ReturnType<typeof setInterval> | null = null;
        if (ms) timer = setInterval(() => fetchOnce(false), ms);
        return () => { guard.cancelled = true; if (timer) clearInterval(timer); };
    }, [aggregateMode, apiFetch, ds?.dataset_id, ds?.filter, limit, slug, pageToken, widget.reload_interval]);

    const loading = aggregateMode ? aggregate.loading : recordsLoading;
    const error = aggregateMode ? aggregate.error : recordsError;

    // --- Build header keys + rows from whichever mode is active ---
    const { headerKeys, rows } = useMemo(() => {
        if (aggregateMode) {
            const groupBys = ds!.group_bys || [];
            const selects = (ds!.selects || []);
            const allKeys = [
                ...groupBys,
                ...selects.map((s, i) => selectLabel(s, i)),
            ];
            // Admin-picked columns override; otherwise show every group + select.
            const keys = cols.length > 0 ? cols : allKeys;

            const rs = aggregate.items.map((bucket) => {
                // Composite key joined by " | ". Split back to align with group_bys.
                // Edge case: if a group value itself contains " | ", it'll split wrongly —
                // accepted limitation in v1.
                const parts = groupBys.length > 1 ? bucket.key.split(' | ') : [bucket.key];
                const row: Record<string, any> = {};
                groupBys.forEach((g, i) => { row[g] = parts[i] ?? ''; });
                selects.forEach((s, i) => {
                    const label = selectLabel(s, i);
                    row[label] = bucket.values ? bucket.values[label] : (i === 0 ? bucket.value : 0);
                });
                row._count = bucket.count;
                return row;
            });
            return { headerKeys: keys, rows: rs };
        }

        // Records mode: auto-discover columns when admin didn't pick any.
        const discovered = cols.length > 0 ? cols : (() => {
            const keys = new Set<string>();
            records.slice(0, 20).forEach(r => Object.keys(parseData(r.data)).forEach(k => keys.add(k)));
            return Array.from(keys);
        })();
        const rs = records.map(r => {
            const obj = parseData(r.data);
            const row: Record<string, any> = { ...obj, _id: r.id };
            return row;
        });
        return { headerKeys: discovered, rows: rs };
    }, [aggregateMode, ds, cols, aggregate.items, records]);

    const empty = rows.length === 0;

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/20">
                    <WidgetIcon name={widget.icon} fallback={Table2} className="w-4 h-4" />
                </div>
                <span className="text-sm font-black truncate">{widget.title || 'Data Table'}</span>
                {aggregateMode && (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-500/70">Aggregated</span>
                )}
                {loading && <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>}
            </div>
            <div className="p-4 flex-1 overflow-auto">
                {error ? (
                    <p className="text-[10px] text-destructive">Error: {error}</p>
                ) : empty ? (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 py-8 text-center">
                        No {aggregateMode ? 'data' : 'records'}
                    </p>
                ) : (
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b-2 border-border">
                                {headerKeys.map(h => (
                                    <th key={h} className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-muted-foreground">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, ri) => (
                                <tr key={ri} className="border-b border-border/40 hover:bg-muted/30">
                                    {headerKeys.map(h => (
                                        <td key={h} className="py-2 px-3 font-mono text-[11px] truncate max-w-[260px]">{cellText(row[h])}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default DatasetTableWidget;
