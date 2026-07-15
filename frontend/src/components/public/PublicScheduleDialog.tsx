import React, { useState, useEffect } from 'react';
import { CalendarClock, Loader2, Repeat, ListChecks } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { API_BASE_URL } from '../../lib/api';
import { WorkflowInput } from '../../types';

const MAX_REPEAT_DAYS = 10;

// Complex input types need upload/picker infra that doesn't fit a "schedule for later" flow;
// they fall back to a plain text field so the value can still be provided.
const RICH_TYPES = new Set(['file', 'dataset-select', 'dataset-multi-select', 'multi-input']);

// Share the exact same input draft as the run-flow WorkflowInputDialog so values a visitor
// typed in one dialog are restored in the other (keyed by public:{slug}:widget:{id}).
const DRAFT_PREFIX = 'wf_input_draft:';

const loadDraft = (key: string | undefined, inputs: WorkflowInput[]): Record<string, string> | null => {
    if (!key) return null;
    try {
        const raw = localStorage.getItem(DRAFT_PREFIX + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const allowed = new Set(inputs.filter(i => i.type !== 'file').map(i => i.key));
        const cleaned: Record<string, string> = {};
        for (const k of Object.keys(parsed)) {
            if (allowed.has(k) && typeof parsed[k] === 'string') cleaned[k] = parsed[k];
        }
        return cleaned;
    } catch {
        return null;
    }
};

const saveDraft = (key: string | undefined, values: Record<string, string>, inputs: WorkflowInput[]) => {
    if (!key) return;
    try {
        const fileKeys = new Set(inputs.filter(i => i.type === 'file').map(i => i.key));
        const toSave: Record<string, string> = {};
        for (const k of Object.keys(values)) {
            if (!fileKeys.has(k)) toSave[k] = values[k];
        }
        localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(toSave));
    } catch {
        // ignore quota/serialize errors
    }
};

