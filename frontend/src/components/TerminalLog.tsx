import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import { Terminal as TerminalIcon, Download, Trash2, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import Ansi from 'ansi-to-react';

interface TerminalLogProps {
    targetID: string;
    isActive: boolean;
    initialLogs?: string[];
    isLive?: boolean;
    showHeader?: boolean;
    onClear?: () => void;
    className?: string;
}

const TerminalLog: React.FC<TerminalLogProps> = ({
    targetID,
    isActive,
    initialLogs = [],
    isLive = true,
    showHeader = true,
    onClear,
    className
}) => {
    const [logs, setLogs] = useState<string[]>(initialLogs);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        if (!isLive) {
            setLogs(initialLogs);
        }
    }, [initialLogs, isLive]);

    useEffect(() => {
        if (!isActive || !isLive) return;

        const wsUrl = `ws://${window.location.hostname}:8080/api/ws`;
        const socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.target_id === targetID) {
                    setLogs(prev => [...prev, data.content]);
                }
            } catch (err) {
                console.error('Failed to parse WS message:', err);
            }
        };

        socket.onopen = () => console.log('WebSocket connected');
        socket.onclose = () => console.log('WebSocket disconnected');

        return () => {
            socket.close();
        };
    }, [targetID, isActive, isLive]);

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
            "flex flex-col bg-[#0a0b0e] border border-[#1a1c23] rounded-2xl overflow-hidden shadow-2xl transition-all duration-500",
            className
        )}>
            {/* Header */}
            {showHeader && (
                <div className="flex items-center justify-between px-4 py-2 bg-[#13151b] border-b border-[#1a1c23]">
                    <div className="flex items-center gap-2">
                        <TerminalIcon className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">
                            Live Stream Console
                        </span>
                        <div className="flex items-center gap-1.5 ml-2">
                            <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-700"
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
                className="flex-1 p-4 font-mono text-[13px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent selection:bg-primary/30"
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
                                <span className="text-zinc-700 select-none text-[10px] w-6 shrink-0 pt-0.5">
                                    {(i + 1).toString().padStart(2, '0')}
                                </span>
                                <span className="whitespace-pre-wrap leading-relaxed break-words flex-1">
                                    <Ansi linkify={false}>{log}</Ansi>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-1.5 bg-[#0a0b0e] border-t border-[#1a1c23] flex justify-between items-center">
                <div className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                    Buffer: {logs.length} Lines • Target: {targetID.substring(0, 8)}
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5 opacity-40">
                        <div className="w-1.5 h-1.5 rounded bg-zinc-700" />
                        <span className="text-[9px] font-black uppercase tracking-tighter">Stdout</span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-40">
                        <div className="w-1.5 h-1.5 rounded bg-red-900" />
                        <span className="text-[9px] font-black uppercase tracking-tighter text-red-400">Stderr</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TerminalLog;
