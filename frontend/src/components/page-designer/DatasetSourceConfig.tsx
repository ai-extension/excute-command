import React, { useEffect, useState } from 'react';
import { Dataset, DatasetSource, SelectAggregation, AggregateFn } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNamespace } from '../../context/NamespaceContext';
import { API_BASE_URL } from '../../lib/api';
import { generateUUID } from '../../lib/utils';
import { SearchableSelect } from '../SearchableSelect';
import { FilterBuilder } from '../FilterBuilder';
import { MultiFieldCombo } from '../MultiFieldCombo';
import { Input } from '../ui/input';

const parseCols = (raw?: string): string[] => {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.filter((c: any) => c && c.name).map((c: any) => c.name) : [];
    } catch { return []; }
};

interface Slots {
    showGroupBy?: boolean;   // shows the multi-group-field list
    showSelects?: boolean;   // shows the multi-select aggregator list (replaces showMetric+showFn)
    showLimit?: boolean;
    showSort?: boolean;
    showColumns?: boolean;
    // Legacy single-field slots — still honored when showSelects isn't set. Treat as
    // showSelects=true with restricted UI if both are provided.
    showMetric?: boolean;
    showFn?: boolean;
}

interface Props {
    value: DatasetSource | undefined;
    onChange: (v: DatasetSource) => void;
    slots?: Slots;
}

const SORTS = [
    { value: 'value_desc', label: 'Value ↓' },
    { value: 'value_asc', label: 'Value ↑' },
    { value: 'key_asc', label: 'Key A→Z' },
    { value: 'key_desc', label: 'Key Z→A' },
];

const emptySrc = (): DatasetSource => ({ dataset_id: '', filter: '' });

// Migrate legacy single-field shape into arrays so the editor always works against the
// new structure. Returns a *new* object — the caller will re-emit it through onChange
// on the first edit so storage gets updated too.
const normalizeSource = (cfg: DatasetSource): DatasetSource => {
    let groupBys = cfg.group_bys;
    if ((!groupBys || groupBys.length === 0) && cfg.group_by) {
        groupBys = [cfg.group_by];
    }
    let selects = cfg.selects;
    if ((!selects || selects.length === 0) && (cfg.fn || cfg.metric)) {
        const fn = (cfg.fn || 'count') as AggregateFn;
        const field = cfg.metric || '';
        selects = [{
            id: generateUUID(),
            field, fn,
            label: field ? `${fn}(${field})` : fn,
        }];
    }
    return { ...cfg, group_bys: groupBys, selects };
};

export const DatasetSourceConfig: React.FC<Props> = ({ value, onChange, slots }) => {
    const cfgRaw = value || emptySrc();
    const cfg = normalizeSource(cfgRaw);
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [datasets, setDatasets] = useState<Dataset[]>([]);

    useEffect(() => {
        if (!activeNamespace) return;
        apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/datasets?limit=200`)
            .then(r => r.json())
            .then(d => setDatasets(d.items || []))
            .catch(() => { });
    }, [activeNamespace?.id]);

    // Whenever we emit a change, clear the legacy single-field keys so storage no
    // longer carries both shapes. The new arrays are the source of truth.
    const emit = (patch: Partial<DatasetSource>) => onChange({
        ...cfg, ...patch,
        group_by: undefined, metric: undefined, fn: undefined,
    });

    const selectedDs = datasets.find(d => d.id === cfg.dataset_id);
    const cols = parseCols(selectedDs?.columns);
    const fieldOpts = [...cols, '_id'];

    const showGroupBy = slots?.showGroupBy ?? true;
    const showSelects = slots?.showSelects ?? slots?.showMetric ?? slots?.showFn ?? true;
    const showLimit = slots?.showLimit ?? true;
    const showSort = slots?.showSort ?? true;
    const showColumns = slots?.showColumns ?? false;

    const groupBys = cfg.group_bys || [];
    const selects = cfg.selects || [];

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Dataset</label>
                <SearchableSelect
                    options={datasets.map(d => ({ label: `${d.name} (${d.key})`, value: d.id, searchTerms: `${d.name} ${d.key}` }))}
                    value={cfg.dataset_id}
                    onValueChange={(val) => emit({ dataset_id: val || '' })}
                    isSearchable
                    placeholder="— Select dataset —"
                    searchPlaceholder="Search datasets..."
                    triggerClassName="h-8 px-2 w-full text-xs font-semibold border-border rounded-md bg-background text-foreground"
                />
            </div>

            {cfg.dataset_id && (
                <>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Filter</label>
                        <FilterBuilder
                            value={cfg.filter}
                            onChange={(v) => emit({ filter: v })}
                            columns={fieldOpts}
                            // Pass each callback independently — FilterBuilder hides each
                            // section when its callback isn't provided. e.g. METRIC widgets
                            // want Select rows but not Group By rows.
                            {...(showGroupBy ? {
                                groups: groupBys,
                                onGroupsChange: (v: string[]) => emit({ group_bys: v }),
                            } : {})}
                            {...(showSelects ? {
                                selects,
                                onSelectsChange: (v: SelectAggregation[]) => emit({ selects: v }),
                            } : {})}
                        />
                    </div>

                    {(showLimit || showSort) && (
                        <div className="grid grid-cols-2 gap-2">
                            {showLimit && (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Limit</label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={cfg.limit ?? 0}
                                        onChange={(e) => emit({ limit: parseInt(e.target.value) || 0 })}
                                        className="h-8 text-xs"
                                        placeholder="0 = all"
                                    />
                                </div>
                            )}
                            {showSort && (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Sort</label>
                                    <select
                                        value={cfg.sort || 'value_desc'}
                                        onChange={(e) => emit({ sort: e.target.value as DatasetSource['sort'] })}
                                        className="h-8 px-2 w-full text-xs font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer"
                                    >
                                        {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {showColumns && (() => {
                        // In aggregate mode the displayed table only has group_bys + select
                        // labels as available output columns, so offer those as suggestions
                        // alongside the raw dataset columns.
                        const aggMode = (cfg.group_bys && cfg.group_bys.length > 0)
                            || (cfg.selects && cfg.selects.length > 0);
                        const selectLabels = (cfg.selects || []).map((s, i) => {
                            if (s.label && s.label.trim()) return s.label.trim();
                            const fn = s.fn || 'count';
                            if (s.field) return `${fn}(${s.field})`;
                            return i === 0 ? String(fn) : `${fn}_${i + 1}`;
                        });
                        const aggOpts = aggMode
                            ? Array.from(new Set([...(cfg.group_bys || []), ...selectLabels, ...fieldOpts]))
                            : fieldOpts;
                        return (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Columns</label>
                                <MultiFieldCombo
                                    value={cfg.columns || []}
                                    onChange={(v) => emit({ columns: v })}
                                    options={aggOpts}
                                    placeholder={aggMode ? 'Pick from groups, selects, or type custom…' : 'Pick from dataset or type custom field…'}
                                />
                                <p className="text-[9px] text-muted-foreground/50 font-mono px-1">
                                    {aggMode
                                        ? 'Empty = show all group + select columns. Press Enter or comma to add.'
                                        : 'Empty = auto-discover columns from records. Press Enter or comma to add.'}
                                </p>
                            </div>
                        );
                    })()}
                </>
            )}
        </div>
    );
};
