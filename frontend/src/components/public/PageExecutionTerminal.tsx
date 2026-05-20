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
    const containerRef = useRef<HTMLDivElement>(null);
    const onStatusChangeRef = useRef(onStatusChange);
    useEffect(() => { onStatusChangeRef.current = onStatusChange; });

    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);
    const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
    const resizeState = useRef<{ startX: number; startY: number; originW: number; originH: number } | null>(null);

    const onHeaderMouseDown = (e: React.MouseEvent) => {
        if (terminalState === 'maximized') return;
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragState.current = {
            startX: e.clientX,
            startY: e.clientY,
            originX: rect.left,
            originY: rect.top,
        };
        e.preventDefault();
    };

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (dragState.current) {
                const dx = e.clientX - dragState.current.startX;
                const dy = e.clientY - dragState.current.startY;
                const rect = containerRef.current?.getBoundingClientRect();
                const w = rect?.width ?? 0;
                const h = rect?.height ?? 0;
                const nx = Math.min(Math.max(0, dragState.current.originX + dx), window.innerWidth - w);
                const ny = Math.min(Math.max(0, dragState.current.originY + dy), window.innerHeight - h);
                setPosition({ x: nx, y: ny });
            } else if (resizeState.current) {
                const dx = e.clientX - resizeState.current.startX;
                const dy = e.clientY - resizeState.current.startY;
                const nw = Math.min(Math.max(280, resizeState.current.originW + dx), window.innerWidth - 16);
                const nh = Math.min(Math.max(160, resizeState.current.originH + dy), window.innerHeight - 16);
                setSize({ width: nw, height: nh });
            }
        };
        const onUp = () => { dragState.current = null; resizeState.current = null; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    useEffect(() => {
        if (terminalState === 'maximized') { setPosition(null); setSize(null); }
    }, [terminalState]);

    const onResizeMouseDown = (e: React.MouseEvent) => {
        if (terminalState !== 'normal') return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        if (!position) setPosition({ x: rect.left, y: rect.top });
        resizeState.current = {
            startX: e.clientX,
            startY: e.clientY,
            originW: rect.width,
            originH: rect.height,
        };
        e.preventDefault();
        e.stopPropagation();
    };

    const toggleMinimize = () => {
        setTerminalState(terminalState === 'minimized' ? 'normal' : 'minimized');
    };

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
        <div
            ref={containerRef}
            style={(() => {
                if (terminalState === 'maximized') return undefined;
                const s: React.CSSProperties = {};
                if (position) { s.left = position.x; s.top = position.y; s.right = 'auto'; s.bottom = 'auto'; }
                if (size && terminalState === 'normal') { s.width = size.width; s.height = size.height; s.maxWidth = 'none'; }
                return s;
            })()}
            className={cn(
                "fixed z-[110]",
                !dragState.current && !resizeState.current && "transition-all duration-500 ease-in-out",
                position && terminalState !== 'maximized' ? "" :
                    terminalState === 'minimized' ? "bottom-8 right-8" :
                        terminalState === 'maximized' ? "inset-8" :
                            "bottom-8 right-8",
                terminalState === 'minimized' ? "w-[300px] h-[64px]" :
                    terminalState === 'maximized' ? "w-auto h-auto" :
                        (!size ? "w-full max-w-2xl h-[450px]" : "")
            )}>
            <div className="w-full h-full bg-[#0a0a0c] border border-white/10 rounded-md shadow-[0_24px_80px_rgba(0,0,0,0.8),0_0_20px_rgba(var(--primary-rgb),0.1)] overflow-hidden flex flex-col animate-in slide-in-from-right-16 duration-500">
                {/* Terminal Header */}
                <div
                    onMouseDown={onHeaderMouseDown}
                    className={cn(
                        "bg-white/5 px-4 py-2.5 border-b border-white/5 flex items-center justify-between select-none",
                        terminalState !== 'maximized' ? "cursor-grab active:cursor-grabbing" : ""
                    )}>
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
                                onClick={toggleMinimize}
                                title={terminalState === 'minimized' ? 'Restore' : 'Minimize'}
                                className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123] hover:bg-[#ffbd2e]/80 transition-all flex items-center justify-center group/btn"
                            >
                                {terminalState === 'minimized'
                                    ? <ChevronUp className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                                    : <ChevronDown className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />}
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
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Trace: {status || 'CONNECTING'}</h3>
                        </div>
                    </div>
                    {terminalState === 'minimized' && (
                        <button onClick={() => setTerminalState('normal')} className="p-2 hover:bg-white/10 rounded-md text-zinc-500 transition-all">
                            <ChevronUp className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Terminal Body */}
                {terminalState !== 'minimized' && (
                    <div className="flex-1 flex flex-col min-h-0 bg-black/40">
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 font-mono text-xs leading-relaxed scrollbar-thin selection:bg-primary/40 selection:text-white">
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
            {terminalState === 'normal' && (
                <div
                    onMouseDown={onResizeMouseDown}
                    title="Resize"
                    className="absolute bottom-1 right-1 w-4 h-4 cursor-nwse-resize text-zinc-400 hover:text-zinc-200 z-20"
                    style={{
                        backgroundImage: 'linear-gradient(135deg, transparent 55%, currentColor 55%, currentColor 65%, transparent 65%, transparent 75%, currentColor 75%, currentColor 85%, transparent 85%)',
                    }}
                />
            )}
        </div>
    );
};

export default PageExecutionTerminal;
