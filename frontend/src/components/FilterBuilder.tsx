import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, FolderPlus } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { cn, generateUUID } from '../lib/utils';
import { FieldCombo } from './FieldCombo';
import { SelectAggregation, AggregateFn } from '../types';

const AGG_FNS: AggregateFn[] = ['count', 'sum', 'avg', 'min', 'max'];

// ---- Filter tree model ----
export type FCond = { field: string; op: string; value: string };
export type FGroup = { logic: 'AND' | 'OR'; conds: FNode[] };
export type FNode = FCond | FGroup;

const isGroup = (n: FNode): n is FGroup => (n as any).logic !== undefined;

export const FILTER_OPS = ['=', '!=', '>=', '<=', '>', '<', '~'];
const LEGACY_OPS = ['!=', '>=', '<=', '~', '>', '<', '='];

const normalizeGroup = (v: any): FGroup => ({
    logic: v.logic === 'OR' ? 'OR' : 'AND',
    conds: Array.isArray(v.conds) ? v.conds.map((c: any) => (c && c.logic !== undefined)
        ? normalizeGroup(c)
        : { field: c?.field || '', op: c?.op || '=', value: c?.value ?? '' }) : [],
});

// Parse a stored filter string (JSON tree or legacy "k=v,k=v") into a root group.
export const parseFilterTree = (s?: string): FGroup => {
    const raw = (s || '').trim();
    if (!raw) return { logic: 'AND', conds: [] };
    if (raw.startsWith('{')) {
        try { const v = JSON.parse(raw); if (v && v.logic !== undefined) return normalizeGroup(v); } catch { /* fall through */ }
    }
    const conds: FNode[] = raw.split(',').map(p => {
        for (const op of LEGACY_OPS) {
            const i = p.indexOf(op);
            if (i !== -1) return { field: p.slice(0, i).trim(), op, value: p.slice(i + op.length).trim() };
        }
        return { field: p.trim(), op: '=', value: '' };
    });
    return { logic: 'AND', conds };
};

const prune = (n: FNode): FNode | null => {
    if (isGroup(n)) {
        const cs = n.conds.map(prune).filter(Boolean) as FNode[];
        return cs.length ? { logic: n.logic, conds: cs } : null;
    }
    return n.field.trim() ? n : null;
};

// Serialize a root group to a stored string. Empty → '' (matches all / no filter).
export const serializeFilterTree = (g: FGroup): string => {
    const pg = prune(g) as FGroup | null;
    if (!pg || pg.conds.length === 0) return '';
    return JSON.stringify(pg);
};

export const filterCondCount = (g: FGroup): number =>
    g.conds.reduce((s, c) => s + (isGroup(c) ? filterCondCount(c) : (c.field.trim() ? 1 : 0)), 0);

// ---- UI ----
const LogicToggle: React.FC<{ logic: 'AND' | 'OR'; onChange: (l: 'AND' | 'OR') => void }> = ({ logic, onChange }) => (
    <div className="flex rounded-md overflow-hidden border border-border">
        {(['AND', 'OR'] as const).map(l => (
            <button key={l} type="button" onClick={() => onChange(l)}
                className={cn('px-1.5 h-5 text-[9px] font-black tracking-wider transition-colors',
                    logic === l ? 'bg-cyan-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted')}>
                {l}
            </button>
        ))}
    </div>
);

interface GroupBoxProps {
    group: FGroup;
    onChange: (g: FGroup) => void;
    columns: string[];
    onRemove?: () => void;
    depth: number;
}

