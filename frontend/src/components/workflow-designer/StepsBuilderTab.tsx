import React, { useState, useEffect } from 'react';
import { Layers, Plus, GripVertical, AlertCircle, Server, SlidersHorizontal, File, Trash2, RefreshCw, FileText, Terminal, Copy, Check, CheckCircle2, XCircle, Info, Repeat, X, Braces } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { SearchableSelect } from '../SearchableSelect';
import { FieldCombo } from '../FieldCombo';
import { FilterBuilder } from '../FilterBuilder';
import { cn, copyToClipboard, generateUUID } from '../../lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { ConfirmDialog } from '../ConfirmDialog';

import { WorkflowGroup, WorkflowStep, Server as ServerType, Workflow, Dataset } from '../../types';
import { API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const getMultiInputKeys = (dv: string | undefined): string[] => {
    const val = (dv || '').trim();
    if (!val) return [];
    if (val.startsWith('[') || val.startsWith('{')) {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
                // If it's the structured MultiInputItem format (array of objects with 'key'), use those keys
                if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null && 'key' in parsed[0]) {
                    return parsed.map((item: any) => item.key).filter(Boolean);
                }
                
                // If it's a simple array of strings, return it directly
                if (parsed.length > 0 && typeof parsed[0] === 'string') {
                    return parsed;
                }

                // If it's an array of objects (generic), return keys of the first object
                const first = parsed[0];
                if (first && typeof first === 'object') {
                    return Object.keys(first);
                }
                
                // Empty array means no keys
                if (parsed.length === 0) return [];
            } else if (parsed && typeof parsed === 'object') {
                return Object.keys(parsed);
            }
        } catch { }
    }
    return val.split(',').map(k => k.trim()).filter(Boolean);
};

// ---- Dataset step builders ----
const parseDsColumns = (raw?: string): { name: string; type: string }[] => {
    if (!raw) return [];
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((c: any) => c && c.name) : []; } catch { return []; }
};

const PAYLOAD_TYPES = ['string', 'number', 'bool', 'json'];
type PayloadRow = { key: string; type: string; value: string };

const inferPType = (v: any): string => typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : (v && typeof v === 'object') ? 'json' : 'string';
const pValueToString = (v: any): string => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

// An {"$inc": n} object is the increment operator (UPDATE only), not a literal value.
const isIncOp = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && '$inc' in v;

// Returns rows if the payload is an editable JSON object (or empty), or null for arrays / invalid JSON.
const parsePayloadRows = (s?: string): PayloadRow[] | null => {
    if (!s || !s.trim()) return [];
    try {
        const v = JSON.parse(s);
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.keys(v).map(k => isIncOp(v[k])
                ? { key: k, type: 'inc', value: pValueToString(v[k].$inc) }
                : { key: k, type: inferPType(v[k]), value: pValueToString(v[k]) });
        }
        return null;
    } catch { return null; }
};
const serializePayloadRows = (rows: PayloadRow[]): string => {
    const obj: Record<string, any> = {};
    for (const r of rows) {
        const k = r.key.trim();
        if (!k) continue;
        let val: any = r.value;
        if (r.type === 'number') { const n = Number(r.value); val = Number.isNaN(n) ? r.value : n; }
        else if (r.type === 'bool') val = r.value === 'true';
        else if (r.type === 'json') { try { val = JSON.parse(r.value); } catch { val = r.value; } }
        // inc: literal number stays a number; a template (e.g. {{ input.n }}) stays a string,
        // which the backend coerces at run time.
        else if (r.type === 'inc') { const n = Number(r.value); val = { $inc: (r.value.trim() !== '' && !Number.isNaN(n)) ? n : r.value }; }
        obj[k] = val;
    }
    return JSON.stringify(obj);
};

interface StepsBuilderTabProps {
    groups: Partial<WorkflowGroup>[];
    setGroups: (groups: Partial<WorkflowGroup>[]) => void;
    availableServers: ServerType[];
    allWorkflows: Workflow[];
    handleDragEnd: (result: DropResult) => void;
    handleAddGroup: () => void;
    handleSearchServers: (query: string) => void;
    handleSearchWorkflows: (query: string) => void;
    id: string | undefined;
}

