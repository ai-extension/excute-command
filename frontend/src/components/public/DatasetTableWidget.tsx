import React, { useEffect, useState } from 'react';
import { Table2 } from 'lucide-react';
import { PageWidget, DatasetRecord, PageWidgetReload } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../lib/api';

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

const DatasetTableWidget: React.FC<Props> = ({ widget, slug, pageToken }) => {
    const { apiFetch } = useAuth();
    const [items, setItems] = useState<DatasetRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ds = widget.dataset;
    const cols = ds?.columns && ds.columns.length > 0 ? ds.columns : [];
    const limit = ds?.limit && ds.limit > 0 ? ds.limit : 50;

    useEffect(() => {
        if (!ds?.dataset_id) {
            setItems([]);
            setError(null);
            setLoading(false);
            return;
        }
        const guard = { cancelled: false };

        const fetchOnce = async (isFirst: boolean) => {
            if (isFirst) setLoading(true);
            try {
                const qs = new URLSearchParams();
                qs.set('limit', String(limit));
                if (ds.filter) qs.set('filter', ds.filter);
                let res: Response;
                if (slug) {
                    const headers: Record<string, string> = {};
                    if (pageToken) headers['X-Page-Token'] = pageToken;
                    res = await fetch(`${API_BASE_URL}/public/pages/${slug}/datasets/${ds.dataset_id}/records?${qs}`, { headers });
                } else {
                    res = await apiFetch(`${API_BASE_URL}/datasets/${ds.dataset_id}/records?${qs}`);
                }
                const data = await res.json();
                if (guard.cancelled) return;
                if (!res.ok) {
                    setError(data?.error || 'Failed to load');
                    return;
                }
                setError(null);
                setItems(Array.isArray(data.items) ? data.items : []);
            } catch (e: any) {
                if (!guard.cancelled) setError(e?.message || 'Network error');
            } finally {
                if (!guard.cancelled && isFirst) setLoading(false);
            }
        };

        fetchOnce(true);
        const ms = reloadToMs(widget.reload_interval);
        let timer: ReturnType<typeof setInterval> | null = null;
        if (ms) timer = setInterval(() => fetchOnce(false), ms);
        return () => { guard.cancelled = true; if (timer) clearInterval(timer); };
    }, [apiFetch, ds?.dataset_id, ds?.filter, limit, slug, pageToken, widget.reload_interval]);

    // Auto-discover columns from records when admin didn't specify any.
    const headerKeys = cols.length > 0 ? cols : (() => {
        const keys = new Set<string>();
        items.slice(0, 20).forEach(r => Object.keys(parseData(r.data)).forEach(k => keys.add(k)));
        return Array.from(keys);
    })();

    return (
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-sm h-full flex flex-col">
            <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card">
                <div className="p-2 rounded-md bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/20">
                    <Table2 className="w-4 h-4" />
                </div>
                <span className="text-sm font-black truncate">{widget.title || 'Data Table'}</span>
                {loading && <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Loading…</span>}
            </div>
            <div className="p-4 flex-1 overflow-auto">
                {error ? (
                    <p className="text-[10px] text-destructive">Error: {error}</p>
                ) : items.length === 0 ? (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 py-8 text-center">No records</p>
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
                            {items.map((r) => {
                                const obj = parseData(r.data);
                                return (
                                    <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                                        {headerKeys.map(h => (
                                            <td key={h} className="py-2 px-3 font-mono text-[11px] truncate max-w-[260px]">{cellText(h === '_id' ? r.id : obj[h])}</td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default DatasetTableWidget;
