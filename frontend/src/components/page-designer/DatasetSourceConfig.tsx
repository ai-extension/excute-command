import React, { useEffect, useState } from 'react';
import { Dataset, DatasetSource, AggregateFn } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNamespace } from '../../context/NamespaceContext';
import { API_BASE_URL } from '../../lib/api';
import { SearchableSelect } from '../SearchableSelect';
import { FilterBuilder } from '../FilterBuilder';
import { FieldCombo } from '../FieldCombo';
import { Input } from '../ui/input';

const parseCols = (raw?: string): string[] => {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.filter((c: any) => c && c.name).map((c: any) => c.name) : [];
    } catch { return []; }
};

interface Slots {
    showGroupBy?: boolean;
    showMetric?: boolean;
    showFn?: boolean;
    showLimit?: boolean;
    showSort?: boolean;
    showColumns?: boolean;
}

interface Props {
    value: DatasetSource | undefined;
    onChange: (v: DatasetSource) => void;
    slots?: Slots;
}

const FNS: AggregateFn[] = ['count', 'sum', 'avg', 'min', 'max'];
const SORTS = [
    { value: 'value_desc', label: 'Value ↓' },
    { value: 'value_asc', label: 'Value ↑' },
    { value: 'key_asc', label: 'Key A→Z' },
    { value: 'key_desc', label: 'Key Z→A' },
];

const emptySrc = (): DatasetSource => ({ dataset_id: '', filter: '' });

export const DatasetSourceConfig: React.FC<Props> = ({ value, onChange, slots }) => {
    const cfg = value || emptySrc();
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

    const update = (patch: Partial<DatasetSource>) => onChange({ ...cfg, ...patch });
    const selectedDs = datasets.find(d => d.id === cfg.dataset_id);
    const cols = parseCols(selectedDs?.columns);
    const fieldOpts = [...cols, '_id'];

    const showGroupBy = slots?.showGroupBy ?? true;
    const showMetric = slots?.showMetric ?? true;
    const showFn = slots?.showFn ?? true;
    const showLimit = slots?.showLimit ?? true;
    const showSort = slots?.showSort ?? true;
    const showColumns = slots?.showColumns ?? false;

    return (
        <div className="space-y-2">
            <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Dataset</label>
                <SearchableSelect
                    options={datasets.map(d => ({ label: `${d.name} (${d.key})`, value: d.id, searchTerms: `${d.name} ${d.key}` }))}
                    value={cfg.dataset_id}
                    onValueChange={(val) => update({ dataset_id: val || '' })}
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
                            onChange={(v) => update({ filter: v })}
                            columns={fieldOpts}
                        />
                    </div>

                    {showGroupBy && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Group By</label>
                            <FieldCombo
                                value={cfg.group_by || ''}
                                onChange={(v) => update({ group_by: v })}
                                options={fieldOpts}
                                placeholder="field name (empty = single bucket)"
                                className="h-8 px-2 text-xs font-mono"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        {showFn && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Function</label>
                                <select
                                    value={cfg.fn || 'count'}
                                    onChange={(e) => update({ fn: e.target.value as AggregateFn })}
                                    className="h-8 px-2 w-full text-xs font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer"
                                >
                                    {FNS.map(fn => <option key={fn} value={fn}>{fn.toUpperCase()}</option>)}
                                </select>
                            </div>
                        )}
                        {showMetric && cfg.fn && cfg.fn !== 'count' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Metric field</label>
                                <FieldCombo
                                    value={cfg.metric || ''}
                                    onChange={(v) => update({ metric: v })}
                                    options={fieldOpts}
                                    placeholder="numeric field"
                                    className="h-8 px-2 text-xs font-mono"
                                />
                            </div>
                        )}
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
                                        onChange={(e) => update({ limit: parseInt(e.target.value) || 0 })}
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
                                        onChange={(e) => update({ sort: e.target.value as DatasetSource['sort'] })}
                                        className="h-8 px-2 w-full text-xs font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer"
                                    >
                                        {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {showColumns && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">Columns</label>
                            <Input
                                value={(cfg.columns || []).join(', ')}
                                onChange={(e) => update({ columns: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                placeholder={cols.length > 0 ? cols.slice(0, 4).join(', ') : 'field1, field2, ...'}
                                className="h-8 text-xs font-mono"
                            />
                            {cols.length > 0 && (
                                <p className="text-[9px] text-muted-foreground/60 font-mono">Available: {cols.join(', ')}</p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