// PublicScheduleDialog lets a public visitor schedule an ENDPOINT widget's workflow. Large
// two-column layout (mirrors the admin schedule form): left = timing, right = workflow
// inputs (only when the workflow declares any). Default is a one-time run; opting into
// repeat turns it into a daily run for up to MAX_REPEAT_DAYS days (backend → RECURRING).
const PublicScheduleDialog: React.FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    slug?: string;
    pageToken?: string | null;
    workflowId?: string;
    title: string;
    inputs?: WorkflowInput[];
    // Shared draft key with the run-flow input dialog (public:{slug}:widget:{id}).
    storageKey?: string;
    onCreated?: () => void;
}> = ({ open, onOpenChange, slug, pageToken, workflowId, title, inputs = [], storageKey, onCreated }) => {
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [repeat, setRepeat] = useState(false);
    const [repeatDays, setRepeatDays] = useState(3);
    const [values, setValues] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sortedInputs = [...inputs].sort((a, b) => (a.order || 0) - (b.order || 0));
    const hasInputs = sortedInputs.length > 0;

    // Local (not UTC) date for the date-input min, so evening users in western timezones can
    // still pick "today". The real past-guard is the getTime() check in submit().
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // On open: seed text-ish inputs from their default, then overlay the shared draft so
    // previously-typed values (from here OR the run dialog) are restored.
    useEffect(() => {
        if (!open) return;
        const seed: Record<string, string> = {};
        for (const inp of inputs) {
            seed[inp.key] = (!RICH_TYPES.has(inp.type) && inp.type !== 'multi-select') ? (inp.default_value || '') : '';
        }
        const draft = loadDraft(storageKey, inputs);
        setValues(draft ? { ...seed, ...draft } : seed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Persist to the shared draft as the visitor types (two-way sync with the run dialog).
    useEffect(() => {
        if (open && storageKey && inputs.length > 0) saveDraft(storageKey, values, inputs);
    }, [values, open, storageKey, inputs]);

    // NOTE: do not clear `values` here — that would run the save effect while still open and
    // wipe the shared draft. Values are re-seeded from the draft on next open.
    const reset = () => {
        setDate(''); setTime(''); setRepeat(false); setRepeatDays(3); setError(null);
    };

    const setVal = (key: string, v: string) => setValues(prev => ({ ...prev, [key]: v }));

    // Native date/time pickers only open from the calendar icon by default; open on any click.
    const openPicker = (e: React.MouseEvent<HTMLInputElement>) => {
        try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* unsupported */ }
    };

    const toggleMulti = (key: string, opt: string) => {
        const cur = (values[key] || '').split(',').map(s => s.trim()).filter(Boolean);
        const next = cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt];
        setVal(key, next.join(','));
    };

    const submit = async () => {
        setError(null);
        if (!slug || !workflowId) { setError('Missing page context.'); return; }
        if (!date || !time) { setError('Pick a date and time.'); return; }

        const runAtLocal = new Date(`${date}T${time}`);
        if (isNaN(runAtLocal.getTime())) { setError('Invalid date/time.'); return; }
        if (runAtLocal.getTime() <= Date.now()) { setError('Pick a time in the future.'); return; }

        const missing = sortedInputs.filter(i => i.required && !(values[i.key] || '').trim());
        if (missing.length > 0) {
            setError(`Fill required input(s): ${missing.map(m => m.label || m.key).join(', ')}`);
            return;
        }

        const days = Math.min(Math.max(1, repeatDays), MAX_REPEAT_DAYS);
        setSubmitting(true);
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (pageToken) headers['X-Page-Token'] = pageToken;
            const res = await fetch(`${API_BASE_URL}/public/pages/${slug}/schedule/${workflowId}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    run_at: runAtLocal.toISOString(),
                    repeat,
                    repeat_days: repeat ? days : 0,
                    inputs: values,
                }),
            });
            if (!res.ok) {
                let msg = `Failed (${res.status})`;
                try { const d = await res.json(); if (d?.error) msg = d.error; } catch { /* ignore */ }
                setError(msg);
                return;
            }
            reset();
            onOpenChange(false);
            onCreated?.();
        } catch (e: any) {
            setError(e?.message || 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    const fieldCls = "w-full h-10 px-3 bg-muted/30 border border-border rounded-md text-sm outline-none focus:border-primary/50 focus:ring-2 ring-primary/20 transition-all";

    const renderField = (inp: WorkflowInput) => {
        const val = values[inp.key] || '';
        if (inp.type === 'select') {
            const opts = (inp.default_value || '').split(',').map(o => o.trim()).filter(Boolean);
            return (
                <select value={val} onChange={e => setVal(inp.key, e.target.value)} className={fieldCls}>
                    <option value="">— Select —</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            );
        }
        if (inp.type === 'multi-select') {
            const opts = (inp.default_value || '').split(',').map(o => o.trim()).filter(Boolean);
            const selected = val.split(',').map(s => s.trim()).filter(Boolean);
            return (
                <div className="flex flex-wrap gap-1.5">
                    {opts.map(o => {
                        const on = selected.includes(o);
                        return (
                            <button
                                key={o}
                                type="button"
                                onClick={() => toggleMulti(inp.key, o)}
                                className={cn("px-2.5 h-8 rounded-md text-xs font-bold border transition-colors",
                                    on ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted/40")}
                            >
                                {o}
                            </button>
                        );
                    })}
                    {opts.length === 0 && <span className="text-xs text-muted-foreground/60">No options configured</span>}
                </div>
            );
        }
        if (inp.type === 'textarea') {
            return <Textarea value={val} onChange={e => setVal(inp.key, e.target.value)} rows={3} className="bg-muted/30 border-border rounded-md text-sm" placeholder={inp.default_value} />;
        }
        // input / number / and rich-type fallbacks → plain text (number gets numeric input)
        return (
            <Input
                type={inp.type === 'number' ? 'number' : 'text'}
                value={val}
                onChange={e => setVal(inp.key, e.target.value)}
                className="h-10 bg-muted/30 border-border rounded-md text-sm"
                placeholder={RICH_TYPES.has(inp.type) ? `(${inp.type}) enter value` : inp.default_value}
            />
        );
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
            <DialogContent className={cn("p-0 max-h-[90vh] flex flex-col overflow-hidden", hasInputs ? "max-w-[860px]" : "max-w-md")}>
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-primary" />
                        <span>Schedule run</span>
                        <span className="text-xs text-muted-foreground font-normal">— {title}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row min-h-0">
                    {/* Left: timing */}
                    <div className={cn("p-6 space-y-4 md:overflow-y-auto custom-scrollbar", hasInputs ? "md:w-1/2" : "w-full")}>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Date</label>
                                <input type="date" min={todayStr} value={date} onClick={openPicker} onChange={e => setDate(e.target.value)} className={cn(fieldCls, "cursor-pointer")} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Time</label>
                                <input type="time" value={time} onClick={openPicker} onChange={e => setTime(e.target.value)} className={cn(fieldCls, "cursor-pointer")} />
                            </div>
                        </div>

                        <label className="flex items-start gap-3 rounded-md border border-border bg-muted/20 px-3 py-3 cursor-pointer hover:border-primary/40 transition-colors">
                            <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary shrink-0" />
                            <span className="flex flex-col">
                                <span className="text-xs font-bold flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Repeat daily</span>
                                <span className="text-[10px] text-muted-foreground/70">Run every day at this time for up to {MAX_REPEAT_DAYS} days.</span>
                            </span>
                        </label>

                        {repeat && (
                            <div className="space-y-1.5 pl-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Repeat for (days)</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={MAX_REPEAT_DAYS}
                                    value={repeatDays}
                                    onChange={e => setRepeatDays(Math.min(MAX_REPEAT_DAYS, Math.max(1, parseInt(e.target.value || '1', 10))))}
                                    className={cn(fieldCls, "w-28")}
                                />
                            </div>
                        )}
                    </div>

                    {/* Right: workflow inputs */}
                    {hasInputs && (
                        <div className="md:w-1/2 p-6 border-t md:border-t-0 md:border-l border-border space-y-4 md:overflow-y-auto custom-scrollbar bg-muted/10">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                <ListChecks className="w-3.5 h-3.5" /> Workflow inputs
                            </div>
                            {sortedInputs.map(inp => (
                                <div key={inp.id || inp.key} className="space-y-1.5">
                                    <label className="text-xs font-bold flex items-center gap-1.5">
                                        {inp.label || inp.key}
                                        {inp.required && <span className="text-rose-500">*</span>}
                                    </label>
                                    {renderField(inp)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {error && <p className="text-xs text-rose-500 font-medium px-6">{error}</p>}

                <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={submitting}>Cancel</Button>
                    <Button onClick={submit} disabled={submitting} className="gap-2">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                        Schedule
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PublicScheduleDialog;