export const StepsBuilderTab: React.FC<StepsBuilderTabProps> = ({
    groups, setGroups, availableServers, allWorkflows,
    handleDragEnd,
    handleAddGroup,
    handleSearchServers,
    handleSearchWorkflows,
    id
}) => {
    const [openSettingsGroupIdx, setOpenSettingsGroupIdx] = useState<number | null>(null);
    const [openTTYSettingsGroupIdx, setOpenTTYSettingsGroupIdx] = useState<number | null>(null);
    const [pasteModal, setPasteModal] = useState<{ open: boolean; gIdx: number; sIdx: number; text: string }>({ open: false, gIdx: 0, sIdx: 0, text: '' });
    const [testResult, setTestResult] = useState<{ open: boolean; title: string; message: string; variant: 'success' | 'danger' | 'info' }>({ open: false, title: '', message: '', variant: 'info' });
    const { apiFetch } = useAuth();

    const parentWf = allWorkflows.find(w => w.id === id);

    // Datasets for the DATASET step picker (scoped to the parent workflow's namespace).
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    // Per-step flag: edit payload as raw JSON instead of the field builder. Keyed by step id.
    const [rawPayload, setRawPayload] = useState<Record<string, boolean>>({});
    // Per-step draft of the dataset payload field rows. Editing state can hold rows
    // with an empty or duplicate key (a freshly added field, or all dataset columns
    // already used); those don't round-trip through dataset_payload because
    // serializePayloadRows drops empty keys. The draft keeps them alive on re-render.
    const [payloadDraft, setPayloadDraft] = useState<Record<string, PayloadRow[]>>({});
    const nsId = parentWf?.namespace_id;
    // Datasets already fetched by reference, so the list fetch below + the per-step
    // resolver don't refetch or clobber each other (groups changes every keystroke).
    const fetchedDatasetIdsRef = React.useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!nsId) return;
        apiFetch(`${API_BASE_URL}/namespaces/${nsId}/datasets?limit=15`)
            .then(r => r.json())
            .then(d => {
                const items: Dataset[] = d.items || [];
                // Merge instead of replace so datasets resolved by reference are kept.
                setDatasets(prev => {
                    const m = new Map(prev.map(x => [x.id, x]));
                    items.forEach(x => m.set(x.id, x));
                    return Array.from(m.values());
                });
            })
            .catch(() => { });
    }, [nsId]);

    // The dataset select only loads the first ~15 datasets and has no server-side
    // search, so a DATASET step referencing a dataset outside that page renders blank
    // with no columns. Resolve each referenced dataset by id and merge it in.
    useEffect(() => {
        if (!nsId) return;
        const referenced = Array.from(new Set(
            groups
                .flatMap(g => g.steps || [])
                .filter(s => s.action_type === 'DATASET' && s.dataset_id)
                .map(s => s.dataset_id as string)
        ));
        const missing = referenced.filter(did =>
            !fetchedDatasetIdsRef.current.has(did) && !datasets.some(d => d.id === did)
        );
        if (missing.length === 0) return;
        missing.forEach(did => fetchedDatasetIdsRef.current.add(did));
        Promise.all(missing.map(async (did) => {
            try {
                const res = await apiFetch(`${API_BASE_URL}/datasets/${did}`);
                if (!res.ok) return null;
                return await res.json() as Dataset;
            } catch {
                return null;
            }
        })).then(results => {
            const fetched = results.filter((d): d is Dataset => !!d);
            if (fetched.length === 0) return;
            setDatasets(prev => {
                const m = new Map(prev.map(x => [x.id, x]));
                fetched.forEach(x => m.set(x.id, x));
                return Array.from(m.values());
            });
        });
    }, [nsId, groups, datasets]);
    const parentInputs = parentWf?.inputs || [];

    return (
        <>
            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                {groups.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center gap-4 opacity-50 border-2 border-dashed border-border rounded-md bg-card">
                        <Layers className="w-12 h-12 text-muted-foreground" />
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Blueprint is currently empty</p>
                        <Button onClick={handleAddGroup} variant="outline" className="rounded-md px-6">Initialize Architecture</Button>
                    </div>
                ) : (
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="groups" type="GROUP">
                            {(provided) => (
                                <div
                                    className="space-y-6"
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                >
                                    {groups.map((group, gIdx) => (
                                        <Draggable key={group.id || `temp_group_${gIdx}`} draggableId={group.id || `temp_group_${gIdx}`} index={gIdx}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    className={cn(
                                                        "bg-card border rounded-md overflow-hidden transition-all",
                                                        snapshot.isDragging ? "border-primary/50 shadow-xl shadow-black/20" : "border-border shadow-sm"
                                                    )}
                                                >
                                                    <div className="px-6 py-3 bg-muted/30 border-b border-border flex flex-wrap items-center justify-between gap-4">
                                                        {/* LEFT: Group Info */}
                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <div
                                                                {...provided.dragHandleProps}
                                                                className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing transition-colors shrink-0"
                                                            >
                                                                <GripVertical className="w-4 h-4" />
                                                            </div>
                                                            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                                                                <Layers className="w-4 h-4 text-primary" />
                                                            </div>
                                                            <div className="flex flex-col flex-1 min-w-0">
                                                                <Input
                                                                    value={group.name}
                                                                    onChange={(e) => {
                                                                        const ng = [...groups];
                                                                        ng[gIdx].name = e.target.value;
                                                                        setGroups(ng);
                                                                    }}
                                                                    className="bg-transparent border border-transparent hover:border-border/50 focus:border-primary/30 focus:bg-background h-7 px-2 -ml-2 rounded-md text-sm font-bold tracking-tight focus-visible:ring-1 focus-visible:ring-primary/20 w-full max-w-[200px] transition-all"
                                                                    placeholder="Group Name"
                                                                />
                                                                <div className="flex items-center gap-1 pl-0.5">
                                                                    <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">ID:</span>
                                                                    <Input
                                                                        value={group.key || ''}
                                                                        onChange={(e) => {
                                                                            const ng = [...groups];
                                                                            ng[gIdx].key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                                            setGroups(ng);
                                                                        }}
                                                                        className="bg-transparent border border-transparent hover:border-border/50 focus:border-primary/30 focus:bg-background h-6 px-1.5 -ml-1.5 rounded-md text-[10px] font-mono text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/20 w-full max-w-[150px] transition-all"
                                                                        placeholder="group_key"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* MIDDLE: Configuration Badges */}
                                                        <div className="flex-1 flex flex-wrap items-center justify-center gap-1.5 px-2 min-w-0">
                                                            {group.skip && (
                                                                <Badge variant="outline" className="h-5 px-2 text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-500 border-red-500/20 whitespace-nowrap">
                                                                    <XCircle className="w-3 h-3 mr-1" /> Skipped
                                                                </Badge>
                                                            )}
                                                            {group.mcp_report_log && (
                                                                <Badge variant="outline" className="h-5 px-2 text-[10px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 border-blue-500/20 whitespace-nowrap">
                                                                    <FileText className="w-3 h-3 mr-1" /> MCP Log
                                                                </Badge>
                                                            )}
                                                            {group.retry_enabled && (
                                                                <Badge variant="outline" className="h-5 px-2 text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border-amber-500/20 whitespace-nowrap">
                                                                    <RefreshCw className="w-3 h-3 mr-1" /> Retry
                                                                </Badge>
                                                            )}
                                                            {group.continue_on_failure && (
                                                                <Badge variant="outline" className="h-5 px-2 text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border-amber-500/20 whitespace-nowrap">
                                                                    <AlertCircle className="w-3 h-3 mr-1" /> Continue
                                                                </Badge>
                                                            )}
                                                            {group.is_copy_enabled && (
                                                                <Badge variant="outline" className="h-5 px-2 text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border-emerald-500/20 whitespace-nowrap">
                                                                    <File className="w-3 h-3 mr-1" /> Relay
                                                                </Badge>
                                                            )}
                                                            {group.loop_enabled && group.for && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-500 max-w-[140px] truncate" title={`Loop: ${group.for}`}>
                                                                    <Repeat className="w-3 h-3 shrink-0" /> <span className="truncate">{group.for}</span>
                                                                </span>
                                                            )}
                                                            {group.condition && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-500 max-w-[140px] truncate" title={`Condition: ${group.condition}`}>
                                                                    <span className="truncate">if {group.condition}</span>
                                                                </span>
                                                            )}
                                                            {group.default_server_id && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-500" title={`Server: ${group.default_server?.name || availableServers.find(s => s.id === group.default_server_id)?.name || group.default_server_id}`}>
                                                                    <Server className="w-3 h-3 shrink-0" />
                                                                    <span className="truncate max-w-[100px]">{group.default_server?.name || availableServers.find(s => s.id === group.default_server_id)?.name || group.default_server_id}</span>
                                                                </span>
                                                            )}
                                                            {group.use_tty && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-500">
                                                                    <Terminal className="w-3 h-3 shrink-0" /> TTY
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* RIGHT: Actions */}
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                onClick={() => {
                                                                    const ng = [...groups];
                                                                    ng[gIdx].is_parallel = !ng[gIdx].is_parallel;
                                                                    setGroups(ng);
                                                                }}
                                                                className={cn(
                                                                    "px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border",
                                                                    group.is_parallel
                                                                        ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                                                                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                                                                )}
                                                            >
                                                                {group.is_parallel ? 'Parallel' : 'Sequence'}
                                                            </button>
                                                            <div className="relative flex items-center gap-1">
                                                                <button
                                                                    onClick={() => setOpenTTYSettingsGroupIdx(openTTYSettingsGroupIdx === gIdx ? null : gIdx)}
                                                                    className={cn(
                                                                        "h-8 w-8 flex items-center justify-center rounded-md border transition-all",
                                                                        openTTYSettingsGroupIdx === gIdx
                                                                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-500"
                                                                            : group.use_tty
                                                                                ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                                                                                : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                                                                    )}
                                                                    title="Terminal settings"
                                                                >
                                                                    <Terminal className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => setOpenSettingsGroupIdx(openSettingsGroupIdx === gIdx ? null : gIdx)}
                                                                    className={cn(
                                                                        "h-8 w-8 flex items-center justify-center rounded-md border transition-all",
                                                                        openSettingsGroupIdx === gIdx
                                                                            ? "bg-primary/10 border-primary/30 text-primary"
                                                                            : (group.default_server_id || group.condition)
                                                                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                                                                : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                                                                    )}
                                                                    title="Group settings"
                                                                >
                                                                    <SlidersHorizontal className="w-3.5 h-3.5" />
                                                                </button>
                                                                
                                                                {/* TTY Settings Popup */}
                                                                {openTTYSettingsGroupIdx === gIdx && (
                                                                    <>
                                                                        {/* Backdrop */}
                                                                        <div
                                                                            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                                                                            onClick={() => setOpenTTYSettingsGroupIdx(null)}
                                                                        />
                                                                        {/* Popup card */}
                                                                        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-lg w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto glass rounded-md shadow-2xl shadow-indigo-500/10 animate-in fade-in zoom-in-95 duration-200 border-none flex flex-col">
                                                                            <div className="px-6 py-5 flex items-center justify-between text-white bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-t-md shrink-0">
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="w-10 h-10 rounded-md bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                                                                                        <Terminal className="w-5 h-5" />
                                                                                    </div>
                                                                                    <div className="flex flex-col px-2 pt-3">
                                                                                        <span className="text-base backdrop-blur-sm font-mono">{group.name} - Terminal</span>
                                                                                        <span className="text-[10px] opacity-60 mt-1 font-mono">Interactive Shell Configuration</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="px-8 py-6 space-y-6">
                                                                                {/* User TTY Mode */}
                                                                                <div className="flex items-center justify-between p-5 bg-background border border-border/50 rounded-md shadow-sm">
                                                                                    <div className="flex items-center gap-3">
                                                                                        <div className="w-8 h-8 rounded-md bg-indigo-500/10 flex items-center justify-center">
                                                                                            <Terminal className="w-4 h-4 text-indigo-500" />
                                                                                        </div>
                                                                                        <div className="flex flex-col">
                                                                                            <span className="text-xs font-bold text-foreground/80 leading-none">Terminal Session (TTY)</span>
                                                                                            <span className="text-[10px] text-muted-foreground mt-1 text-left">Enabled Pseudo-Terminal for Interactive CLI commands (sudo, npm login, etc.)</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <Switch
                                                                                        checked={!!group.use_tty}
                                                                                        onCheckedChange={(checked) => {
                                                                                            const ng = [...groups];
                                                                                            ng[gIdx].use_tty = checked;
                                                                                            setGroups(ng);
                                                                                        }}
                                                                                    />
                                                                                </div>

                                                                                {/* Auto Inputs */}
                                                                                <div className="p-5 bg-background border border-border/50 rounded-md shadow-sm space-y-4">
                                                                                    <div className="flex items-center justify-between mb-3">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <div className="flex flex-col">
                                                                                                <span className="text-xs font-bold text-foreground/80 leading-none">Automated Terminal Inputs</span>
                                                                                                <span className="text-[10px] text-muted-foreground mt-1 text-left">Pass expected values to interactive prompts</span>
                                                                                            </div>
                                                                                        </div>
                                                                                        <Button
                                                                                            variant="outline"
                                                                                            size="sm"
                                                                                            className="h-8 text-xs px-3 font-semibold rounded-md bg-indigo-500/5 hover:bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                                                                                            onClick={() => {
                                                                                                const ng = [...groups];
                                                                                                let current: any[] = [];
                                                                                                try {
                                                                                                    if (ng[gIdx].auto_inputs) {
                                                                                                        current = JSON.parse(ng[gIdx].auto_inputs as string);
                                                                                                    }
                                                                                                } catch (e) {}
                                                                                                if (!Array.isArray(current)) current = [];
                                                                                                current.push({ pattern: '', value: '', isRegex: false });
                                                                                                ng[gIdx].auto_inputs = JSON.stringify(current, null, 2);
                                                                                                setGroups(ng);
                                                                                            }}
                                                                                        >
                                                                                            <Plus className="w-3.5 h-3.5 mr-1" /> Add Rule
                                                                                        </Button>
                                                                                    </div>
                                                                                    <div className="space-y-3">
                                                                                        {(() => {
                                                                                            let rules: any[] = [];
                                                                                            try {
                                                                                                if (group.auto_inputs) rules = JSON.parse(group.auto_inputs as string);
                                                                                            } catch (e) {}
                                                                                            if (!Array.isArray(rules)) rules = [];
                                                                                            
                                                                                            if (rules.length === 0) {
                                                                                                return (
                                                                                                    <div className="text-center py-8 border-2 border-dashed border-border/50 rounded-md text-muted-foreground text-xs font-medium bg-muted/20">
                                                                                                        No automation rules defined.<br/>Click "Add Rule" to automate keyboard inputs.
                                                                                                    </div>
                                                                                                );
                                                                                            }
                                                                                            return rules.map((rule, rIdx) => (
                                                                                                <div key={rIdx} className="flex flex-col gap-3 bg-muted/40 p-4 rounded-md border border-border/50 relative group/rule transition-all hover:bg-muted/60">
                                                                                                    <div className="flex items-center justify-between w-full">
                                                                                                        <div className="flex-1 space-y-1 w-full mr-3">
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Match Pattern</label>
                                                                                                            <Input 
                                                                                                                value={rule.pattern || ''} 
                                                                                                                onChange={(e) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    let parsed = [];
                                                                                                                    try { parsed = JSON.parse(ng[gIdx].auto_inputs || '[]'); } catch(err) {}
                                                                                                                    if (!Array.isArray(parsed)) parsed = [];
                                                                                                                    if (parsed[rIdx]) parsed[rIdx].pattern = e.target.value;
                                                                                                                    ng[gIdx].auto_inputs = JSON.stringify(parsed, null, 2);
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                placeholder="e.g. Password:"
                                                                                                                className="h-9 text-xs font-mono bg-background border-border/50 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500/50"
                                                                                                            />
                                                                                                        </div>
                                                                                                        <div className="flex-1 space-y-1 w-full mr-3">
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Input Value</label>
                                                                                                            <Input 
                                                                                                                value={rule.value || ''} 
                                                                                                                onChange={(e) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    let parsed = [];
                                                                                                                    try { parsed = JSON.parse(ng[gIdx].auto_inputs || '[]'); } catch(err) {}
                                                                                                                    if (!Array.isArray(parsed)) parsed = [];
                                                                                                                    if (parsed[rIdx]) parsed[rIdx].value = e.target.value;
                                                                                                                    ng[gIdx].auto_inputs = JSON.stringify(parsed, null, 2);
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                placeholder="e.g. mySecret123"
                                                                                                                className="h-9 text-xs font-mono bg-background border-border/50 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500/50"
                                                                                                            />
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div className="flex items-center justify-between w-full pt-1 border-t border-border/50">
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <Switch 
                                                                                                                id={`regex-${gIdx}-${rIdx}`}
                                                                                                                checked={!!rule.isRegex} 
                                                                                                                onCheckedChange={(checked) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    let parsed = [];
                                                                                                                    try { parsed = JSON.parse(ng[gIdx].auto_inputs || '[]'); } catch(err) {}
                                                                                                                    if (!Array.isArray(parsed)) parsed = [];
                                                                                                                    if (parsed[rIdx]) parsed[rIdx].isRegex = checked;
                                                                                                                    ng[gIdx].auto_inputs = JSON.stringify(parsed, null, 2);
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                className="scale-75 origin-left"
                                                                                                            />
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground cursor-pointer" htmlFor={`regex-${gIdx}-${rIdx}`}>Regex Match</label>
                                                                                                        </div>
                                                                                                        <button
                                                                                                            onClick={() => {
                                                                                                                const ng = [...groups];
                                                                                                                let parsed = [];
                                                                                                                try { parsed = JSON.parse(ng[gIdx].auto_inputs || '[]'); } catch(err) {}
                                                                                                                if (!Array.isArray(parsed)) parsed = [];
                                                                                                                parsed.splice(rIdx, 1);
                                                                                                                ng[gIdx].auto_inputs = JSON.stringify(parsed, null, 2);
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            className="h-7 w-7 flex items-center justify-center text-red-500/60 hover:bg-red-500/10 hover:text-red-500 rounded-md transition-all"
                                                                                                            title="Remove rule"
                                                                                                        >
                                                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                                                        </button>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ));
                                                                                        })()}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="px-8 py-5 glass border-t border-border/50 flex justify-end gap-3 rounded-b-md">
                                                                                <Button
                                                                                    variant="outline"
                                                                                    onClick={() => setOpenTTYSettingsGroupIdx(null)}
                                                                                    className="h-9 text-xs font-bold uppercase tracking-widest px-8 rounded-md"
                                                                                >
                                                                                    Discard
                                                                                </Button>
                                                                                <Button
                                                                                    onClick={() => setOpenTTYSettingsGroupIdx(null)}
                                                                                    className="h-9 text-xs font-bold uppercase tracking-widest px-10 premium-gradient text-white rounded-md shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                                                                                >
                                                                                    Apply changes
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                )}
                                                                {/* Floating popup */}
                                                                {openSettingsGroupIdx === gIdx && (
                                                                    <>
                                                                        {/* Backdrop */}
                                                                        <div
                                                                            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                                                                            onClick={() => setOpenSettingsGroupIdx(null)}
                                                                        />
                                                                        {/* Popup card */}
                                                                        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-4xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto glass rounded-md shadow-2xl shadow-indigo-500/10 animate-in fade-in zoom-in-95 duration-200 border-none flex flex-col">
                                                                            {/* Header with Premium Gradient */}
                                                                            <div className="px-6 py-5 flex items-center justify-between text-white premium-gradient rounded-t-md shrink-0">
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="w-10 h-10 rounded-md bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                                                                                        <SlidersHorizontal className="w-5 h-5" />
                                                                                    </div>

                                                                                    <div className="flex flex-col px-2 pt-3">
                                                                                        <span className="text-base backdrop-blur-sm font-mono">{group.name}</span>
                                                                                        <span className="text-[10px] opacity-60 mt-1 font-mono">{group.key}</span>
                                                                                    </div>

                                                                                </div>

                                                                            </div>

                                                                            <div className="px-8 py-3 grid grid-cols-1 lg:grid-cols-2 gap-8 custom-scrollbar">
                                                                                {/* Left Column: Logic & Routing */}
                                                                                <div className="space-y-8">
                                                                                    <section className="space-y-4">
                                                                                        <div className="flex items-center gap-2 mb-2">
                                                                                            <div className="w-1 h-4 bg-amber-500 rounded-full" />
                                                                                            <h4 className="text-xs font-black uppercase tracking-widest text-foreground/70">Execution Logic</h4>
                                                                                        </div>

                                                                                        {/* Condition */}
                                                                                        <div className="space-y-3 p-5 bg-background border border-border/50 rounded-md shadow-sm">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <label className="text-[10px] font-bold text-amber-600 flex items-center gap-1.5 uppercase tracking-wider">
                                                                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                                                                    Active Condition
                                                                                                </label>
                                                                                                <span className="text-[10px] font-mono text-muted-foreground/50">Pongo2 Syntax</span>
                                                                                            </div>
                                                                                            <input
                                                                                                type="text"
                                                                                                value={group.condition || ''}
                                                                                                onChange={(e) => {
                                                                                                    const ng = [...groups];
                                                                                                    ng[gIdx].condition = e.target.value;
                                                                                                    setGroups(ng);
                                                                                                }}
                                                                                                placeholder="e.g. input.env == 'prod'"
                                                                                                className="w-full h-9 px-4 text-xs font-mono rounded-md border border-border bg-muted/30 text-amber-600 placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/40 outline-none transition-all"
                                                                                            />
                                                                                            <div className="p-3 bg-amber-500/5 rounded-md border border-amber-500/10">
                                                                                                <p className="text-[10px] text-amber-700/70 leading-relaxed">
                                                                                                    Skip this group unless the condition is met.
                                                                                                    <br />
                                                                                                    <span className="opacity-50 text-[10px]">Use: <code className="bg-white/50 px-1 rounded">input.key</code>, <code className="bg-white/50 px-1 rounded">variable.key</code>, <code className="bg-white/50 px-1 rounded">step.key.status</code>.</span>
                                                                                                </p>
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* For Each Loop */}
                                                                                        <div className="space-y-3 p-5 bg-background border border-border/50 rounded-md shadow-sm">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <label className="text-[10px] font-bold text-indigo-600 flex items-center gap-1.5 uppercase tracking-wider">
                                                                                                    <Repeat className="w-3.5 h-3.5" />
                                                                                                    Enable For Each Loop
                                                                                                </label>
                                                                                                <Switch
                                                                                                    checked={group.loop_enabled || false}
                                                                                                    onCheckedChange={(checked) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx].loop_enabled = checked;
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                            {group.loop_enabled && (
                                                                                                <div className="space-y-3 pt-3 border-t border-border/50">
                                                                                                    <div className="flex items-center justify-between">
                                                                                                        <label className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">
                                                                                                            Iteration Variable
                                                                                                        </label>
                                                                                                        <span className="text-[10px] font-mono text-muted-foreground/50">Array or {"{{variable}}"}</span>
                                                                                                    </div>
                                                                                                    <input
                                                                                                        type="text"
                                                                                                        value={group.for || ''}
                                                                                                        onChange={(e) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx].for = e.target.value;
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                        placeholder="e.g. {{input.items}}"
                                                                                                        className="w-full h-9 px-4 text-xs font-mono rounded-md border border-border bg-muted/30 text-indigo-600 placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 outline-none transition-all"
                                                                                                    />
                                                                                                    <div className="p-3 bg-indigo-500/5 rounded-md border border-indigo-500/10">
                                                                                                        <p className="text-[10px] text-indigo-700/70 leading-relaxed">
                                                                                                            Iterate the group steps over this array. Steps can use <code className="bg-white/50 px-1 rounded">{"{{item}}"}</code>.
                                                                                                        </p>
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>

                                                                                        {/* Server override */}
                                                                                        <div className="space-y-3 p-5 bg-background border border-border/50 rounded-md shadow-sm">
                                                                                            <label className="text-[10px] font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                                                                                                <Server className="w-3.5 h-3.5" />
                                                                                                Server Override
                                                                                            </label>
                                                                                            <SearchableSelect
                                                                                                options={[
                                                                                                    { label: '— Use workflow default —', value: '' },
                                                                                                    ...(group.default_server && !availableServers.some(s => s.id === group.default_server_id)
                                                                                                        ? [{ label: `${group.default_server.name} (${group.default_server.host || group.default_server.id})`, value: group.default_server_id as string }]
                                                                                                        : []),
                                                                                                    ...availableServers.map(s => ({ label: `${s.name} (${s.host})`, value: s.id }))
                                                                                                ]}
                                                                                                value={group.default_server_id || ''}
                                                                                                onValueChange={(val) => {
                                                                                                    const ng = [...groups];
                                                                                                    ng[gIdx].default_server_id = val || undefined;
                                                                                                    setGroups(ng);
                                                                                                }}
                                                                                                onSearch={handleSearchServers}
                                                                                                placeholder="— Use workflow default —"
                                                                                                isSearchable={true}
                                                                                                triggerClassName="h-9 text-xs rounded-md border-border/50"
                                                                                            />
                                                                                        </div>
                                                                                    </section>
                                                                                </div>

                                                                                {/* Right Column: Policies & Toggles */}
                                                                                <div className="space-y-6">
                                                                                    <div className="flex items-center gap-2 mb-2">
                                                                                        <div className="w-1 h-4 bg-primary rounded-full" />
                                                                                        <h4 className="text-xs font-black uppercase tracking-widest text-foreground/70">Safety & Compliance</h4>
                                                                                    </div>

                                                        <div className="grid grid-cols-1 gap-4">
                                                                                            {/* Toggles Grid */}
                                                                                            <div className="p-5 bg-background border border-border/50 rounded-md shadow-sm space-y-5">
                                                                                                {/* Skip Group */}
                                                                                                <div className="flex items-center justify-between pb-5 border-b border-border/50">
                                                                                                    <div className="flex items-center gap-3">
                                                                                                        <div className="w-8 h-8 rounded-md bg-red-500/10 flex items-center justify-center">
                                                                                                            <XCircle className="w-4 h-4 text-red-500" />
                                                                                                        </div>
                                                                                                        <div className="flex flex-col">
                                                                                                            <span className="text-xs font-bold text-foreground/80 leading-none">Skip Group</span>
                                                                                                            <span className="text-[10px] text-muted-foreground mt-1">Completely ignore this group during execution</span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <Switch
                                                                                                        checked={!!group.skip}
                                                                                                        onCheckedChange={(checked) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx].skip = checked;
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                    />
                                                                                                </div>

                                                                                                {/* MCP Log Reporting */}
                                                                                            <div className="flex items-center justify-between">
                                                                                                <div className="flex items-center gap-3">
                                                                                                    <div className="w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                                                                                                        <FileText className="w-4 h-4 text-blue-500" />
                                                                                                    </div>
                                                                                                    <div className="flex flex-col">
                                                                                                        <span className="text-xs font-bold text-foreground/80 leading-none">MCP Detailed Logs</span>
                                                                                                        <span className="text-[10px] text-muted-foreground mt-1">Include raw step logs in reports</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <Switch
                                                                                                    checked={!!group.mcp_report_log}
                                                                                                    onCheckedChange={(checked) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx].mcp_report_log = checked;
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                />
                                                                                            </div>

                                                                                            {/* Continue on Failure */}
                                                                                            <div className="flex items-center justify-between">
                                                                                                <div className="flex items-center gap-3">
                                                                                                    <div className="w-8 h-8 rounded-md bg-amber-500/10 flex items-center justify-center">
                                                                                                        <AlertCircle className="w-4 h-4 text-amber-500" />
                                                                                                    </div>
                                                                                                    <div className="flex flex-col">
                                                                                                        <span className="text-xs font-bold text-foreground/80 leading-none">Fault Tolerance</span>
                                                                                                        <span className="text-[10px] text-muted-foreground mt-1 text-left">Continue workflow even if group fails</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <Switch
                                                                                                    checked={group.continue_on_failure}
                                                                                                    onCheckedChange={(checked) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx].continue_on_failure = checked;
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                />
                                                                                            </div>

                                                                                            {/* Retry Policy */}
                                                                                            <div className="pt-5 border-t border-border/50 space-y-4">
                                                                                                <div className="flex items-center justify-between">
                                                                                                    <div className="flex items-center gap-3">
                                                                                                        <div className="w-8 h-8 rounded-md bg-indigo-500/10 flex items-center justify-center">
                                                                                                            <RefreshCw className="w-4 h-4 text-indigo-500" />
                                                                                                        </div>
                                                                                                        <div className="flex flex-col">
                                                                                                            <span className="text-xs font-bold text-foreground/80 leading-none">Auto-Retry Strategy</span>
                                                                                                            <span className="text-[10px] text-muted-foreground mt-1">Re-run entire group on error</span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <Switch
                                                                                                        checked={group.retry_enabled || false}
                                                                                                        onCheckedChange={(checked) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx].retry_enabled = checked;
                                                                                                            if (checked) {
                                                                                                                if (!ng[gIdx].retry_limit) ng[gIdx].retry_limit = 3;
                                                                                                                if (!ng[gIdx].retry_delay) ng[gIdx].retry_delay = 5;
                                                                                                            }
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                    />
                                                                                                </div>

                                                                                                {group.retry_enabled && (
                                                                                                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200 bg-muted/30 p-4 rounded-md border border-indigo-500/10 mt-2">
                                                                                                        <div className="space-y-2 text-left">
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Max Attempts</label>
                                                                                                            <Input
                                                                                                                type="number"
                                                                                                                value={group.retry_limit || 0}
                                                                                                                onChange={(e) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    ng[gIdx].retry_limit = parseInt(e.target.value) || 0;
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                className="h-9 text-xs font-mono bg-background"
                                                                                                                min={1} max={10}
                                                                                                            />
                                                                                                        </div>
                                                                                                        <div className="space-y-2 text-left">
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Delay (seconds)</label>
                                                                                                            <Input
                                                                                                                type="number"
                                                                                                                value={group.retry_delay || 0}
                                                                                                                onChange={(e) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    ng[gIdx].retry_delay = parseInt(e.target.value) || 0;
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                className="h-9 text-xs font-mono bg-background"
                                                                                                                min={0}
                                                                                                            />
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Relay Strategy (Separate Section) */}
                                                                                        <div className="p-5 bg-background border border-border/50 rounded-md shadow-sm space-y-4">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <div className="flex items-center gap-3">
                                                                                                    <div className="w-8 h-8 rounded-md bg-emerald-500/10 flex items-center justify-center">
                                                                                                        <File className="w-4 h-4 text-emerald-500" />
                                                                                                    </div>
                                                                                                    <div className="flex flex-col text-left">
                                                                                                        <span className="text-xs font-bold text-foreground/80 leading-none">Relay (SOP Deployment)</span>
                                                                                                        <span className="text-[10px] text-muted-foreground mt-1">Copy files after group success</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <Switch
                                                                                                    checked={group.is_copy_enabled}
                                                                                                    onCheckedChange={(checked) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx].is_copy_enabled = checked;
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                />
                                                                                            </div>

                                                                                            {group.is_copy_enabled && (
                                                                                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 pt-4 border-t border-border/50">
                                                                                                    <div className="space-y-2 text-left">
                                                                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Source Artifact Path</label>
                                                                                                        <Input
                                                                                                            value={group.copy_source_path || ''}
                                                                                                            onChange={(e) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx].copy_source_path = e.target.value;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            placeholder="/var/www/html/dist"
                                                                                                            className="h-9 text-xs font-mono bg-background"
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="grid grid-cols-2 gap-4">
                                                                                                        <div className="space-y-2 text-left">
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Destination Server</label>
                                                                                                            <SearchableSelect
                                                                                                                options={[
                                                                                                                    ...(group.copy_target_server && !availableServers.some(s => s.id === group.copy_target_server_id)
                                                                                                                        ? [{ label: group.copy_target_server.name, value: group.copy_target_server_id as string }]
                                                                                                                        : []),
                                                                                                                    ...availableServers.map(s => ({ label: s.name, value: s.id }))
                                                                                                                ]}
                                                                                                                value={group.copy_target_server_id || ''}
                                                                                                                onValueChange={(val) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    ng[gIdx].copy_target_server_id = val;
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                onSearch={handleSearchServers}
                                                                                                                placeholder="Server"
                                                                                                                triggerClassName="h-9 text-xs bg-background"
                                                                                                            />
                                                                                                        </div>
                                                                                                        <div className="space-y-2 text-left">
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">Destination Path</label>
                                                                                                            <Input
                                                                                                                value={group.copy_target_path || ''}
                                                                                                                onChange={(e) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    ng[gIdx].copy_target_path = e.target.value;
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                placeholder="/opt/app/deploy"
                                                                                                                className="h-9 text-xs font-mono bg-background"
                                                                                                            />
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            {/* Footer Action */}
                                                                            <div className="px-8 py-5 glass border-t border-border/50 flex justify-end gap-3 rounded-b-md">
                                                                                <Button
                                                                                    variant="outline"
                                                                                    onClick={() => setOpenSettingsGroupIdx(null)}
                                                                                    className="h-9 text-xs font-bold uppercase tracking-widest px-8 rounded-md"
                                                                                >
                                                                                    Discard
                                                                                </Button>
                                                                                <Button
                                                                                    onClick={() => setOpenSettingsGroupIdx(null)}
                                                                                    className="h-9 text-xs font-bold uppercase tracking-widest px-10 premium-gradient text-white rounded-md shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                                                                                >
                                                                                    Apply changes
                                                                                </Button>
                                                                            </div>
                                                                        </div>

                                                                    </>
                                                                )}
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                onClick={() => {
                                                                    const ng = groups.filter((_, i) => i !== gIdx);
                                                                    setGroups(ng);
                                                                }}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <Droppable droppableId={group.id || `temp_group_${gIdx}`} type="STEP">
                                                        {(provided) => (
                                                            <div
                                                                className="p-4 md:p-6 space-y-3"
                                                                {...provided.droppableProps}
                                                                ref={provided.innerRef}
                                                            >
                                                                {group.steps?.map((step, sIdx) => (
                                                                    <Draggable key={step.id || `temp_step_${gIdx}_${sIdx}`} draggableId={step.id?.toString() || `temp_step_${gIdx}_${sIdx}`} index={sIdx}>
                                                                        {(provided, snapshot) => (
                                                                            <div
                                                                                ref={provided.innerRef}
                                                                                {...provided.draggableProps}
                                                                                className={cn(
                                                                                    "flex items-center gap-4 p-4 rounded-md border transition-all group/step",
                                                                                    snapshot.isDragging ? "bg-card border-primary/40 shadow-lg" : "bg-background/50 border-border/50 hover:bg-background"
                                                                                )}
                                                                            >
                                                                                <div
                                                                                    {...provided.dragHandleProps}
                                                                                    className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-foreground transition-colors p-1 -ml-2"
                                                                                >
                                                                                    <GripVertical className="w-4 h-4" />
                                                                                </div>
                                                                                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground font-bold text-[10px] shrink-0 border border-border">
                                                                                    {sIdx + 1}
                                                                                </div>
                                                                                <div className="flex-1 grid grid-cols-12 gap-3">
                                                                                    <div className="col-span-3 space-y-1">
                                                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Action Label</label>
                                                                                        <Input
                                                                                            value={step.name}
                                                                                            onChange={(e) => {
                                                                                                const ng = [...groups];
                                                                                                ng[gIdx]!.steps![sIdx].name = e.target.value;
                                                                                                setGroups(ng);
                                                                                            }}
                                                                                            className="bg-muted/50 border-border h-8 text-xs font-medium rounded-md px-2"
                                                                                        />
                                                                                        <div className="space-y-0.5 mt-1">
                                                                                            <div className="flex items-center gap-1">
                                                                                                <span className="text-[9px] font-mono text-muted-foreground/50">Output Key:</span>
                                                                                                <Input
                                                                                                    value={step.action_key || ''}
                                                                                                    onChange={(e) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx]!.steps![sIdx].action_key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                    className="h-5 text-[9px] px-1 font-mono bg-muted/30 border-border/50 hover:border-primary/30 focus:bg-background focus:border-primary/50 rounded"
                                                                                                    placeholder="e.g. result"
                                                                                                />
                                                                                            </div>
                                                                                            {step.action_key && group.key && (
                                                                                                <p className="text-[8px] font-mono text-cyan-500/70 pl-0.5">
                                                                                                    Use: <code className="bg-cyan-500/10 px-1 rounded">{`{{ flow.${group.key}.step.${step.action_key} }}`}</code>
                                                                                                </p>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="col-span-2 space-y-1">
                                                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</label>
                                                                                        <select
                                                                                            value={step.action_type || 'COMMAND'}
                                                                                            onChange={(e) => {
                                                                                                const ng = [...groups];
                                                                                                const newType = e.target.value as 'COMMAND' | 'WORKFLOW' | 'HTTP' | 'DATASET' | 'CONVERT';
                                                                                                ng[gIdx]!.steps![sIdx].action_type = newType;
                                                                                                if (newType === 'COMMAND') {
                                                                                                    ng[gIdx]!.steps![sIdx].target_workflow_id = undefined;
                                                                                                    ng[gIdx]!.steps![sIdx].target_workflow_inputs = undefined;
                                                                                                }
                                                                                                if (newType === 'HTTP' && !ng[gIdx]!.steps![sIdx].http_method) {
                                                                                                    ng[gIdx]!.steps![sIdx].http_method = 'GET';
                                                                                                }
                                                                                                if (newType === 'DATASET' && !ng[gIdx]!.steps![sIdx].dataset_operation) {
                                                                                                    ng[gIdx]!.steps![sIdx].dataset_operation = 'QUERY';
                                                                                                }
                                                                                                if (newType === 'CONVERT') {
                                                                                                    ng[gIdx]!.steps![sIdx].output_format = 'json';
                                                                                                }
                                                                                                setGroups(ng);
                                                                                            }}
                                                                                            className="h-8 px-2 w-full text-xs font-semibold border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
                                                                                        >
                                                                                            <option value="COMMAND">Command</option>
                                                                                            <option value="WORKFLOW">Workflow</option>
                                                                                            <option value="HTTP">HTTP Request</option>
                                                                                            <option value="DATASET">Dataset</option>
                                                                                            <option value="CONVERT">Convert → JSON</option>
                                                                                        </select>
                                                                                    </div>
                                                                                    <div className="col-span-7 space-y-3">
                                                                                        {(!step.action_type || step.action_type === 'COMMAND') ? (
                                                                                            <div className="space-y-1">
                                                                                                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Execution Sequence</label>
                                                                                                <Textarea
                                                                                                    value={step.command_text}
                                                                                                    onChange={(e) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx]!.steps![sIdx].command_text = e.target.value;
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                    className="bg-muted/50 border-border min-h-[40px] text-xs font-mono rounded-md px-2 py-2 resize-y"
                                                                                                    placeholder="Enter command sequence..."
                                                                                                />
                                                                                            </div>
                                                                                        ) : step.action_type === 'HTTP' ? (
                                                                                            <div className="space-y-3 bg-muted/20 border border-border/50 rounded-md p-3">
                                                                                                <div className="flex items-center justify-between">
                                                                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">HTTP Configuration</label>
                                                                                                    <Button
                                                                                                        variant="outline"
                                                                                                        size="sm"
                                                                                                        className="h-6 text-[10px] px-2 py-0 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                                                                                                        onClick={() => setPasteModal({ open: true, gIdx, sIdx, text: '' })}
                                                                                                    >
                                                                                                        Paste cURL
                                                                                                    </Button>
                                                                                                </div>
                                                                                                <div className="flex gap-2">
                                                                                                    <select
                                                                                                        value={step.http_method || 'GET'}
                                                                                                        onChange={(e) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx]!.steps![sIdx].http_method = e.target.value;
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                        className="h-8 px-2 w-24 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer"
                                                                                                    >
                                                                                                        <option>GET</option>
                                                                                                        <option>POST</option>
                                                                                                        <option>PUT</option>
                                                                                                        <option>PATCH</option>
                                                                                                        <option>DELETE</option>
                                                                                                    </select>
                                                                                                    <Input
                                                                                                        value={step.http_url || ''}
                                                                                                        onChange={(e) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx]!.steps![sIdx].http_url = e.target.value;
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                        placeholder="https://api.example.com/..."
                                                                                                        className="h-8 text-xs font-mono bg-background border-border flex-1"
                                                                                                    />
                                                                                                </div>
                                                                                                  <div className="space-y-3">
                                                                        <div className="space-y-1">
                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Headers (JSON)</label>
                                                                            <Textarea
                                                                                value={step.http_headers || ''}
                                                                                onChange={(e) => {
                                                                                    const ng = [...groups];
                                                                                    ng[gIdx]!.steps![sIdx].http_headers = e.target.value;
                                                                                    setGroups(ng);
                                                                                }}
                                                                                placeholder='{"Authorization": "Bearer token"}'
                                                                                className="text-[10px] font-mono min-h-[60px] bg-background border-border"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Body</label>
                                                                            <Textarea
                                                                                value={step.http_body || ''}
                                                                                onChange={(e) => {
                                                                                    const ng = [...groups];
                                                                                    ng[gIdx]!.steps![sIdx].http_body = e.target.value;
                                                                                    setGroups(ng);
                                                                                }}
                                                                                placeholder='{"key": "value"}'
                                                                                className="text-[10px] font-mono min-h-[60px] bg-background border-border"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                                                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Format:</span>
                                                                                                        <select
                                                                                                            value={step.output_format || 'json'}
                                                                                                            onChange={(e) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx]!.steps![sIdx].output_format = e.target.value as 'json' | 'string';
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            className="h-6 px-1 text-[10px] font-mono border border-border rounded bg-background text-foreground outline-none cursor-pointer"
                                                                                                        >
                                                                                                            <option value="json">JSON</option>
                                                                                                            <option value="string">String</option>
                                                                                                        </select>
                                                                                                    </div>
                                                                                                    <Button
                                                                                                        size="sm"
                                                                                                        className="h-7 text-[10px] px-4 font-bold bg-emerald-500 text-white hover:bg-emerald-600"
                                                                                                        onClick={async () => {
                                                                                                            const group = groups[gIdx];
                                                                                                            try {
                                                                                                                let h = {};
                                                                                                                if (step.http_headers) { try { h = JSON.parse(step.http_headers); } catch (e) { } }
                                                                                                                const res = await apiFetch(`${API_BASE_URL}/workflows/${id}/test-http`, {
                                                                                                                    method: 'POST',
                                                                                                                    body: JSON.stringify({
                                                                                                                        http_url: step.http_url,
                                                                                                                        http_method: step.http_method,
                                                                                                                        http_headers: h,
                                                                                                                        http_body: step.http_body,
                                                                                                                        server_id: step.server_id,
                                                                                                                        group_id: group.id
                                                                                                                    })
                                                                                                                });
                                                                                                                const data = await res.json();
                                                                                                                if (!res.ok) throw new Error(data.error || 'Test failed');
                                                                                                                setTestResult({ open: true, title: 'Test cURL Result', message: "Status: " + res.status + "\n\nResponse:\n" + data.output, variant: 'success' });
                                                                                                            } catch (err: any) { setTestResult({ open: true, title: 'Test Failed', message: err.message, variant: 'danger' }); }
                                                                                                        }}
                                                                                                    >
                                                                                                        Test HTTP
                                                                                                    </Button>
                                                                                                </div>
                                                                                            </div>
                                                                                        ) : step.action_type === 'DATASET' ? (
                                                                                            <div className="space-y-3 bg-muted/20 border border-border/50 rounded-md p-3">
                                                                                                <label className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Dataset Operation</label>
                                                                                                <div className="flex gap-2">
                                                                                                    <select
                                                                                                        value={step.dataset_operation || 'QUERY'}
                                                                                                        onChange={(e) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx]!.steps![sIdx].dataset_operation = e.target.value as 'QUERY' | 'FIND_ONE' | 'INSERT' | 'UPDATE' | 'DELETE';
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                        className="h-8 px-2 w-32 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer"
                                                                                                    >
                                                                                                        <option value="QUERY">FIND MANY</option>
                                                                                                        <option value="FIND_ONE">FIND ONE</option>
                                                                                                        <option value="INSERT">INSERT</option>
                                                                                                        <option value="UPDATE">UPDATE</option>
                                                                                                        <option value="DELETE">DELETE</option>
                                                                                                    </select>
                                                                                                    <div className="flex-1">
                                                                                                        <SearchableSelect
                                                                                                            options={datasets.map(d => ({ label: `${d.name} (${d.key})`, value: d.id, searchTerms: `${d.name} ${d.key}` }))}
                                                                                                            value={step.dataset_id || ''}
                                                                                                            onValueChange={(val) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx]!.steps![sIdx].dataset_id = val || undefined;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            isSearchable
                                                                                                            placeholder="— Select dataset —"
                                                                                                            searchPlaceholder="Search datasets..."
                                                                                                            triggerClassName="h-8 px-2 w-full text-xs font-semibold border-border rounded-md bg-background text-foreground"
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>

                                                                                                {(step.dataset_operation === 'QUERY' || step.dataset_operation === 'FIND_ONE' || step.dataset_operation === 'UPDATE' || step.dataset_operation === 'DELETE' || !step.dataset_operation) && (() => {
                                                                                                    const dsCols = parseDsColumns(datasets.find(d => d.id === step.dataset_id)?.columns);
                                                                                                    return (
                                                                                                        <div className="space-y-1.5">
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                                                                                Filter {(step.dataset_operation === 'UPDATE' || step.dataset_operation === 'DELETE') && <span className="text-amber-500">(required)</span>}
                                                                                                            </label>
                                                                                                            <FilterBuilder
                                                                                                                value={step.dataset_filter || ''}
                                                                                                                onChange={(v) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    ng[gIdx]!.steps![sIdx].dataset_filter = v;
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                columns={[...dsCols.map(col => col.name), '_id']}
                                                                                                            />
                                                                                                            <p className="text-[9px] text-muted-foreground/50 font-mono">~ = contains · AND/OR + groups · value supports {"{{ input.x }}"} / {"{{ flow.. }}"}</p>
                                                                                                        </div>
                                                                                                    );
                                                                                                })()}

                                                                                                {(step.dataset_operation === 'INSERT' || step.dataset_operation === 'UPDATE') && (() => {
                                                                                                    const stepKey = step.id || `${gIdx}-${sIdx}`;
                                                                                                    const parsed = parsePayloadRows(step.dataset_payload);
                                                                                                    const isRaw = rawPayload[stepKey] || parsed === null; // arrays / invalid JSON force raw
                                                                                                    // Prefer the draft in structured mode so in-progress empty-key rows persist.
                                                                                                    const rows = isRaw ? parsed : (payloadDraft[stepKey] ?? parsed ?? []);
                                                                                                    const dsCols = parseDsColumns(datasets.find(d => d.id === step.dataset_id)?.columns);
                                                                                                    const writeRows = (next: PayloadRow[]) => {
                                                                                                        setPayloadDraft(prev => ({ ...prev, [stepKey]: next }));
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx]!.steps![sIdx].dataset_payload = serializePayloadRows(next);
                                                                                                        setGroups(ng);
                                                                                                    };
                                                                                                    return (
                                                                                                        <div className="space-y-1.5">
                                                                                                            <div className="flex items-center justify-between">
                                                                                                                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                                                                                    Payload {step.dataset_operation === 'UPDATE' && <span className="opacity-50">(merged)</span>}
                                                                                                                </label>
                                                                                                                <div className="flex items-center gap-1">
                                                                                                                    {!isRaw && (
                                                                                                                        <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md"
                                                                                                                            onClick={() => writeRows([...(rows || []), { key: dsCols.find(c => !(rows || []).some(r => r.key === c.name))?.name || '', type: 'string', value: '' }])}>
                                                                                                                            <Plus className="w-3 h-3" /> Field
                                                                                                                        </Button>
                                                                                                                    )}
                                                                                                                    <Button type="button" variant={isRaw ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md"
                                                                                                                        disabled={rows === null}
                                                                                                                        onClick={() => {
                                                                                                                            setRawPayload({ ...rawPayload, [stepKey]: !rawPayload[stepKey] });
                                                                                                                            // Drop draft so structured mode re-parses the (possibly hand-edited) raw JSON.
                                                                                                                            setPayloadDraft(prev => { const n = { ...prev }; delete n[stepKey]; return n; });
                                                                                                                        }}
                                                                                                                        title={rows === null ? 'Array / invalid JSON — raw only' : 'Toggle raw JSON'}>
                                                                                                                        <Braces className="w-3 h-3" /> JSON
                                                                                                                    </Button>
                                                                                                                </div>
                                                                                                            </div>
                                                                                                            {isRaw ? (
                                                                                                                <Textarea
                                                                                                                    value={step.dataset_payload || ''}
                                                                                                                    onChange={(e) => {
                                                                                                                        const ng = [...groups];
                                                                                                                        ng[gIdx]!.steps![sIdx].dataset_payload = e.target.value;
                                                                                                                        setGroups(ng);
                                                                                                                    }}
                                                                                                                    placeholder={step.dataset_operation === 'INSERT' ? '{"email":"{{ input.email }}"} or [ {...}, {...} ]' : '{"active": false}'}
                                                                                                                    className="text-[10px] font-mono min-h-[60px] bg-background border-border"
                                                                                                                />
                                                                                                            ) : (rows && rows.length === 0) ? (
                                                                                                                <p className="text-[9px] text-muted-foreground/50 italic">No fields. Click "Field" to add.</p>
                                                                                                            ) : (
                                                                                                                <div className="space-y-1.5">
                                                                                                                    {(rows || []).map((r, ri) => (
                                                                                                                        <div key={ri} className="flex items-center gap-1.5">
                                                                                                                            <div className="w-28">
                                                                                                                                <FieldCombo
                                                                                                                                    value={r.key}
                                                                                                                                    onChange={(v) => {
                                                                                                                                        const col = dsCols.find(c => c.name === v);
                                                                                                                                        writeRows((rows || []).map((x, i) => i === ri ? { ...x, key: v, type: col?.type || x.type } : x));
                                                                                                                                    }}
                                                                                                                                    options={dsCols.map(col => col.name)}
                                                                                                                                    placeholder="key"
                                                                                                                                    className="h-7 px-2 text-[11px] font-mono"
                                                                                                                                />
                                                                                                                            </div>
                                                                                                                            <select value={r.type}
                                                                                                                                onChange={(e) => writeRows((rows || []).map((x, i) => i === ri ? { ...x, type: e.target.value } : x))}
                                                                                                                                className="h-7 px-1 w-16 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer">
                                                                                                                                {(step.dataset_operation === 'UPDATE' ? [...PAYLOAD_TYPES, 'inc'] : PAYLOAD_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                                                                                                                            </select>
                                                                                                                            {r.type === 'bool' ? (
                                                                                                                                <select value={r.value === 'true' ? 'true' : 'false'}
                                                                                                                                    onChange={(e) => writeRows((rows || []).map((x, i) => i === ri ? { ...x, value: e.target.value } : x))}
                                                                                                                                    className="h-7 px-2 flex-1 text-[11px] border border-border rounded-md bg-background text-foreground outline-none cursor-pointer">
                                                                                                                                    <option value="true">true</option>
                                                                                                                                    <option value="false">false</option>
                                                                                                                                </select>
                                                                                                                            ) : (
                                                                                                                                <Input value={r.value} placeholder={r.type === 'inc' ? 'delta e.g. 1 or -1' : r.type === 'json' ? '{"k":"v"}' : '{{ input.x }} / value'}
                                                                                                                                    onChange={(e) => writeRows((rows || []).map((x, i) => i === ri ? { ...x, value: e.target.value } : x))}
                                                                                                                                    className="h-7 flex-1 text-[11px] font-mono bg-background border-border" />
                                                                                                                            )}
                                                                                                                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/10 hover:text-destructive"
                                                                                                                                onClick={() => writeRows((rows || []).filter((_, i) => i !== ri))}>
                                                                                                                                <X className="w-3.5 h-3.5" />
                                                                                                                            </Button>
                                                                                                                        </div>
                                                                                                                    ))}
                                                                                                                </div>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    );
                                                                                                })()}

                                                                                                {(step.dataset_operation === 'QUERY' || !step.dataset_operation) && (
                                                                                                    <div className="space-y-1">
                                                                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Limit (0 = default 10k)</label>
                                                                                                        <Input
                                                                                                            type="number"
                                                                                                            value={step.dataset_limit ?? 0}
                                                                                                            onChange={(e) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx]!.steps![sIdx].dataset_limit = parseInt(e.target.value) || 0;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            className="h-8 w-32 text-xs font-mono bg-background border-border"
                                                                                                        />
                                                                                                    </div>
                                                                                                )}

                                                                                                <p className="text-[9px] text-cyan-500/70 font-medium pt-1 border-t border-border/50">
                                                                                                    Result is captured to <code className="bg-cyan-500/10 px-1 rounded">{`{{ flow.${group.key || 'group'}.step.${step.action_key || 'key'} }}`}</code> (set Action Key + Format=JSON).
                                                                                                </p>
                                                                                            </div>
                                                                                        ) : step.action_type === 'CONVERT' ? (
                                                                                            <div className="space-y-3 bg-muted/20 border border-border/50 rounded-md p-3">
                                                                                                <label className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Source text</label>
                                                                                                <Textarea
                                                                                                    value={step.convert_source || ''}
                                                                                                    onChange={(e) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx]!.steps![sIdx].convert_source = e.target.value;
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                    placeholder={'{{ flow.grp.step.raw }}  or  {{ input.payload }}'}
                                                                                                    className="text-[10px] font-mono min-h-[80px] bg-background border-border"
                                                                                                />
                                                                                                {(() => {
                                                                                                    let fields: any[] = [];
                                                                                                    try { const p = JSON.parse(step.convert_fields || '[]'); if (Array.isArray(p)) fields = p; } catch { fields = []; }
                                                                                                    const writeFields = (next: any[]) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx]!.steps![sIdx].convert_fields = JSON.stringify(next);
                                                                                                        setGroups(ng);
                                                                                                    };
                                                                                                    return (
                                                                                                        <div className="space-y-2">
                                                                                                            <div className="flex items-center justify-between">
                                                                                                                <label className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Fields (grep)</label>
                                                                                                                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md"
                                                                                                                    onClick={() => writeFields([...fields, { name: '', start: '', end_mode: 'eof', end: '', format: 'string', default: '' }])}>
                                                                                                                    <Plus className="w-3 h-3" /> Field
                                                                                                                </Button>
                                                                                                            </div>
                                                                                                            {fields.length === 0 ? (
                                                                                                                <p className="text-[9px] text-muted-foreground/50 italic">No fields → whole source parsed as JSON (legacy). Add a field to grep values out.</p>
                                                                                                            ) : (
                                                                                                                <div className="space-y-2">
                                                                                                                    {fields.map((f, fi) => (
                                                                                                                        <div key={fi} className="space-y-1.5 bg-background/60 border border-border/50 rounded-md p-2.5">
                                                                                                                            {/* Row 1: field name + remove */}
                                                                                                                            <div className="flex items-center gap-1.5">
                                                                                                                                <Input value={f.name || ''} placeholder="output field name"
                                                                                                                                    onChange={(e) => writeFields(fields.map((x, i) => i === fi ? { ...x, name: e.target.value } : x))}
                                                                                                                                    className="h-8 flex-1 text-[11px] font-mono bg-background border-border" />
                                                                                                                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-md hover:bg-destructive/10 hover:text-destructive"
                                                                                                                                    onClick={() => writeFields(fields.filter((_, i) => i !== fi))}>
                                                                                                                                    <X className="w-3.5 h-3.5" />
                                                                                                                                </Button>
                                                                                                                            </div>
                                                                                                                            {/* Row 2: format + default under one label */}
                                                                                                                            <div className="space-y-1">
                                                                                                                                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">Format – Default value</label>
                                                                                                                                <div className="flex items-center gap-1.5">
                                                                                                                                    <select value={f.format || 'string'}
                                                                                                                                        onChange={(e) => writeFields(fields.map((x, i) => i === fi ? { ...x, format: e.target.value } : x))}
                                                                                                                                        className="h-8 px-2 w-24 shrink-0 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer">
                                                                                                                                        <option value="string">string</option>
                                                                                                                                        <option value="number">number</option>
                                                                                                                                    </select>
                                                                                                                                    <Input value={f.default || ''} placeholder="default value"
                                                                                                                                        onChange={(e) => writeFields(fields.map((x, i) => i === fi ? { ...x, default: e.target.value } : x))}
                                                                                                                                        className="h-8 flex-1 text-[11px] font-mono bg-background border-border" />
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                            {/* Row 3: grep rule — start + end under one label */}
                                                                                                                            <div className="space-y-1">
                                                                                                                                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">Start – End</label>
                                                                                                                                <div className="flex items-center gap-1.5">
                                                                                                                                    <Input value={f.start || ''} placeholder="start (empty = from beginning)"
                                                                                                                                        onChange={(e) => writeFields(fields.map((x, i) => i === fi ? { ...x, start: e.target.value } : x))}
                                                                                                                                        className="h-8 flex-1 text-[11px] font-mono bg-background border-border" />
                                                                                                                                    <select value={f.end_mode || 'eof'}
                                                                                                                                        onChange={(e) => writeFields(fields.map((x, i) => i === fi ? { ...x, end_mode: e.target.value } : x))}
                                                                                                                                        className="h-8 px-2 w-28 shrink-0 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer">
                                                                                                                                        <option value="delimiter">until char</option>
                                                                                                                                        <option value="eol">end of line</option>
                                                                                                                                        <option value="eof">to end</option>
                                                                                                                                    </select>
                                                                                                                                    {f.end_mode === 'delimiter' && (
                                                                                                                                        <Input value={f.end || ''} placeholder="end char"
                                                                                                                                            onChange={(e) => writeFields(fields.map((x, i) => i === fi ? { ...x, end: e.target.value } : x))}
                                                                                                                                            className="h-8 w-24 shrink-0 text-[11px] font-mono bg-background border-border" />
                                                                                                                                    )}
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        </div>
                                                                                                                    ))}
                                                                                                                </div>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    );
                                                                                                })()}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="space-y-2">
                                                                                                <div className="space-y-1">
                                                                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Target Workflow</label>
                                                                                                    <SearchableSelect
                                                                                                        options={allWorkflows.filter(w => w.id !== id).map(w => ({
                                                                                                            label: w.name,
                                                                                                            value: w.id
                                                                                                        }))}
                                                                                                        value={step.target_workflow_id || ''}
                                                                                                        onValueChange={(val) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx]!.steps![sIdx].target_workflow_id = val || undefined;
                                                                                                            ng[gIdx]!.steps![sIdx].target_workflow_inputs = undefined;
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                        isSearchable
                                                                                                        onSearch={handleSearchWorkflows}
                                                                                                        placeholder="— Select workflow —"
                                                                                                        searchPlaceholder="Search workflows..."
                                                                                                        triggerClassName="h-8 px-2 w-full text-xs font-semibold border-indigo-500/30 rounded-md bg-background text-foreground"
                                                                                                    />
                                                                                                </div>
                                                                                                {/* Dynamic inputs for selected target workflow */}
                                                                                                {(() => {
                                                                                                    const targetWf = allWorkflows.find(w => w.id === step.target_workflow_id);
                                                                                                    if (!targetWf?.inputs?.length) return null;
                                                                                                    const parsedInputs: Record<string, string> = (() => {
                                                                                                        try { return JSON.parse(step.target_workflow_inputs || '{}'); } catch { return {}; }
                                                                                                    })();
                                                                                                    return (
                                                                                                        <div className="space-y-3 bg-indigo-500/5 border border-indigo-500/20 rounded-md p-3">
                                                                                                            <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Workflow Inputs</label>
                                                                                                            {targetWf.inputs.map(inp => {
                                                                                                                const val = parsedInputs[inp.key] || '';
                                                                                                                const isVariable = val.startsWith('{{') && val.endsWith('}}');

                                                                                                                const updateInput = (newVal: string) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    const updated = { ...parsedInputs, [inp.key]: newVal };
                                                                                                                    ng[gIdx]!.steps![sIdx].target_workflow_inputs = JSON.stringify(updated);
                                                                                                                    setGroups(ng);
                                                                                                                };

                                                                                                                const isForeach = (() => { try { const p = JSON.parse(val); return p?._type === 'foreach'; } catch { return false; } })();
                                                                                                                const foreachVal = isForeach ? JSON.parse(val) : { _type: 'foreach', source: '', template: inp.type === 'multi-input' ? {} : '' };

                                                                                                                return (
                                                                                                                    <div key={inp.key} className="space-y-1">
                                                                                                                        <div className="flex items-center justify-between">
                                                                                                                            <span className="text-[10px] font-mono text-muted-foreground truncate" title={inp.label || inp.key}>{inp.label || inp.key}</span>
                                                                                                                            {(inp.type === 'multi-select' || inp.type === 'multi-input') && (
                                                                                                                                <button
                                                                                                                                    onClick={() => {
                                                                                                                                        if (isForeach) {
                                                                                                                                            updateInput('[]');
                                                                                                                                        } else {
                                                                                                                                            updateInput(JSON.stringify({ _type: 'foreach', source: '', template: inp.type === 'multi-input' ? {} : '' }));
                                                                                                                                        }
                                                                                                                                    }}
                                                                                                                                    className={cn(
                                                                                                                                        "text-[10px] font-black uppercase tracking-widest transition-colors",
                                                                                                                                        isForeach ? "text-amber-500" : "text-indigo-500/50 hover:text-indigo-500"
                                                                                                                                    )}
                                                                                                                                >
                                                                                                                                    {isForeach ? 'Exit Variable' : 'Use Variable'}
                                                                                                                                </button>
                                                                                                                            )}
                                                                                                                        </div>

                                                                                                                        {isForeach ? (
                                                                                                                            <div className="space-y-2 bg-amber-500/5 p-2 rounded border border-amber-500/20">
                                                                                                                                <div className="space-y-1">
                                                                                                                                    <label className="text-[10px] font-bold text-amber-500 uppercase">Foreach Array</label>
                                                                                                                                    <Input
                                                                                                                                        value={foreachVal.source || ''}
                                                                                                                                        onChange={(e) => {
                                                                                                                                            updateInput(JSON.stringify({ ...foreachVal, source: e.target.value }));
                                                                                                                                        }}
                                                                                                                                        placeholder="{{input.my_array}}"
                                                                                                                                        className="h-7 text-[10px] font-mono border-amber-500/20 bg-background"
                                                                                                                                    />
                                                                                                                                </div>
                                                                                                                                <div className="space-y-1">
                                                                                                                                    <label className="text-[10px] font-bold text-amber-500 uppercase">Item Template (use {"{{item}}"})</label>
                                                                                                                                    {inp.type === 'multi-input' ? (
                                                                                                                                        <div className="space-y-2 p-2 bg-background/50 border border-amber-500/10 rounded">
                                                                                                                                            {getMultiInputKeys(inp.default_value).map(key => {
                                                                                                                                                const currentVal = typeof foreachVal.template === 'object' ? (foreachVal.template[key] || '') : '';

                                                                                                                                                return (
                                                                                                                                                    <div key={key} className="flex items-center gap-1">
                                                                                                                                                        <span className="text-[10px] font-bold text-amber-500/70 w-12 truncate">{key}</span>
                                                                                                                                                        <Input
                                                                                                                                                            value={currentVal}
                                                                                                                                                            onChange={(e) => {
                                                                                                                                                                const newTemplate = { ...(typeof foreachVal.template === 'object' ? foreachVal.template : {}), [key]: e.target.value };
                                                                                                                                                                updateInput(JSON.stringify({ ...foreachVal, template: newTemplate }));
                                                                                                                                                            }}
                                                                                                                                                            className="h-6 text-[10px] border-amber-500/20 bg-background"
                                                                                                                                                            placeholder={`{{item}}`}
                                                                                                                                                        />
                                                                                                                                                    </div>
                                                                                                                                                );
                                                                                                                                            })}
                                                                                                                                        </div>
                                                                                                                                    ) : (
                                                                                                                                        <Input
                                                                                                                                            value={typeof foreachVal.template === 'string' ? foreachVal.template : ''}
                                                                                                                                            onChange={(e) => {
                                                                                                                                                updateInput(JSON.stringify({ ...foreachVal, template: e.target.value }));
                                                                                                                                            }}
                                                                                                                                            placeholder="{{item}}"
                                                                                                                                            className="h-7 text-[10px] font-mono border-amber-500/20 bg-background"
                                                                                                                                        />
                                                                                                                                    )}
                                                                                                                                </div>
                                                                                                                            </div>
                                                                                                                        ) : inp.type === 'select' ? (
                                                                                                                            <div className="flex flex-col gap-2">
                                                                                                                                <select
                                                                                                                                    value={((inp.default_value || '').split(',').map(o => o.trim()).includes(val)) ? val : ''}
                                                                                                                                    onChange={(e) => updateInput(e.target.value)}
                                                                                                                                    className="h-7 px-2 w-full text-[10px] font-semibold border border-indigo-500/20 rounded bg-background text-foreground outline-none focus:ring-1 focus:ring-indigo-500/30 cursor-pointer"
                                                                                                                                >
                                                                                                                                    <option value="">— Select —</option>
                                                                                                                                    {(inp.default_value || '').split(',').map(o => o.trim()).filter(Boolean).map(o => (
                                                                                                                                        <option key={o} value={o}>{o}</option>
                                                                                                                                    ))}
                                                                                                                                </select>
                                                                                                                                <Input
                                                                                                                                    value={val}
                                                                                                                                    onChange={(e) => updateInput(e.target.value)}
                                                                                                                                    placeholder="Custom value or {{variable}}"
                                                                                                                                    className="h-7 text-[10px] font-mono border-indigo-500/10 bg-muted/20"
                                                                                                                                />
                                                                                                                            </div>
                                                                                                                        ) : inp.type === 'multi-select' ? (
                                                                                                                            <div className="space-y-2">
                                                                                                                                <div className="flex flex-wrap gap-1 p-1 bg-background border border-indigo-500/20 rounded min-h-[28px]">
                                                                                                                                    {(inp.default_value || '').split(',').map(o => o.trim()).filter(Boolean).map(o => {
                                                                                                                                        let selected: string[] = [];
                                                                                                                                        try { selected = JSON.parse(val || '[]'); } catch { }
                                                                                                                                        const isSelected = selected.includes(o);
                                                                                                                                        return (
                                                                                                                                            <button
                                                                                                                                                key={o}
                                                                                                                                                onClick={() => {
                                                                                                                                                    let next = [...selected];
                                                                                                                                                    if (isSelected) next = next.filter(s => s !== o);
                                                                                                                                                    else next.push(o);
                                                                                                                                                    updateInput(JSON.stringify(next));
                                                                                                                                                }}
                                                                                                                                                className={cn(
                                                                                                                                                    "px-1.5 py-0.5 rounded text-[10px] font-bold transition-all border",
                                                                                                                                                    isSelected
                                                                                                                                                        ? "bg-indigo-500 text-white border-indigo-500"
                                                                                                                                                        : "bg-background text-muted-foreground border-border hover:border-indigo-500/50"
                                                                                                                                                )}
                                                                                                                                            >
                                                                                                                                                {o}
                                                                                                                                            </button>
                                                                                                                                        );
                                                                                                                                    })}
                                                                                                                                </div>
                                                                                                                                <Input
                                                                                                                                    value={val}
                                                                                                                                    onChange={(e) => updateInput(e.target.value)}
                                                                                                                                    placeholder='Custom JSON ["a", "b"] or {{variable}}'
                                                                                                                                    className="h-7 text-[10px] font-mono border-indigo-500/10 bg-muted/20"
                                                                                                                                />
                                                                                                                            </div>
                                                                                                                        ) : inp.type === 'multi-input' ? (
                                                                                                                            <div className="space-y-2 bg-indigo-500/5 p-2 rounded border border-indigo-500/10">
                                                                                                                                {(() => {
                                                                                                                                    const keys = getMultiInputKeys(inp.default_value);
                                                                                                                                    let rows: any[] = [];
                                                                                                                                    try { rows = JSON.parse(val || '[]'); if (!Array.isArray(rows)) rows = [{}]; } catch { rows = [{}]; }
                                                                                                                                    if (rows.length === 0) rows = [{}];

                                                                                                                                    return (
                                                                                                                                        <>
                                                                                                                                            {rows.map((row, rIdx) => (
                                                                                                                                                <div key={rIdx} className="space-y-1 p-2 bg-background border border-indigo-500/10 rounded relative group/mrow">
                                                                                                                                                    {keys.map(k => (
                                                                                                                                                        <div key={k} className="flex items-center gap-1">
                                                                                                                                                            <span className="text-[10px] font-bold text-muted-foreground/50 w-12 truncate">{k}</span>
                                                                                                                                                            <Input
                                                                                                                                                                value={row[k] || ''}
                                                                                                                                                                onChange={(e) => {
                                                                                                                                                                    const next = [...rows];
                                                                                                                                                                    next[rIdx] = { ...next[rIdx], [k]: e.target.value };
                                                                                                                                                                    updateInput(JSON.stringify(next));
                                                                                                                                                                }}
                                                                                                                                                                className="h-6 text-[10px] bg-muted/20 border-border/50"
                                                                                                                                                            />
                                                                                                                                                        </div>
                                                                                                                                                    ))}
                                                                                                                                                    {rows.length > 1 && (
                                                                                                                                                        <button
                                                                                                                                                            onClick={() => updateInput(JSON.stringify(rows.filter((_, i) => i !== rIdx)))}
                                                                                                                                                            className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/mrow:opacity-100 transition-opacity"
                                                                                                                                                        >
                                                                                                                                                            <Trash2 className="w-2 h-2" />
                                                                                                                                                        </button>
                                                                                                                                                    )}
                                                                                                                                                </div>
                                                                                                                                            ))}
                                                                                                                                            <Button
                                                                                                                                                variant="outline"
                                                                                                                                                size="sm"
                                                                                                                                                onClick={() => updateInput(JSON.stringify([...rows, {}]))}
                                                                                                                                                className="w-full h-6 border-dashed border-indigo-500/30 text-[10px] font-black uppercase tracking-widest bg-background"
                                                                                                                                            >
                                                                                                                                                <Plus className="w-2 h-2 mr-1" /> Add Row
                                                                                                                                            </Button>
                                                                                                                                        </>
                                                                                                                                    );
                                                                                                                                })()}
                                                                                                                            </div>
                                                                                                                        ) : (
                                                                                                                            <Input
                                                                                                                                value={val}
                                                                                                                                onChange={(e) => updateInput(e.target.value)}
                                                                                                                                placeholder={`Value or {{input.key}}`}
                                                                                                                                className="h-7 text-[10px] font-mono border-indigo-500/20 bg-background"
                                                                                                                            />
                                                                                                                        )}
                                                                                                                    </div>
                                                                                                                );
                                                                                                            })}
                                                                                                        </div>
                                                                                                    );
                                                                                                })()}
                                                                                                <div className="flex items-center justify-between gap-2 pt-1">
                                                                                                    <div>
                                                                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Wait for completion</span>
                                                                                                        <p className="text-[10px] text-muted-foreground/50">Off = run asynchronously</p>
                                                                                                    </div>
                                                                                                    <Switch
                                                                                                        checked={step.wait_to_finish !== false}
                                                                                                        onCheckedChange={(checked) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx]!.steps![sIdx].wait_to_finish = checked;
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                    />
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-8 w-8 text-muted-foreground/30 hover:text-destructive transition-all"
                                                                                    onClick={() => {
                                                                                        const ng = [...groups];
                                                                                        ng[gIdx].steps = ng[gIdx].steps?.filter((_, i) => i !== sIdx);
                                                                                        setGroups(ng);
                                                                                    }}
                                                                                >
                                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </Draggable>
                                                                ))}
                                                                {provided.placeholder}

                                                                <Button
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        const ng = [...groups];
                                                                        if (!ng[gIdx].steps) ng[gIdx].steps = [];
                                                                        ng[gIdx].steps!.push({
                                                                            id: generateUUID(),
                                                                            name: `Action ${ng[gIdx].steps!.length + 1}`,
                                                                            action_type: 'COMMAND',
                                                                            command_text: '',
                                                                            order: ng[gIdx].steps!.length
                                                                        } as WorkflowStep);
                                                                        setGroups(ng);
                                                                    }}
                                                                    className="w-full h-9 border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 rounded-md transition-all group"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5 mr-2 text-muted-foreground group-hover:text-primary" />
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary">Append Execution Step</span>
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </Droppable>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                    <div className="justify-center pt-4 flex">
                                        <Button
                                            onClick={handleAddGroup}
                                            variant="outline"
                                            className="h-9 px-8 rounded-md bg-primary/5 hover:bg-primary/10 text-primary border-primary/20 font-bold uppercase tracking-widest text-[10px] transition-all"
                                        >
                                            <Plus className="w-4 h-4 mr-2" />
                                            Extend Module Chain
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext >
                )}
            </div>

            {/* Paste cURL Modal */}
            <Dialog open={pasteModal.open} onOpenChange={(o) => !o && setPasteModal({ ...pasteModal, open: false })}>
                <DialogContent className="sm:max-w-xl bg-background/95 backdrop-blur-2xl border-white/10 shadow-2xl p-0 overflow-hidden">
                    <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-4 flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-md">
                            <Terminal className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                            <DialogTitle className="text-emerald-500 text-lg font-bold tracking-tight">Paste cURL Command</DialogTitle>
                            <p className="text-[10px] text-emerald-500/60 font-medium uppercase tracking-widest">Auto-import HTTP configuration</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-md blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
                            <Textarea
                                placeholder={'curl -X POST https://api.example.com \\\n  -H "Content-Type: application/json" \\\n  -d \'{"key": "value"}\''}
                                className="relative min-h-[200px] font-mono text-xs bg-black/40 border-white/5 focus-visible:ring-emerald-500/50 rounded-md p-4 transition-all"
                                value={pasteModal.text}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPasteModal({ ...pasteModal, text: e.target.value })}
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground italic px-1">Tip: Supports standard headers (-H), methods (-X), and data (-d/--data-raw).</p>
                    </div>

                    <DialogFooter className="bg-muted/30 p-4 border-t border-white/5 gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setPasteModal({ ...pasteModal, open: false })}
                            className="rounded-md h-9 font-bold uppercase tracking-widest text-[10px] hover:bg-white/5"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-md h-9 px-8 font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                            onClick={() => {
                                const { text, gIdx, sIdx } = pasteModal;
                                if (!text) {
                                    setPasteModal({ ...pasteModal, open: false });
                                    return;
                                }
                                let method = 'GET'; let url = ''; let headers: Record<string, string> = {}; let body = '';
                                try {
                                    const cleanText = text.replace(/\\(\r?\n)/g, ' ');
                                    const tokens = cleanText.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
                                    for (let i = 0; i < tokens.length; i++) {
                                        let token = tokens[i].replace(/^["']|["']$/g, '');
                                        if (token === '\\') continue;
                                        if (token === '-X' || token === '--request') {
                                            if (i + 1 < tokens.length) method = tokens[++i].replace(/^["']|["']$/g, '').toUpperCase();
                                        }
                                        else if (token === '-H' || token === '--header') {
                                            if (i + 1 < tokens.length) {
                                                const h = tokens[++i].replace(/^["']|["']$/g, '');
                                                const pIdx = h.indexOf(':');
                                                if (pIdx > 0) headers[h.substring(0, pIdx).trim()] = h.substring(pIdx + 1).trim();
                                            }
                                        } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
                                            if (i + 1 < tokens.length) {
                                                body = tokens[++i].replace(/^["']|["']$/g, '');
                                                if (method === 'GET') method = 'POST';
                                            }
                                        } else if (token.startsWith('http')) { url = token; }
                                        else if (token === '--location') { /* skip */ }
                                    }
                                    const ng = [...groups];
                                    ng[gIdx]!.steps![sIdx].http_method = method;
                                    ng[gIdx]!.steps![sIdx].http_url = url;
                                    ng[gIdx]!.steps![sIdx].http_headers = Object.keys(headers).length > 0 ? JSON.stringify(headers, null, 2) : '';
                                    ng[gIdx]!.steps![sIdx].http_body = body;
                                    setGroups(ng);
                                    setPasteModal({ ...pasteModal, open: false });
                                } catch (e) {
                                    setTestResult({ open: true, title: 'Parse Error', message: "Failed to parse cURL command. Please check the format.", variant: 'danger' });
                                }
                            }}
                        >
                            Import Config
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Test Result Alert Modal */}
            <Dialog open={testResult.open} onOpenChange={(o) => !o && setTestResult({ ...testResult, open: false })}>
                <DialogContent className="sm:max-w-2xl bg-background/95 backdrop-blur-2xl border-white/10 shadow-2xl p-0 overflow-hidden ring-1 ring-white/10">
                    <div className={cn(
                        "px-6 py-6 border-b border-white/5 flex items-center justify-between",
                        testResult.variant === 'success' ? "bg-emerald-500/10" : testResult.variant === 'danger' ? "bg-rose-500/10" : "bg-primary/10"
                    )}>
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-md shadow-inner",
                                testResult.variant === 'success' ? "bg-emerald-500/20 text-emerald-500" : testResult.variant === 'danger' ? "bg-rose-500/20 text-rose-500" : "bg-primary/20 text-primary"
                            )}>
                                {testResult.variant === 'success' ? <CheckCircle2 className="w-6 h-6" /> : testResult.variant === 'danger' ? <XCircle className="w-6 h-6" /> : <Info className="w-6 h-6" />}
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold tracking-tight">{testResult.title}</DialogTitle>
                                <p className={cn(
                                    "text-[10px] font-bold uppercase tracking-[0.2em] mt-0.5",
                                    testResult.variant === 'success' ? "text-emerald-500/70" : testResult.variant === 'danger' ? "text-rose-500/70" : "text-primary/70"
                                )}>
                                    Execution Completed
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                copyToClipboard(testResult.message);
                            }}
                            className="h-9 px-4 rounded-md gap-2 hover:bg-white/5 font-bold uppercase tracking-widest text-[10px] transition-all"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Response
                        </Button>
                    </div>

                    <div className="p-0 bg-black/20 w-full overflow-hidden">
                        <div className="max-h-[60vh] overflow-auto custom-scrollbar w-full min-w-0">
                            <div className="w-fit min-w-full">
                                <pre className="p-8 text-xs font-mono leading-relaxed bg-transparent whitespace-pre selection:bg-primary/30">
                                    {(() => {
                                        const responseHeader = "Response:";
                                        const parts = testResult.message.split(responseHeader);
                                        
                                        if (parts.length >= 2) {
                                            const headerPart = parts[0];
                                            let bodyPart = parts.slice(1).join(responseHeader).trim();
                                            
                                            try {
                                                const parsed = JSON.parse(bodyPart);
                                                bodyPart = JSON.stringify(parsed, null, 2);
                                            } catch (e) {
                                                // Not JSON or partial, stay as is
                                            }

                                            return (
                                                <>
                                                    {headerPart.split('\n').map((line, i) => {
                                                        if (line.startsWith('Status:')) return <div key={`h-${i}`} className="mb-4 pb-4 border-b border-white/5 text-lg font-bold text-foreground whitespace-pre"> {line} </div>;
                                                        return line.trim() ? <div key={`h-${i}`} className="mb-0.5 text-muted-foreground/90 whitespace-pre">{line}</div> : null;
                                                    })}
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 mt-2 whitespace-pre"> {responseHeader} </div>
                                                    <div className="mb-0.5 text-muted-foreground/90 whitespace-pre">{bodyPart}</div>
                                                </>
                                            );
                                        }

                                        return testResult.message.split('\n').map((line, i) => {
                                            if (line.startsWith('Status:')) return <div key={i} className="mb-4 pb-4 border-b border-white/5 text-lg font-bold text-foreground whitespace-pre"> {line} </div>;
                                            if (line.startsWith('Response:')) return <div key={i} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 mt-2 whitespace-pre"> {line} </div>;
                                            return <div key={i} className="mb-0.5 text-muted-foreground/90 whitespace-pre">{line}</div>;
                                        });
                                    })()}
                                </pre>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-muted/20 p-4 border-t border-white/5">
                        <Button
                            onClick={() => setTestResult({ ...testResult, open: false })}
                            className="w-full bg-white/5 hover:bg-white/10 text-foreground border border-white/10 rounded-md h-9 font-bold uppercase tracking-widest text-[10px] transition-all active:scale-[0.98]"
                        >
                            Dismiss Window
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