const GroupBox: React.FC<GroupBoxProps> = ({ group, onChange, columns, onRemove, depth }) => {
    const setChild = (i: number, n: FNode) => onChange({ ...group, conds: group.conds.map((c, ix) => ix === i ? n : c) });
    const removeChild = (i: number) => onChange({ ...group, conds: group.conds.filter((_, ix) => ix !== i) });
    const addCond = () => onChange({ ...group, conds: [...group.conds, { field: columns[0] || '', op: '=', value: '' }] });
    const addGroup = () => onChange({ ...group, conds: [...group.conds, { logic: 'AND', conds: [] }] });

    return (
        <div className={cn('rounded-md border border-border/70 p-2 space-y-1.5', depth > 0 && 'bg-muted/20')}>
            <div className="flex items-center justify-between">
                <LogicToggle logic={group.logic} onChange={(l) => onChange({ ...group, logic: l })} />
                <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md" onClick={addCond}>
                        <Plus className="w-3 h-3" /> Condition
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md" onClick={addGroup}>
                        <FolderPlus className="w-3 h-3" /> Group
                    </Button>
                    {onRemove && (
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={onRemove}>
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    )}
                </div>
            </div>
            {group.conds.length === 0 ? (
                <p className="text-[9px] text-muted-foreground/50 italic pl-1">Empty group — add a condition or group.</p>
            ) : (
                <div className="space-y-1.5 pl-2 border-l-2 border-cyan-500/20">
                    {group.conds.map((c, i) => isGroup(c) ? (
                        <GroupBox key={i} group={c} onChange={(g) => setChild(i, g)} columns={columns} onRemove={() => removeChild(i)} depth={depth + 1} />
                    ) : (
                        <div key={i} className="flex items-center gap-1.5">
                            <div className="w-28">
                                <FieldCombo value={c.field} onChange={(v) => setChild(i, { ...c, field: v })} options={columns} placeholder="field" className="h-7 px-2 text-[11px] font-mono" />
                            </div>
                            <select value={c.op} onChange={(e) => setChild(i, { ...c, op: e.target.value })}
                                className="h-7 px-1 w-14 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer">
                                {FILTER_OPS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <Input value={c.value} placeholder="value" onChange={(e) => setChild(i, { ...c, value: e.target.value })}
                                className="h-7 flex-1 text-[11px] font-mono bg-background border-border" />
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={() => removeChild(i)}>
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Editor for the GROUP BY field list + SELECT aggregation list. Each section renders
// independently: pass groups+onGroupsChange to show the Group By row, pass
// selects+onSelectsChange to show the Select row. Both omitted → no editor.
interface AggregationEditorProps {
    columns: string[];
    groups?: string[];
    onGroupsChange?: (v: string[]) => void;
    selects?: SelectAggregation[];
    onSelectsChange?: (v: SelectAggregation[]) => void;
}

const AggregationEditor: React.FC<AggregationEditorProps> = ({
    columns, groups, onGroupsChange, selects, onSelectsChange,
}) => {
    const showGroups = !!onGroupsChange;
    const showSelects = !!onSelectsChange;
    if (!showGroups && !showSelects) return null;

    const gList = groups || [];
    const sList = selects || [];

    const addGroup = () => onGroupsChange!([...gList, '']);
    const updateGroup = (i: number, v: string) =>
        onGroupsChange!(gList.map((g, idx) => idx === i ? v : g));
    const removeGroup = (i: number) =>
        onGroupsChange!(gList.filter((_, idx) => idx !== i));

    const addSelect = () => onSelectsChange!([
        ...sList,
        { id: generateUUID(), fn: 'count', field: '', label: '' },
    ]);
    const updateSelect = (i: number, patch: Partial<SelectAggregation>) =>
        onSelectsChange!(sList.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    const removeSelect = (i: number) =>
        onSelectsChange!(sList.filter((_, idx) => idx !== i));

    return (
        <div className="mt-2 rounded-md border border-border/70 p-2 space-y-2 bg-muted/10">
            {showGroups && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-cyan-500/70">Group By</span>
                        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md" onClick={addGroup}>
                            <Plus className="w-3 h-3" /> Group Field
                        </Button>
                    </div>
                    {gList.length === 0 ? (
                        <p className="text-[9px] text-muted-foreground/50 italic pl-1">
                            No group fields — single bucket of all matching records.
                        </p>
                    ) : (
                        <div className="space-y-1.5 pl-2 border-l-2 border-cyan-500/20">
                            {gList.map((g, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className="flex-1">
                                        <FieldCombo value={g} onChange={(v) => updateGroup(i, v)}
                                            options={columns} placeholder="field"
                                            className="h-7 px-2 text-[11px] font-mono" />
                                    </div>
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => removeGroup(i)}>
                                        <X className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {showSelects && (
                <div className={cn('space-y-1', showGroups && 'pt-1 border-t border-border/40')}>
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-cyan-500/70">Select</span>
                        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md" onClick={addSelect}>
                            <Plus className="w-3 h-3" /> Select
                        </Button>
                    </div>
                    {sList.length === 0 ? (
                        <p className="text-[9px] text-muted-foreground/50 italic pl-1">
                            No selects — defaults to count of records per bucket.
                        </p>
                    ) : (
                        <div className="space-y-1.5 pl-2 border-l-2 border-cyan-500/20">
                            {sList.map((s, i) => (
                                <div key={s.id || i} className="grid grid-cols-12 gap-1 items-center">
                                    <select value={s.fn}
                                        onChange={(e) => updateSelect(i, { fn: e.target.value as AggregateFn })}
                                        className="col-span-3 h-7 px-1 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer">
                                        {AGG_FNS.map(fn => <option key={fn} value={fn}>{fn.toUpperCase()}</option>)}
                                    </select>
                                    <div className="col-span-4">
                                        <FieldCombo value={s.field || ''} onChange={(v) => updateSelect(i, { field: v })}
                                            options={columns}
                                            placeholder={s.fn === 'count' ? '(any field)' : 'numeric field'}
                                            className="h-7 px-2 text-[11px] font-mono" />
                                    </div>
                                    <Input value={s.label || ''}
                                        onChange={(e) => updateSelect(i, { label: e.target.value })}
                                        placeholder="label"
                                        className="col-span-4 h-7 text-[11px] font-mono px-2" />
                                    <Button type="button" variant="ghost" size="icon"
                                        className="col-span-1 h-7 w-7 rounded-md hover:bg-destructive/10 hover:text-destructive justify-self-end"
                                        onClick={() => removeSelect(i)}>
                                        <X className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface FilterBuilderProps {
    value: string;            // stored filter string (JSON tree or legacy)
    onChange: (v: string) => void;
    columns: string[];        // field suggestions
    // Optional aggregation editor (rendered below the boolean filter tree). Each section
    // shows independently: passing onGroupsChange reveals Group By, passing onSelectsChange
    // reveals Select. Consumers that only need filtering simply omit both — UI is then
    // identical to the original FilterBuilder.
    groups?: string[];
    onGroupsChange?: (v: string[]) => void;
    selects?: SelectAggregation[];
    onSelectsChange?: (v: SelectAggregation[]) => void;
}

// Controlled-ish: holds the working tree internally, emits a serialized string on edits.
// Re-syncs from `value` only when it changes externally (not from our own emit).
export const FilterBuilder: React.FC<FilterBuilderProps> = ({
    value, onChange, columns,
    groups, onGroupsChange, selects, onSelectsChange,
}) => {
    const [tree, setTree] = useState<FGroup>(() => parseFilterTree(value));
    const lastEmit = useRef<string>(value);

    useEffect(() => {
        if (value !== lastEmit.current) {
            setTree(parseFilterTree(value));
            lastEmit.current = value;
        }
    }, [value]);

    const update = (g: FGroup) => {
        setTree(g);
        const s = serializeFilterTree(g);
        lastEmit.current = s;
        onChange(s);
    };

    return (
        <div className="space-y-2">
            <GroupBox group={tree} onChange={update} columns={columns} depth={0} />
            <AggregationEditor
                columns={columns}
                groups={groups}
                onGroupsChange={onGroupsChange}
                selects={selects}
                onSelectsChange={onSelectsChange}
            />
        </div>
    );
};
