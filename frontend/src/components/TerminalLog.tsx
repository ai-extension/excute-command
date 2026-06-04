import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { Terminal as TerminalIcon, Download, Trash2, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import Ansi from 'ansi-to-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, streamResponseLines, createLineBatcher } from '../lib/api';

// One log line, memoized so an append only renders the NEW lines. Without this,
// every streamed batch re-ran the ANSI parser for all accumulated lines (O(n²)),
// which on a large historical log saturates the main thread — Chrome then can't
// paint between chunks and dumps the whole log at once at end-of-stream (Safari's
// scheduler happens to interleave paints, so it looked fine there). Keyed by a
// stable append-only index, so prior lines keep identical props and skip re-render.
const LogLine = React.memo(({ index, text }: { index: number; text: string }) => (
    <div className="flex gap-2 group">
        <span className="text-muted-foreground/40 select-none text-[10px] w-6 shrink-0 pt-0.5">
            {(index + 1).toString().padStart(2, '0')}
        </span>
        <span className="whitespace-pre leading-relaxed min-w-fit flex-1">
            <Ansi linkify={false}>{text}</Ansi>
        </span>
    </div>
));

interface TerminalLogProps {
    targetID: string;
    executionID?: string;
    isActive: boolean;
    isGlobal?: boolean;
    isGroup?: boolean;
    initialLogs?: string[];
    isLive?: boolean;
    parentExecutionID?: string;
    showHeader?: boolean;
    onClear?: () => void;
    onReady?: () => void;
    onLogsChange?: (logs: string[]) => void;
    className?: string;
}

const TerminalLog: React.FC<TerminalLogProps> = ({
    targetID,
    executionID,
    isActive,
    initialLogs = [],
    isLive = true,
    isGlobal = false,
    isGroup = false,
    parentExecutionID,
    showHeader = true,
    onClear,
    onReady,
    onLogsChange,
    className
}) => {
    const [logs, setLogs] = useState<string[]>(initialLogs);
    const { apiFetch } = useAuth();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const targetRef = useRef(targetID);

    useEffect(() => {
        targetRef.current = targetID;
        if (isLive) {
            setLogs([]); // Clear logs immediately when switching targets in live mode
        }
    }, [targetID, executionID, isLive, isGlobal, isGroup, apiFetch]);

    // Historical mode: stream the log file for the current target right here.
    // Owning the stream + state locally means each chunk re-renders only this
    // terminal subtree — not the parent ExecutionMonitor (whose sidebar/step tree
    // would otherwise reconcile per chunk and starve paints, so the log dumped
    // all at once instead of streaming). Batched per frame to cap re-renders.
    useEffect(() => {
        if (isLive || !executionID) return;

        let cancelled = false;
        setLogs([]);

        let url = `${API_BASE_URL}/executions/${executionID}/logs`;
        if (!isGlobal) {
            url += isGroup ? `?group_id=${targetID}` : `?step_id=${targetID}`;
        }

        const batcher = createLineBatcher(batch => {
            if (!cancelled) setLogs(prev => [...prev, ...batch]);
        });
        apiFetch(url)
            .then(res => {
                if (!res.ok) {
                    if (!cancelled && !isGlobal) setLogs(['[Log file not found]']);
                    return;
                }
                return streamResponseLines(res, lines => {
                    if (cancelled) return;
                    batcher.push(lines.filter(l => l.length > 0));
                });
            })
            .then(() => { if (!cancelled) batcher.flush(); })
            .catch(() => { if (!cancelled) batcher.flush(); /* keep partial logs */ });
        return () => { cancelled = true; batcher.cancel(); };
    }, [isLive, executionID, targetID, isGlobal, isGroup, apiFetch]);

    // Clear logs when executionID changes to avoid bleeding old run logs into a new run
    useEffect(() => {
        if (isLive) {
            setLogs([]);
        }
    }, [executionID, isLive]);

    const { token } = useAuth();
    const isCatchingUpRef = useRef<boolean>(false);
    const messageQueueRef = useRef<string[]>([]);

    useEffect(() => {
        if (!isActive || !isLive) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let baseUrl = API_BASE_URL;
        if (baseUrl.startsWith('/')) {
            baseUrl = `${window.location.host}${baseUrl}`;
        } else {
            baseUrl = baseUrl.replace(/^http(s)?:\/\//, '');
        }

        const wsUrl = `${protocol}//${baseUrl}/ws?token=${token || ''}`;
        const socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'catchup_start') {
                    isCatchingUpRef.current = true;
                    setLogs([]);
                    messageQueueRef.current = [];
                    return;
                }
                if (data.type === 'catchup_end') {
                    isCatchingUpRef.current = false;
                    // Flush queue
                    if (messageQueueRef.current.length > 0) {
                        setLogs(prev => [...prev, ...messageQueueRef.current]);
                        messageQueueRef.current = [];
                    }
                    return;
                }

                if (data.type === 'log' && data.execution_id === executionID && data.target_id === targetID && data.content) {
                    const newLines = data.content.split('\n').filter((line: string) => line.length > 0);

                    if (isCatchingUpRef.current) {
                        // If it's a catchup message, append it directly
                        if (data.is_catchup) {
                            setLogs(prev => [...prev, ...newLines]);
                        } else {
                            // If it's a LIVE message arriving during catchup, queue it
                            messageQueueRef.current = [...messageQueueRef.current, ...newLines];
                        }
                    } else {
                        // Regular live message
                        setLogs(prev => [...prev, ...newLines]);
                    }
                }
            } catch (err) {
                console.error('Failed to parse WS message:', err);
            }
        };

        socket.onopen = () => {
            console.log('WebSocket connected');
            if (onReady) onReady();

            // Request catch-up logs from the in-memory buffer
            if (executionID) {
                socket.send(JSON.stringify({
                    type: 'request_catchup',
                    execution_id: executionID,
                    parent_execution_id: parentExecutionID,
                    target_id: targetID
                }));
            }
        };
        socket.onclose = () => console.log('WebSocket disconnected');

        return () => {
            socket.close();
        };
    }, [targetID, executionID, isActive, isLive]);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        if (onLogsChange) {
            onLogsChange(logs);
        }
    }, [logs, autoScroll, onLogsChange, isLive]);

    const handleDownload = () => {
        const content = logs.join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${targetID}-${new Date().toISOString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const clearLogs = () => {
        setLogs([]);
        if (onClear) onClear();
    };

    return (
        <div className={cn(
            "flex flex-col bg-background border border-border rounded-md overflow-hidden shadow-2xl transition-all duration-500 h-full min-h-0",
            className
        )}>
            {/* Header */}
            {showHeader && (
                <div className="flex items-center justify-between px-4 py-2 bg-muted border-b border-border">
                    <div className="flex items-center gap-2">
                        <TerminalIcon className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">
                            Live Stream Console
                        </span>
                        <div className="flex items-center gap-1.5 ml-2">
                            <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"
                            )} />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                                {isLive ? (isActive ? 'Session Active' : 'Disconnected') : 'Historical Data'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAutoScroll(!autoScroll)}
                            className={cn(
                                "h-7 w-7 rounded-md transition-colors",
                                autoScroll ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"
                            )}
                            title="Auto-scroll"
                        >
                            <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleDownload}
                            className="h-7 w-7 rounded-md text-muted-foreground hover:bg-muted"
                            title="Download logs"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearLogs}
                            className="h-7 w-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Clear console"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Content */}
            <div
                ref={scrollRef}
                className="flex-1 p-4 font-mono text-sm overflow-auto min-h-0 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent selection:bg-primary/30"
            >
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 gap-3 grayscale">
                        <TerminalIcon className="w-8 h-8" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">
                            Waiting for output signal...
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {logs.map((log, i) => (
                            <LogLine key={i} index={i} text={log} />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-1.5 bg-background border-t border-border flex justify-between items-center">
                <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    Buffer: {logs.length} Lines • Target: {targetID.substring(0, 8)}
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5 opacity-40">
                        <div className="w-1.5 h-1.5 rounded bg-muted-foreground/30" />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Stdout</span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-40">
                        <div className="w-1.5 h-1.5 rounded bg-destructive/50" />
                        <span className="text-[10px] font-black uppercase tracking-tighter text-red-400">Stderr</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TerminalLog;
