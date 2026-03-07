import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { Terminal as TerminalIcon, Download, Trash2, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import Ansi from 'ansi-to-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';

interface TerminalLogProps {
    targetID: string;
    executionID?: string;
    isActive: boolean;
    isGlobal?: boolean;
    isGroup?: boolean;
    initialLogs?: string[];
    isLive?: boolean;
    showHeader?: boolean;
    onClear?: () => void;
    onReady?: () => void;
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
    showHeader = true,
    onClear,
    onReady,
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
            if (executionID) {
                // Fetch existing logs for the new target
                const url = isGlobal
                    ? `${API_BASE_URL}/executions/${executionID}/logs`
                    : isGroup
                        ? `${API_BASE_URL}/executions/${executionID}/logs?group_id=${targetID}`
                        : `${API_BASE_URL}/executions/${executionID}/logs?step_id=${targetID}`;

                apiFetch(url)
                    .then(res => res.text())
                    .then((text: string) => {
                        // Only update if targetID hasn't changed since we started fetching
                        // AND only if we don't already have logs from WebSocket catchup
                        if (targetRef.current === targetID) {
                            const diskLines = text.split('\n').filter(line => line.length > 0);
                            setLogs(prev => {
                                // If we already have logs (e.g. from WS catchup), don't overwrite
                                // but we could merge if we wanted to be fancy.
                                // For now, if prev is empty, we use diskLines.
                                if (prev.length === 0) return diskLines;
                                return prev;
                            });
                        }
                    })
                    .catch((err: Error) => console.error('Failed to fetch historical context:', err));
            }
        }
    }, [targetID, executionID, isLive, isGlobal, isGroup, apiFetch]);

    useEffect(() => {
        if (!isLive) {
            setLogs(initialLogs);
        }
    }, [initialLogs, isLive]);

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

        const wsUrl = `ws://${window.location.hostname}:8080/api/ws?token=${token || ''}`;
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
                        // If we receive a live message while catching up, queue it
                        // (Assuming the backend sends live messages without a special flag, 
                        // anything arriving during catchup that isn't part of the catchup flush gets queued)
                        // Actually, backend catchup sends log messages sequentially, so we just process them.
                        // The true fix is that backend marks the END of catchup, and any LIVE messages during that time are queued.
                        // Wait, if it's a catchup message, we just append it. If it's a live message during catchup, we queue it.
                        // Since we can't easily distinguish them here, we rely on the fact that catchup messages are sent synchronously in a loop.
                        // Actually, just appending them is fine AS LONG as we reset logs on catchup_start.
                        setLogs(prev => [...prev, ...newLines]);
                    } else {
                        setLogs(prev => {
                            // Check for duplicates
                            if (prev.length > 0 && newLines.length > 0 && prev[prev.length - 1] === newLines[0]) {
                                return [...prev, ...newLines.slice(1)];
                            }
                            return [...prev, ...newLines];
                        });
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
                    execution_id: executionID
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
    }, [logs, autoScroll]);

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
            "flex flex-col bg-background border border-border rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 h-full min-h-0",
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
                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
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
                                "h-7 w-7 rounded-lg transition-colors",
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
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted"
                            title="Download logs"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearLogs}
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                className="flex-1 p-4 font-mono text-[13px] overflow-auto min-h-0 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent selection:bg-primary/30"
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
                            <div key={i} className="flex gap-2 group animate-in fade-in duration-300">
                                <span className="text-muted-foreground/40 select-none text-[10px] w-6 shrink-0 pt-0.5">
                                    {(i + 1).toString().padStart(2, '0')}
                                </span>
                                <span className="whitespace-pre leading-relaxed min-w-fit flex-1">
                                    <Ansi linkify={false}>{log}</Ansi>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-1.5 bg-background border-t border-border flex justify-between items-center">
                <div className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                    Buffer: {logs.length} Lines • Target: {targetID.substring(0, 8)}
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5 opacity-40">
                        <div className="w-1.5 h-1.5 rounded bg-muted-foreground/30" />
                        <span className="text-[9px] font-black uppercase tracking-tighter">Stdout</span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-40">
                        <div className="w-1.5 h-1.5 rounded bg-destructive/50" />
                        <span className="text-[9px] font-black uppercase tracking-tighter text-red-400">Stderr</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TerminalLog;
