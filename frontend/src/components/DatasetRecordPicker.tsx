import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { DatasetRecord } from '../types';
import { renderDatasetTemplate } from '../lib/datasetInput';
import { SearchableSelect, SelectOption } from './SearchableSelect';

interface Props {
    datasetId: string;
    baseFilter: string;
    displayTemplate: string;
    multi?: boolean;
    value: string;            // single: JSON of record; multi: JSON array of records
    onChange: (value: string) => void;
    placeholder?: string;
    hasError?: boolean;
}

const FETCH_LIMIT = 15;

const parseRecord = (raw: string): Record<string, any> | null => {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw);
        return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch { return null; }
};

const parseRecords = (raw: string): Record<string, any>[] => {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.filter(r => r && typeof r === 'object') : [];
    } catch { return []; }
};

const recordFromApi = (r: DatasetRecord): Record<string, any> => {
    try {
        const obj = JSON.parse(r.data || '{}');
        return obj && typeof obj === 'object' ? { ...obj, _id: r.id } : { _id: r.id };
    } catch { return { _id: r.id }; }
};

export const DatasetRecordPicker: React.FC<Props> = ({
    datasetId,
    baseFilter,
    displayTemplate,
    multi = false,
    value,
    onChange,
    placeholder = 'Pick a record...',
    hasError = false,
}) => {
    const { apiFetch } = useAuth();
    const [fetched, setFetched] = useState<Record<string, any>[]>([]);
    const [search, setSearch] = useState('');

    const selectedSingle = useMemo(() => parseRecord(value), [value]);
    const selectedMulti = useMemo(() => parseRecords(value), [value]);

    // Fetch records when dataset / filter / search change.
    useEffect(() => {
        if (!datasetId) { setFetched([]); return; }
        let cancelled = false;
        (async () => {
            try {
                let url = `${API_BASE_URL}/datasets/${datasetId}/records?limit=${FETCH_LIMIT}&offset=0`;
                if (search) url += `&search=${encodeURIComponent(search)}`;
                if (baseFilter) url += `&filter=${encodeURIComponent(baseFilter)}`;
                const res = await apiFetch(url);
                const data = await res.json();
                if (cancelled) return;
                const items: DatasetRecord[] = data.items || [];
                setFetched(items.map(recordFromApi));
            } catch {
                if (!cancelled) setFetched([]);
            }
        })();
        return () => { cancelled = true; };
    }, [apiFetch, datasetId, baseFilter, search]);

    // Build options. Fresh records from the API go in FIRST so they win over the
    // stored selection snapshot — otherwise edits made to a record after it was picked
    // would never show up in the trigger label or in submitted data.
    const { options, idToRecord } = useMemo(() => {
        const map = new Map<string, Record<string, any>>();
        const add = (r: Record<string, any>) => {
            const id = String(r._id ?? '');
            if (!id || map.has(id)) return;
            map.set(id, r);
        };
        fetched.forEach(add);
        // Then the cached selection — only kicks in for records not present in the
        // current fetch (e.g. excluded by search/limit) so the trigger keeps showing
        // them as selected with whatever snapshot data we have.
        if (multi) selectedMulti.forEach(add); else if (selectedSingle) add(selectedSingle);

        const opts: SelectOption[] = Array.from(map.entries()).map(([id, r]) => {
            const label = renderDatasetTemplate(displayTemplate, r) || id;
            return { label, value: id, searchTerms: label };
        });
        return { options: opts, idToRecord: map };
    }, [fetched, selectedSingle, selectedMulti, displayTemplate, multi]);

    // When the fetch returns a fresh copy of an already-selected record, write the
    // refreshed JSON back to the parent so the value sent at submit time is current.
    // Compares by JSON string so we don't loop on identical data.
    useEffect(() => {
        if (fetched.length === 0) return;
        if (multi) {
            if (selectedMulti.length === 0) return;
            let changed = false;
            const refreshed = selectedMulti.map(s => {
                const id = String(s._id ?? '');
                const fresh = fetched.find(r => String(r._id ?? '') === id);
                if (fresh && JSON.stringify(fresh) !== JSON.stringify(s)) {
                    changed = true;
                    return fresh;
                }
                return s;
            });
            if (changed) onChange(JSON.stringify(refreshed));
        } else {
            if (!selectedSingle) return;
            const id = String(selectedSingle._id ?? '');
            if (!id) return;
            const fresh = fetched.find(r => String(r._id ?? '') === id);
            if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedSingle)) {
                onChange(JSON.stringify(fresh));
            }
        }
        // selectedSingle/selectedMulti intentionally omitted: this effect should run on
        // each new fetch payload, not on the onChange-driven value updates it produces.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetched, multi]);

    const singleValue = selectedSingle ? String(selectedSingle._id ?? '') : '';
    const multiValue = selectedMulti.map(r => String(r._id ?? '')).filter(Boolean);

    const handleSingle = (id: string) => {
        const rec = idToRecord.get(id);
        onChange(rec ? JSON.stringify(rec) : '');
    };

    const handleMulti = (ids: string[]) => {
        const recs = ids.map(id => idToRecord.get(id)).filter((r): r is Record<string, any> => !!r);
        onChange(JSON.stringify(recs));
    };

    return (
        <SearchableSelect
            options={options}
            value={multi ? multiValue : singleValue}
            onValueChange={multi ? handleMulti : handleSingle}
            type={multi ? 'multi' : 'single'}
            isSearchable
            onSearch={setSearch}
            placeholder={datasetId ? placeholder : 'Dataset not configured'}
            searchPlaceholder="Search records..."
            disabled={!datasetId}
            triggerClassName={`h-9 ${hasError ? 'border-destructive' : 'border-border'}`}
        />
    );
};
