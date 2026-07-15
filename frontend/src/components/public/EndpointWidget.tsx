import React, { useState, useRef } from 'react';
import { Zap, Play, Loader2, CheckCircle2, AlertTriangle, Square, History, RotateCcw, XCircle, Clock, FileText } from 'lucide-react';
import { WidgetIcon } from '../../lib/widgetIcons';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { PageWidget } from '../../types';
import { ExecutionHistoryEntry } from '../../lib/executionHistory';
import { resolveButtonStyle } from '../ButtonStylePicker';
import AnsiText from '../AnsiText';
import { API_BASE_URL, streamResponseLines, createLineBatcher } from '../../lib/api';

interface EndpointWidgetProps {
    widget: PageWidget;
    isRunning: boolean;
    result: { success: boolean, message: string } | undefined;
    onRun: (widget: PageWidget, inputs?: Record<string, string>) => void;
    onStop?: (widget: PageWidget) => void;
    history?: ExecutionHistoryEntry[];
    slug?: string;
    pageToken?: string | null;
    onOpenHistory?: () => void;
}

const statusStyle = (status: string) => {
    if (status === 'SUCCESS') return { cls: 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/30', Icon: CheckCircle2 };
    if (status === 'FAILED') return { cls: 'bg-rose-500/10 text-rose-500 ring-rose-500/30', Icon: AlertTriangle };
    if (status === 'CANCELLED') return { cls: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30', Icon: XCircle };
    return { cls: 'bg-primary/10 text-primary ring-primary/30', Icon: Loader2 };
};

const formatTime = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay ? d.toLocaleTimeString() : d.toLocaleString();
};

const formatInputs = (inputs: Record<string, string>) => {
    const keys = Object.keys(inputs);
    if (keys.length === 0) return '(no inputs)';
    return keys.map(k => `${k}: ${inputs[k]}`).join(' · ');
};

const EndpointWidget: React.FC<EndpointWidgetProps> = ({
    widget,
    isRunning,
    result,
    onRun,
    onStop,
    history = [],
    slug,
    pageToken,
    onOpenHistory,
}) => {
    const [historyOpen, setHistoryOpen] = useState(false);
    const [logEntry, setLogEntry] = useState<ExecutionHistoryEntry | null>(null);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [logLoading, setLogLoading] = useState(false);
    const [logError, setLogError] = useState<string | null>(null);
    const lastEntry = history[0];
    const hasHistory = history.length > 0;
    const styleResolved = resolveButtonStyle(widget.style, 'premium-gradient');

    const logReqRef = useRef(0);

    const openLog = async (entry: ExecutionHistoryEntry) => {
        // Stale-request guard: if another entry is opened mid-stream, older
        // streams must stop appending so their lines don't bleed into the new view.
        const reqId = ++logReqRef.current;
        setLogEntry(entry);
        setLogLines([]);
        setLogError(null);
        if (!slug) {
            setLogError('Missing page slug.');
            return;
        }
        setLogLoading(true);
        try {
            const headers: Record<string, string> = {};
            if (pageToken) headers['X-Page-Token'] = pageToken;
            const res = await fetch(`${API_BASE_URL}/public/pages/${slug}/executions/${entry.executionId}/logs`, { headers });
            if (logReqRef.current !== reqId) return;
            if (!res.ok) {
                const txt = await res.text();
                setLogError(`Failed to load log (${res.status})${txt ? ': ' + txt.slice(0, 200) : ''}`);
                return;
            }
            // Stream the body so lines render as chunks arrive instead of
            // blocking until the whole log file downloads. Batched per frame to
            // avoid a re-render per chunk on large logs.
            const batcher = createLineBatcher(batch => {
                if (logReqRef.current === reqId) setLogLines(prev => [...prev, ...batch]);
            });
            await streamResponseLines(res, lines => {
                if (logReqRef.current !== reqId) return;
                batcher.push(lines);
            });
            batcher.flush();
        } catch (e: any) {
            if (logReqRef.current === reqId) setLogError(e?.message || 'Failed to load log');
        } finally {
            if (logReqRef.current === reqId) setLogLoading(false);
        }
    };

    const triggerRerun = (inputs: Record<string, string>) => {
        setHistoryOpen(false);
        onRun(widget, inputs);
    };

    return (
        <div className={cn(
            "p-8 bg-card border border-border rounded-md shadow-xl flex flex-col justify-between min-h-[260px] transition-all hover:border-primary/50 group w-full"
        )}>
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                            <WidgetIcon name={widget.icon} fallback={Zap} className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black leading-tight">{widget.title}</h3>
                            <Badge variant="outline" className="text-[10px] font-black px-1.5 h-4 mt-1 border-primary/30 text-primary/70">Terminal Access Port</Badge>
                        </div>
                    </div>
                    {hasHistory && (
                        <button
                            type="button"
                            onClick={() => { setHistoryOpen(true); onOpenHistory?.(); }}
                            title="View execution history"
                            className="relative h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-transparent hover:border-border"
                        >
                            <History className="w-4 h-4" />
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center">
                                {history.length}
                            </span>
                        </button>
                    )}
                </div>
                <p className="text-[13px] font-medium text-muted-foreground mt-6 opacity-60 leading-relaxed whitespace-pre-wrap">
                    {widget.description || "Launch automated system orchestration pipeline with real-time feedback loop."}
                </p>
            </div>

            <div className="pt-10">
                {isRunning ? (
                    <div className="flex items-center gap-3">
                        <Button
                            disabled
                            style={styleResolved.style}
                            className={cn(
                                "flex-1 h-16 rounded-md font-black text-xs shadow-premium transition-all",
                                styleResolved.className
                            )}
                        >
                            <div className="flex items-center gap-3 opacity-70">
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span>Running...</span>
                            </div>
                        </Button>
                        <Button
                            onClick={() => onStop && onStop(widget)}
                            className="h-16 w-16 shrink-0 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/50 shadow-premium transition-all active:scale-[0.98] flex items-center justify-center group/stop"
                        >
                            <Square className="w-5 h-5 fill-current opacity-70 group-hover/stop:opacity-100 transition-opacity" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => onRun(widget)}
                            disabled={isRunning}
                            style={result ? undefined : styleResolved.style}
                            className={cn(
                                "flex-1 h-16 rounded-md font-black text-xs shadow-premium transition-all active:scale-[0.98]",
                                result ? (result.success ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-rose-500 hover:bg-rose-600 text-white") : styleResolved.className
                            )}
                        >
                            {result ? (
                                <div className="flex items-center gap-2">
                                    {result.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                    <span>{result.message}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <Play className="w-5 h-5 fill-current" />
                                    <span>{widget.label || 'Initiate'}</span>
                                </div>
                            )}
                        </Button>
                        {lastEntry && (
                            <div className="relative group/retry">
                                <button
                                    type="button"
                                    onClick={() => triggerRerun(lastEntry.inputs)}
                                    className="h-16 w-16 shrink-0 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/40 shadow-premium transition-all active:scale-[0.98] flex items-center justify-center"
                                >
                                    <RotateCcw className="w-5 h-5" />
                                </button>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-md bg-popover text-popover-foreground text-[11px] font-bold whitespace-nowrap shadow-lg border border-border opacity-0 group-hover/retry:opacity-100 pointer-events-none transition-opacity duration-150">
                                    Re-run last execution
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-popover" />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <History className="w-4 h-4" />
                            <span>Execution History</span>
                            <span className="text-xs text-muted-foreground font-normal">— {widget.title}</span>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-2">
                        {history.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No history yet.</p>
                        ) : history.map(entry => {
                            const { cls, Icon } = statusStyle(entry.status);
                            const isFinal = entry.status !== 'RUNNING';
                            return (
                                <div key={entry.executionId} className="border border-border rounded-md p-4 bg-card/50 flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className={cn("flex items-center gap-2 px-2 py-1 rounded-md ring-1", cls)}>
                                            <Icon className={cn("w-3.5 h-3.5", entry.status === 'RUNNING' && 'animate-spin')} />
                                            <span className="text-[10px] font-black uppercase tracking-wider">{entry.status}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                            <Clock className="w-3 h-3" />
                                            <span>{formatTime(entry.timestamp)}</span>
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground break-all">
                                        <span className="font-mono opacity-60">{entry.executionId.slice(0, 8)}</span>
                                        <span className="mx-2">·</span>
                                        <span>{formatInputs(entry.inputs)}</span>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openLog(entry)}
                                            className="h-8 gap-2"
                                        >
                                            <FileText className="w-3.5 h-3.5" />
                                            View Log
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={!isFinal || isRunning}
                                            onClick={() => triggerRerun(entry.inputs)}
                                            className="h-8 gap-2"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            Re-run
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!logEntry} onOpenChange={(open) => { if (!open) { setLogEntry(null); setLogLines([]); setLogError(null); } }}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            <span>Execution Log</span>
                            {logEntry && (
                                <span className="text-xs text-muted-foreground font-normal font-mono">— {logEntry.executionId.slice(0, 8)}</span>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 overflow-y-auto bg-black/90 rounded-md p-4 font-mono text-xs leading-relaxed scrollbar-thin">
                        {logError ? (
                            <div className="text-rose-400">{logError}</div>
                        ) : logLines.length > 0 ? (
                            <>
                                {logLines.map((line, i) => (
                                    <div key={i} className="whitespace-pre-wrap min-h-[1.2rem] text-zinc-200">
                                        <AnsiText text={line} />
                                    </div>
                                ))}
                                {logLoading && (
                                    <div className="flex items-center gap-2 text-zinc-500 mt-1">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Streaming…</span>
                                    </div>
                                )}
                            </>
                        ) : logLoading ? (
                            <div className="flex items-center gap-2 text-zinc-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Loading log...</span>
                            </div>
                        ) : (
                            <div className="text-zinc-600">(empty)</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default EndpointWidget;
