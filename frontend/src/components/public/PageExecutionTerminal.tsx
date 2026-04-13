import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Maximize2, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import AnsiText from '../AnsiText';
import { API_BASE_URL } from '../../lib/api';

interface PageExecutionTerminalProps {
    activeExecutionId: string | null;
    workflowId?: string;
    slug: string;
    pageToken: string | null;
    terminalState: 'normal' | 'minimized' | 'maximized';
    setTerminalState: (state: 'normal' | 'minimized' | 'maximized') => void;
    onClose: () => void;
    onStatusChange?: (status: string) => void;
    isHidden?: boolean;
}

const PageExecutionTerminal: React.FC<PageExecutionTerminalProps> = ({
    activeExecutionId,
    workflowId,
    slug,
    pageToken,
    terminalState,
    setTerminalState,
    onClose,
    onStatusChange,
    isHidden
}) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const onStatusChangeRef = useRef(onStatusChange);
    useEffect(() => { onStatusChangeRef.current = onStatusChange; });

    useEffect(() => {
        if (!activeExecutionId) return;

        setLogs([]);
        setStatus('RUNNING');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let baseUrl = API_BASE_URL;
        if (baseUrl.startsWith('/')) {
            baseUrl = `${window.location.host}${baseUrl}`;
        } else {
            baseUrl = baseUrl.replace(/^http(s)?:\/\//, '');
        }

        const wsUrl = `${protocol}//${baseUrl}/ws?token=${pageToken || ''}&slug=${slug || ''}&status_only=${isHidden ? 'true' : 'false'}`;
        const socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.execution_id === activeExecutionId) {
                    if (data.type === 'log' && data.content && (!workflowId || data.target_id === workflowId)) {
                        const newLines = data.content.split('\n').filter((l: string) => l.length > 0);
                        setLogs(prev => [...prev, ...newLines]);
                    } else if (data.type === 'status' && data.target_type === 'workflow') {
                        setStatus(data.status);
                        if (onStatusChangeRef.current) onStatusChangeRef.current(data.status);
                    }
                }
            } catch (err) {
                console.error('Failed to parse WS message:', err);
            }
        };

        socket.onopen = () => {
            socket.send(JSON.stringify({
                type: 'request_catchup',
                execution_id: activeExecutionId
            }));
        };

        return () => {
            socket.close();
        };
    }, [activeExecutionId, slug, pageToken]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    if (!activeExecutionId) return null;

    if (isHidden) {
        return <div className="hidden" aria-hidden="true" />;
    }

    return (
        <div className={cn(
            "fixed z-[110] transition-all duration-500 ease-in-out",
            terminalState === 'minimized' ? "bottom-8 right-8 w-[300px] h-[64px]" :
                terminalState === 'maximized' ? "inset-8 w-auto h-auto" :
                    "bottom-8 right-8 w-full max-w-2xl h-[450px]"
        )}>
            <div className="w-full h-full bg-[#0a0a0c] border border-white/10 rounded-[2rem] shadow-[0_24px_80px_rgba(0,0,0,0.8),0_0_20px_rgba(var(--primary-rgb),0.1)] overflow-hidden flex flex-col animate-in slide-in-from-right-16 duration-500">
                {/* Terminal Header */}
                <div className="bg-white/5 px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Traffic Light Controls */}
                        <div className="flex gap-1 mr-2">
                            <button
                                onClick={onClose}
                                className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] border border-[#e0443e] hover:bg-[#ff5f56]/80 transition-all flex items-center justify-center group/btn"
                            >
                                <X className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                            </button>
                            <button
                                onClick={() => setTerminalState('minimized')}
                                className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123] hover:bg-[#ffbd2e]/80 transition-all flex items-center justify-center group/btn"
                            >
                                <ChevronDown className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                            </button>
                            <button
                                onClick={() => setTerminalState(terminalState === 'maximized' ? 'normal' : 'maximized')}
                                className="w-2.5 h-2.5 rounded-full bg-[#27c93f] border border-[#1aab29] hover:bg-[#27c93f]/80 transition-all flex items-center justify-center group/btn"
                            >
                                <Maximize2 className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                            </button>
                        </div>
                        <div className="flex items-center gap-2" onClick={() => terminalState === 'minimized' && setTerminalState('normal')}>
                            <div className={cn("w-1.5 h-1.5 rounded-full",
                                status === 'RUNNING' ? "bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary-rgb),0.8)]" :
                                    status === 'SUCCESS' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                                        "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]")} />
                            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">Trace: {status || 'CONNECTING'}</h3>
                        </div>
                    </div>
                    {terminalState === 'minimized' && (
                        <button onClick={() => setTerminalState('normal')} className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 transition-all">
                            <ChevronUp className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Terminal Body */}
                {terminalState !== 'minimized' && (
                    <div className="flex-1 flex flex-col min-h-0 bg-black/40">
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 font-mono text-[12px] leading-relaxed scrollbar-thin selection:bg-primary/40 selection:text-white">
                            {logs.length > 0 ? logs.map((line, i) => (
                                <div key={i} className="whitespace-pre-wrap min-h-[1.2rem]">
                                    <AnsiText text={line} />
                                </div>
                            )) : <div className="text-zinc-700 animate-pulse">Waiting for system buffer...</div>}
                            <div className="h-4" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PageExecutionTerminal;
