import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../lib/api';
import { DatasetSource, AggregateFn, PageWidgetReload } from '../../types';

export interface AggregateBucket {
    key: string;
    count: number;
    value: number;                       // legacy single value = first select
    values?: Record<string, number>;     // multi-select map (label → value)
}

interface Options {
    // When set, calls the public-page proxy with X-Page-Token. Otherwise uses the
    // authenticated /datasets/:id/aggregate endpoint via apiFetch.
    publicSlug?: string;
    pageToken?: string | null;
    // 'realtime' falls back to a 5s poll (true streaming isn't supported for aggregates).
    reload?: PageWidgetReload;
}

const reloadToMs = (r?: PageWidgetReload): number | null => {
    if (!r) return null;
    if (r === 'realtime') return 5000;
    const n = parseInt(r, 10);
    return Number.isFinite(n) && n > 0 ? n * 1000 : null;
};

export const useDatasetAggregate = (src: DatasetSource | undefined, opts: Options = {}) => {
    const { apiFetch } = useAuth();
    const [items, setItems] = useState<AggregateBucket[]>([]);
    // `loading` is the first-fetch state, used for showing a spinner. Background re-polls
    // keep the previous data visible (stale-while-revalidate) and don't toggle this flag.
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const datasetId = src?.dataset_id || '';
    const bodyKey = JSON.stringify({
        filter: src?.filter || '',
        group_bys: src?.group_bys && src.group_bys.length > 0 ? src.group_bys : undefined,
        selects: src?.selects && src.selects.length > 0
            ? src.selects.map(s => ({ field: s.field || '', fn: s.fn, label: s.label || '' }))
            : undefined,
        // Legacy single-field — sent only when the new arrays aren't, so the backend
        // gets a single coherent request regardless of which UI generation produced it.
        group_by: src?.group_bys && src.group_bys.length > 0 ? '' : (src?.group_by || ''),
        metric: src?.selects && src.selects.length > 0 ? '' : (src?.metric || ''),
        fn: src?.selects && src.selects.length > 0 ? '' : ((src?.fn || 'count') as AggregateFn),
        limit: src?.limit || 0,
        sort: src?.sort || 'value_desc',
    });

    useEffect(() => {
        if (!datasetId) {
            setItems([]);
            setError(null);
            setLoading(false);
            return;
        }
        const guard = { cancelled: false };

        const fetchOnce = async (isFirst: boolean) => {
            if (isFirst) setLoading(true);
            try {
                let res: Response;
                if (opts.publicSlug) {
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (opts.pageToken) headers['X-Page-Token'] = opts.pageToken;
                    // credentials: 'include' so the auth_token cookie is sent on cross-origin
                    // dev setups — without it, logged-in admins viewing a password-protected
                    // page (where the password screen is bypassed by RBAC) wouldn't be in
                    // the backend's request context and verifyPageToken would 401.
                    res = await fetch(`${API_BASE_URL}/public/pages/${opts.publicSlug}/datasets/${datasetId}/aggregate`, {
                        method: 'POST', headers, body: bodyKey, credentials: 'include',
                    });
                } else {
                    res = await apiFetch(`${API_BASE_URL}/datasets/${datasetId}/aggregate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: bodyKey,
                    });
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
        const ms = reloadToMs(opts.reload);
        let timer: ReturnType<typeof setInterval> | null = null;
        if (ms) timer = setInterval(() => fetchOnce(false), ms);
        return () => {
            guard.cancelled = true;
            if (timer) clearInterval(timer);
        };
    }, [apiFetch, datasetId, bodyKey, opts.publicSlug, opts.pageToken, opts.reload]);

    return { items, loading, error };
};
