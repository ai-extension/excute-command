import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Database, Plus, Trash2, Edit3, Table2, ChevronRight, ArrowLeft, Braces, X, List, Eye, Copy, Check, Filter } from 'lucide-react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { copyToClipboard as clipboardCopy } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Dataset, DatasetColumn, DatasetRecord } from '../types';
import { Pagination } from '../components/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilterBuilder, parseFilterTree, filterCondCount } from '../components/FilterBuilder';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

const parseColumns = (raw?: string): DatasetColumn[] => {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
};

const parseData = (raw?: string): Record<string, any> => {
    if (!raw) return {};
    try {
        const v = JSON.parse(raw);
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
        return {};
    }
};

const renderCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
};

const FIELD_TYPES = ['string', 'number', 'bool', 'json'];

// One editable row in the structured record form.
type FieldRow = { key: string; type: string; value: string };

const inferType = (v: any): string => {
    if (typeof v === 'number') return 'number';
    if (typeof v === 'boolean') return 'bool';
    if (v && typeof v === 'object') return 'json';
    return 'string';
};

const valueToString = (v: any): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

// Convert a field row's string value into the typed JS value. Throws on bad input.
const coerceValue = (f: FieldRow): any => {
    switch (f.type) {
        case 'number': {
            if (f.value.trim() === '') return 0;
            const n = Number(f.value);
            if (Number.isNaN(n)) throw new Error(`Field "${f.key}": not a number`);
            return n;
        }
        case 'bool':
            return f.value === 'true';
        case 'json':
            if (f.value.trim() === '') return null;
            try { return JSON.parse(f.value); } catch { throw new Error(`Field "${f.key}": invalid JSON`); }
        default:
            return f.value;
    }
};

const DatasetRecordsPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { apiFetch } = useAuth();

    const [dataset, setDataset] = useState<Dataset | null>(null);
    const [records, setRecords] = useState<DatasetRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [limit] = useState(15);
    const [offset, setOffset] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilter, setShowFilter] = useState(false);
    const [filterDraft, setFilterDraft] = useState('');
    const [appliedFilter, setAppliedFilter] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'json'>('table');

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState<DatasetRecord | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DatasetRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [viewTarget, setViewTarget] = useState<DatasetRecord | null>(null);
    const [copied, setCopied] = useState(false);

    // Form modes: structured field editor (default) or raw JSON.
    const [mode, setMode] = useState<'form' | 'json'>('form');
    const [fields, setFields] = useState<FieldRow[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    const [jsonValue, setJsonValue] = useState('{}');
    const [jsonError, setJsonError] = useState<string | null>(null);

    const columns = useMemo(() => parseColumns(dataset?.columns), [dataset]);
    const colType = (key: string): string => columns.find(c => c.name === key)?.type || 'string';

    // Column headers = defined columns ∪ keys found in records.
    const headerKeys = useMemo(() => {
        const keys = new Set<string>(columns.map(c => c.name));
        records.forEach(r => Object.keys(parseData(r.data)).forEach(k => keys.add(k)));
        return Array.from(keys);
    }, [columns, records]);

    const fetchDataset = async () => {
        if (!id) return;
        try {
            const res = await apiFetch(`${API_BASE_URL}/datasets/${id}`);
            if (res.ok) setDataset(await res.json());
        } catch (e) {
            console.error('Failed to fetch dataset:', e);
        }
    };

    const fetchRecords = async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            let url = `${API_BASE_URL}/datasets/${id}/records?limit=${limit}&offset=${offset}`;
            if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
            if (appliedFilter) url += `&filter=${encodeURIComponent(appliedFilter)}`;
            const res = await apiFetch(url);
            const data = await res.json();
            setRecords(data.items || []);
            setTotal(data.total || 0);
        } catch (e) {
            console.error('Failed to fetch records:', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchDataset(); }, [id]);
    useEffect(() => { fetchRecords(); }, [id, offset, appliedFilter]);

    const applyFilter = () => { setAppliedFilter(filterDraft); setOffset(0); };
    const clearFilter = () => { setFilterDraft(''); setAppliedFilter(''); setOffset(0); };

    const objToFields = (obj: Record<string, any>): FieldRow[] =>
        Object.keys(obj).map(k => ({ key: k, type: colType(k) || inferType(obj[k]), value: valueToString(obj[k]) }));

    const openCreate = () => {
        setEditing(null);
        setMode('form');
        setFormError(null);
        setJsonError(null);
        // Pre-fill rows from defined columns, using each column's default value.
        setFields(columns.map(c => ({ key: c.name, type: c.type || 'string', value: c.default || '' })));
        setJsonValue('{}');
        setIsFormOpen(true);
    };

    const openEdit = (r: DatasetRecord) => {
        setEditing(r);
        setMode('form');
        setFormError(null);
        setJsonError(null);
        const obj = parseData(r.data);
        setFields(objToFields(obj));
        setJsonValue(JSON.stringify(obj, null, 2));
        setIsFormOpen(true);
    };

    const addField = () => setFields([...fields, { key: '', type: 'string', value: '' }]);
    const updateField = (idx: number, patch: Partial<FieldRow>) =>
        setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
    const removeField = (idx: number) => setFields(fields.filter((_, i) => i !== idx));

    // Build the data JSON string from the active editor mode. Returns null on error.
    const buildData = (): string | null => {
        if (mode === 'json') {
            const raw = jsonValue.trim();
            if (!raw) return '{}';
            try {
                const v = JSON.parse(raw);
                if (typeof v !== 'object' || Array.isArray(v) || v === null) {
                    setJsonError('Data must be a JSON object');
                    return null;
                }
                setJsonError(null);
                return JSON.stringify(v);
            } catch {
                setJsonError('Invalid JSON');
                return null;
            }
        }
        const obj: Record<string, any> = {};
        try {
            for (const f of fields) {
                const k = f.key.trim();
                if (!k) continue;
                obj[k] = coerceValue(f);
            }
        } catch (err: any) {
            setFormError(err.message || 'Invalid field value');
            return null;
        }
        setFormError(null);
        return JSON.stringify(obj);
    };

    // Sync between modes when the user toggles the JSON switch.
    const switchMode = (next: 'form' | 'json') => {
        if (next === mode) return;
        if (next === 'json') {
            const obj: Record<string, any> = {};
            try {
                for (const f of fields) { const k = f.key.trim(); if (k) obj[k] = coerceValue(f); }
                setJsonValue(JSON.stringify(obj, null, 2));
                setJsonError(null);
            } catch (err: any) {
                setFormError(err.message);
                return;
            }
        } else {
            try {
                const v = JSON.parse(jsonValue || '{}');
                if (typeof v !== 'object' || Array.isArray(v)) throw new Error('not object');
                setFields(objToFields(v));
                setFormError(null);
            } catch {
                setJsonError('Fix JSON before switching to form');
                return;
            }
        }
        setMode(next);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const data = buildData();
        if (data === null) return;
        setIsSubmitting(true);
        try {
            const url = editing
                ? `${API_BASE_URL}/dataset-records/${editing.id}`
                : `${API_BASE_URL}/datasets/${id}/records`;
            const res = await apiFetch(url, {
                method: editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data })
            });
            if (res.ok) {
                await fetchRecords();
                setIsFormOpen(false);
                setEditing(null);
            }
        } catch (e) {
            console.error('Failed to save record:', e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const res = await apiFetch(`${API_BASE_URL}/dataset-records/${deleteTarget.id}`, { method: 'DELETE' });
            if (res.ok) await fetchRecords();
        } catch (e) {
            console.error('Failed to delete record:', e);
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    const recordActions = (r: DatasetRecord) => (
        <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" className="rounded-md hover:bg-cyan-500/10 hover:text-cyan-500 transition-colors" onClick={() => { setViewTarget(r); setCopied(false); }} title="View JSON">
                <Eye className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-md hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors" onClick={() => openEdit(r)} title="Edit">
                <Edit3 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={() => setDeleteTarget(r)} title="Delete">
                <Trash2 className="w-4 h-4" />
            </Button>
        </div>
    );

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => navigate('/datasets')}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Table2 className="w-3.5 h-3.5 text-primary" />
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                        <span className="text-primary cursor-pointer" onClick={() => navigate('/datasets')}>Datasets</span>
                        <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                        <span className="text-muted-foreground font-black">{dataset?.name || dataset?.key || 'Records'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Search records..."
                        className="h-8 w-56 bg-muted/30 border-border rounded-md text-xs"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setOffset(0); fetchRecords(); } }}
                    />
                    <div className="flex rounded-md overflow-hidden border border-border">
                        <button type="button" onClick={() => setViewMode('table')}
                            className={`h-8 px-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`} title="Table view">
                            <List className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => setViewMode('json')}
                            className={`h-8 px-2 ${viewMode === 'json' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`} title="JSON view">
                            <Braces className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <Button
                        variant={showFilter || appliedFilter ? 'default' : 'outline'}
                        onClick={() => setShowFilter(v => !v)}
                        className="h-8 font-black uppercase tracking-widest text-[10px] px-3 rounded-md gap-2"
                    >
                        <Filter className="w-3.5 h-3.5" /> Filter{appliedFilter ? ` (${filterCondCount(parseFilterTree(appliedFilter))})` : ''}
                    </Button>
                    <Button
                        onClick={openCreate}
                        className="h-8 premium-gradient font-black uppercase tracking-widest text-[10px] px-4 shadow-premium rounded-md gap-2"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Record
                    </Button>
                </div>
            </div>

            {showFilter && (
                <Card className="rounded-md border border-border bg-card shadow-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Filter records</span>
                        <div className="flex gap-1">
                            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 rounded-md" onClick={clearFilter}>Clear</Button>
                            <Button type="button" size="sm" className="h-6 text-[10px] px-3 rounded-md premium-gradient font-black" onClick={applyFilter}>Apply</Button>
                        </div>
                    </div>
                    <FilterBuilder
                        value={filterDraft}
                        onChange={setFilterDraft}
                        columns={[...columns.map(col => col.name), '_id']}
                    />
                    <p className="text-[9px] text-muted-foreground/50 font-mono">ops: = != &gt; &lt; &gt;= &lt;= ~ (contains) · AND/OR + nested groups</p>
                </Card>
            )}

            {viewMode === 'table' ? (
                <Card className="rounded-md border border-border bg-card shadow-card overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted hover:bg-muted/80 border-border">
                                {headerKeys.map(k => (
                                    <TableHead key={k} className="h-9 font-black uppercase tracking-[0.12em] text-[10px] text-muted-foreground px-4 whitespace-nowrap">{k}</TableHead>
                                ))}
                                {headerKeys.length === 0 && (
                                    <TableHead className="h-9 font-black uppercase tracking-[0.12em] text-[10px] text-muted-foreground px-4">Data</TableHead>
                                )}
                                <TableHead className="text-right h-9 px-6 font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground sticky right-0 z-20 bg-muted shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.2)]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading && records.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={(headerKeys.length || 1) + 1} className="h-48 text-center bg-transparent">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Loading records...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : records.length > 0 ? records.map((r) => {
                                const obj = parseData(r.data);
                                return (
                                    <TableRow key={r.id} className="group border-border hover:bg-muted/30 transition-all duration-200">
                                        {headerKeys.length > 0 ? headerKeys.map(k => (
                                            <TableCell key={k} className="px-4 py-3 max-w-[260px]">
                                                <span className="text-xs font-medium text-foreground truncate block">{renderCell(obj[k])}</span>
                                            </TableCell>
                                        )) : (
                                            <TableCell className="px-4 py-3">
                                                <code className="text-[11px] font-mono text-foreground">{r.data}</code>
                                            </TableCell>
                                        )}
                                        <TableCell className="text-right px-6 sticky right-0 z-10 bg-card group-hover:bg-muted/30 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.2)]">
                                            {recordActions(r)}
                                        </TableCell>
                                    </TableRow>
                                );
                            }) : (
                                <TableRow>
                                    <TableCell colSpan={(headerKeys.length || 1) + 1} className="h-48 text-center bg-transparent">
                                        <div className="flex flex-col items-center justify-center gap-4 opacity-40">
                                            <Database className="w-10 h-10" />
                                            <div className="space-y-1">
                                                <p className="text-xs font-black uppercase tracking-[0.2em]">No records yet</p>
                                                <p className="text-[10px] font-bold opacity-60">Add data rows to this dataset.</p>
                                            </div>
                                            <Button variant="outline" size="sm" className="mt-2 rounded-full border-dashed" onClick={openCreate}>
                                                Add Record
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            ) : (
                <Card className="rounded-md border border-border bg-card shadow-card divide-y divide-border">
                    {isLoading && records.length === 0 ? (
                        <div className="h-48 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Loading records...</p>
                        </div>
                    ) : records.length > 0 ? records.map((r) => (
                        <div key={r.id} className="group flex items-start gap-2 p-3 hover:bg-muted/30 transition-colors">
                            <pre className="flex-1 overflow-x-auto text-[11px] font-mono text-foreground whitespace-pre-wrap break-all">{JSON.stringify(parseData(r.data), null, 2)}</pre>
                            <div className="shrink-0">{recordActions(r)}</div>
                        </div>
                    )) : (
                        <div className="h-48 flex flex-col items-center justify-center gap-4 opacity-40">
                            <Database className="w-10 h-10" />
                            <p className="text-xs font-black uppercase tracking-[0.2em]">No records yet</p>
                            <Button variant="outline" size="sm" className="rounded-full border-dashed" onClick={openCreate}>Add Record</Button>
                        </div>
                    )}
                </Card>
            )}

            <Pagination
                total={total}
                offset={offset}
                limit={limit}
                itemName="Records"
                onPageChange={setOffset}
            />

            {/* Create / Edit Dialog */}
            <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) setEditing(null); }}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black tracking-tight">{editing ? 'Edit Record' : 'Add Record'}</DialogTitle>
                        <DialogDescription className="text-xs font-medium text-muted-foreground">
                            Fill fields below. Schema is loose — add any extra fields you need.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        {/* Mode toggle */}
                        <div className="flex items-center justify-end gap-1">
                            <Button type="button" variant={mode === 'form' ? 'default' : 'outline'} size="sm"
                                className="h-6 text-[10px] px-2 gap-1 rounded-md" onClick={() => switchMode('form')}>
                                <List className="w-3 h-3" /> Form
                            </Button>
                            <Button type="button" variant={mode === 'json' ? 'default' : 'outline'} size="sm"
                                className="h-6 text-[10px] px-2 gap-1 rounded-md" onClick={() => switchMode('json')}>
                                <Braces className="w-3 h-3" /> JSON
                            </Button>
                        </div>

                        {mode === 'form' ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Fields</Label>
                                    <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md" onClick={addField}>
                                        <Plus className="w-3 h-3" /> Add Field
                                    </Button>
                                </div>
                                {fields.length === 0 ? (
                                    <p className="text-[10px] font-bold opacity-40 px-1 italic">No fields. Click "Add Field" to start.</p>
                                ) : (
                                    <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                                        {fields.map((f, idx) => (
                                            <div key={idx} className="flex items-center gap-1.5">
                                                <Input
                                                    placeholder="key"
                                                    className="h-8 w-32 bg-muted/30 border-border rounded-md text-xs font-bold"
                                                    value={f.key}
                                                    onChange={(e) => updateField(idx, { key: e.target.value })}
                                                />
                                                <select
                                                    value={f.type}
                                                    onChange={(e) => updateField(idx, { type: e.target.value })}
                                                    className="h-8 px-1 w-20 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer"
                                                >
                                                    {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                                {f.type === 'bool' ? (
                                                    <select
                                                        value={f.value === 'true' ? 'true' : 'false'}
                                                        onChange={(e) => updateField(idx, { value: e.target.value })}
                                                        className="h-8 px-2 flex-1 text-xs border border-border rounded-md bg-background text-foreground outline-none cursor-pointer"
                                                    >
                                                        <option value="true">true</option>
                                                        <option value="false">false</option>
                                                    </select>
                                                ) : (
                                                    <Input
                                                        placeholder={f.type === 'json' ? '{"k":"v"}' : f.type === 'number' ? '0' : 'value'}
                                                        className="h-8 flex-1 bg-muted/30 border-border rounded-md text-xs font-mono"
                                                        value={f.value}
                                                        onChange={(e) => updateField(idx, { value: e.target.value })}
                                                    />
                                                )}
                                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={() => removeField(idx)}>
                                                    <X className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {formError && <p className="text-[10px] font-bold text-destructive px-1">{formError}</p>}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1 flex items-center gap-1.5">
                                    <Braces className="w-3 h-3" /> Data (JSON)
                                </Label>
                                <Textarea
                                    className="min-h-[200px] bg-muted/30 border-border rounded-md font-mono text-xs resize-y"
                                    value={jsonValue}
                                    onChange={(e) => setJsonValue(e.target.value)}
                                    spellCheck={false}
                                />
                                {jsonError && <p className="text-[10px] font-bold text-destructive px-1">{jsonError}</p>}
                            </div>
                        )}
                        <DialogFooter className="pt-2">
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="premium-gradient font-black uppercase tracking-widest text-[10px] h-9 w-full shadow-premium rounded-md"
                            >
                                {isSubmitting ? "Saving..." : editing ? "Update Record" : "Save Record"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Quick View (JSON) */}
            <Dialog open={!!viewTarget} onOpenChange={(open) => { if (!open) setViewTarget(null); }}>
                <DialogContent className="sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-2">
                            <Braces className="w-5 h-5 text-cyan-500" /> Record JSON
                        </DialogTitle>
                        <DialogDescription className="text-xs font-medium text-muted-foreground">
                            Read-only view of the record data.
                        </DialogDescription>
                    </DialogHeader>
                    {(() => {
                        const pretty = JSON.stringify(parseData(viewTarget?.data), null, 2);
                        return (
                            <div className="relative">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="absolute right-2 top-2 h-6 text-[10px] px-2 gap-1 rounded-md z-10"
                                    onClick={async () => { if (await clipboardCopy(pretty)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } }}
                                >
                                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Copy'}
                                </Button>
                                <pre className="max-h-[420px] overflow-auto bg-muted/40 border border-border rounded-md p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
{pretty}
                                </pre>
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title="Delete Record"
                description="Delete this record? This cannot be undone."
                confirmText="Delete Record"
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
};

export default DatasetRecordsPage;
