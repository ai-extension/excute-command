import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
    Zap, Lock, Globe, ShieldCheck, Play, Terminal, Info, AlertTriangle,
    CheckCircle2, Loader2, Monitor, X, RefreshCw, ServerIcon, Clock, ChevronDown, ChevronUp, Maximize2, Minimize2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { Page, PageWidget, PageLayout, WorkflowInput } from '../types';
import { API_BASE_URL } from '../lib/api';

// ANSI Parsing Utility
const parseAnsi = (text: string) => {
    if (!text) return [];

    // Split by ANSI escape sequences
    const parts = text.split(/(\u001b\[[0-9;]*m)/g);
    let currentStyles: Record<string, string> = {
        color: '#e2e8f0' // Default text color (higher contrast than zinc-400)
    };

    return parts.map((part, index) => {
        if (part.startsWith('\u001b[')) {
            const code = part.match(/[0-9;]+/)?.[0] || '0';
            const codes = code.split(';');

            codes.forEach(c => {
                const num = parseInt(c, 10);
                if (num === 0) {
                    currentStyles = { color: '#e2e8f0' };
                } else if (num === 1) {
                    currentStyles.fontWeight = 'bold';
                } else if (num >= 30 && num <= 37) {
                    const colors = ['#000', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#d946ef', '#06b6d4', '#fff'];
                    currentStyles.color = colors[num - 30];
                } else if (num >= 90 && num <= 97) {
                    const brightColors = ['#94a3b8', '#fb7185', '#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#22d3ee', '#fff'];
                    currentStyles.color = brightColors[num - 90];
                }
            });
            return null;
        }

        return <span key={index} style={{ ...currentStyles }}>{part}</span>;
    }).filter(Boolean);
};

const PublicPageView = () => {
    const { slug } = useParams();
    const [page, setPage] = useState<Page | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [requiresPassword, setRequiresPassword] = useState(false);
    const [widgets, setWidgets] = useState<PageWidget[]>([]);

    // Token state
    const [pageToken, setPageToken] = useState<string | null>(null);
    const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | null>(null);
    const [tokenExpired, setTokenExpired] = useState(false);

    // Execution State
    const [runningWidgets, setRunningWidgets] = useState<Record<string, boolean>>({});
    const [executionResults, setExecutionResults] = useState<Record<string, { success: boolean, message: string }>>({});

    // Input Modal State
    const [inputModal, setInputModal] = useState<{
        isOpen: boolean;
        widget: PageWidget | null;
        workflowInputs: WorkflowInput[];
    }>({
        isOpen: false,
        widget: null,
        workflowInputs: []
    });
    const [inputValues, setInputValues] = useState<Record<string, string>>({});
    const modalRef = useRef<HTMLDivElement>(null);

    // Log Streaming State
    const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
    const [executionLogs, setExecutionLogs] = useState<string>('');
    const [executionStatus, setExecutionStatus] = useState<string | null>(null);
    const [isPollingLogs, setIsPollingLogs] = useState(false);
    const [terminalState, setTerminalState] = useState<'normal' | 'minimized' | 'maximized'>('normal');

    const fetchPageContent = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const url = `${API_BASE_URL}/public/pages/${slug}`;
            const response = await fetch(url);
            const data = await response.json();

            if (response.status === 410) {
                setError('This link has expired.');
                setIsLoading(false);
                return;
            }

            if (response.status === 401 || data.requires_password) {
                setRequiresPassword(true);
                setPage(data);
            } else if (!response.ok) {
                setError(data.error || 'Access Terminated');
            } else {
                setPage(data);
                setIsAuthorized(true);
                setRequiresPassword(false);
                if (data.layout) {
                    try {
                        const layout: PageLayout = JSON.parse(data.layout);
                        setWidgets(layout.widgets || []);
                    } catch (_) {
                        setWidgets([]);
                    }
                }
            }
        } catch (err) {
            setError('Connection Failure');
        } finally {
            setIsLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        fetchPageContent();
    }, [fetchPageContent]);

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsVerifying(true);
        try {
            const response = await fetch(`${API_BASE_URL}/public/pages/${slug}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await response.json();
            if (response.ok) {
                const pageData = data.page || data;
                setPage(pageData);
                setIsAuthorized(true);
                setRequiresPassword(false);
                setTokenExpired(false);
                setError(null);
                if (data.token) {
                    setPageToken(data.token);
                    setTokenExpiresAt(data.expires_at ? new Date(data.expires_at) : null);
                }
                if (pageData.layout) {
                    try {
                        const layout: PageLayout = JSON.parse(pageData.layout);
                        setWidgets(layout.widgets || []);
                    } catch (_) { }
                }
            } else {
                setError('Invalid password.');
            }
        } catch (err) {
            setError('Verification failed.');
        } finally {
            setIsVerifying(false);
        }
    };

    // Expiry watcher
    useEffect(() => {
        if (!tokenExpiresAt || !isAuthorized) return;
        const check = setInterval(() => {
            if (new Date() >= tokenExpiresAt) {
                setTokenExpired(true);
                setIsAuthorized(false);
                setRequiresPassword(true);
                setPageToken(null);
                setTokenExpiresAt(null);
                clearInterval(check);
            }
        }, 5000);
        return () => clearInterval(check);
    }, [tokenExpiresAt, isAuthorized]);

    // Logs Polling
    useEffect(() => {
        if (!activeExecutionId || !isAuthorized || !pageToken) return;
        let isMounted = true;
        const poll = setInterval(async () => {
            try {
                const headers = { 'X-Page-Token': pageToken };
                const sRes = await fetch(`${API_BASE_URL}/public/pages/${slug}/executions/${activeExecutionId}`, { headers });

                if (sRes.status === 401) {
                    setTokenExpired(true);
                    setIsAuthorized(false);
                    setIsPollingLogs(false);
                    return;
                }

                const sData = await sRes.json();
                if (isMounted) {
                    setExecutionStatus(sData.status);
                    if (sData.status === 'SUCCESS' || sData.status === 'FAILED') {
                        setIsPollingLogs(false);
                        clearInterval(poll);
                    }
                }
                const lRes = await fetch(`${API_BASE_URL}/public/pages/${slug}/executions/${activeExecutionId}/logs`, { headers });
                const lData = await lRes.text();
                if (isMounted) setExecutionLogs(lData);
            } catch (err) { }
        }, 2000);
        return () => { isMounted = false; clearInterval(poll); };
    }, [activeExecutionId, slug, isAuthorized, pageToken]);

    const runWidget = async (widget: PageWidget, inputs: Record<string, string> = {}) => {
        const pw = page?.workflows?.find(p => p.workflow_id === widget.workflow_id);
        const workflowInputs = pw?.workflow?.inputs || [];

        if (workflowInputs.length > 0 && Object.keys(inputs).length === 0) {
            const defaults: Record<string, string> = {};
            workflowInputs.forEach(input => {
                defaults[input.key] = input.default_value || '';
            });
            setInputValues(defaults);
            setInputModal({
                isOpen: true,
                widget,
                workflowInputs
            });
            return;
        }

        setInputModal({ isOpen: false, widget: null, workflowInputs: [] });
        setRunningWidgets(prev => ({ ...prev, [widget.id]: true }));
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (pageToken) headers['X-Page-Token'] = pageToken;

            const response = await fetch(`${API_BASE_URL}/public/pages/${slug}/run/${widget.workflow_id}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ inputs })
            });

            const data = await response.json();
            if (response.status === 401) {
                setTokenExpired(true); setIsAuthorized(false);
                return;
            }

            if (response.ok) {
                setExecutionResults(prev => ({ ...prev, [widget.id]: { success: true, message: 'SUCCESS' } }));
                if (widget.show_log) {
                    setActiveExecutionId(data.execution_id);
                    setExecutionLogs('Initializing trace...');
                    setExecutionStatus('RUNNING');
                    setIsPollingLogs(true);
                    setTerminalState('normal');
                }
            } else {
                setExecutionResults(prev => ({ ...prev, [widget.id]: { success: false, message: data.error || 'FAILED' } }));
            }
        } catch (err) {
            setExecutionResults(prev => ({ ...prev, [widget.id]: { success: false, message: 'ERROR' } }));
        } finally {
            setRunningWidgets(prev => ({ ...prev, [widget.id]: false }));
            setTimeout(() => {
                setExecutionResults(prev => {
                    const n = { ...prev };
                    delete n[widget.id];
                    return n;
                });
            }, 3000);
        }
    };

    if (isLoading && !page) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <h1 className="text-xl font-bold uppercase tracking-tighter">Establishing Link</h1>
            </div>
        );
    }

    if (requiresPassword && !isAuthorized) {
        return (
            <div className="min-h-screen bg-[var(--sidebar-bg)] flex flex-col items-center justify-center p-6">
                <div className="w-full max-w-md bg-card border border-border rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-500">
                    <div className="text-center mb-10">
                        <div className="inline-flex p-5 rounded-[2rem] bg-emerald-500/10 text-emerald-500 mb-6 ring-1 ring-emerald-500/20">
                            <ShieldCheck className="w-10 h-10" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter uppercase mb-2">Encrypted Access</h1>
                        <p className="text-muted-foreground text-sm font-medium">Password required for <span className="text-emerald-500 font-bold">"{page?.title}"</span></p>
                    </div>

                    <form onSubmit={handlePasswordSubmit} className="space-y-6">
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="h-14 bg-background border-border rounded-2xl text-center text-xl tracking-widest font-mono"
                            autoFocus
                        />
                        {error && <p className="text-destructive text-xs font-bold text-center">{error}</p>}
                        {tokenExpired && <p className="text-amber-500 text-[10px] font-bold text-center uppercase tracking-widest">Session Expired</p>}
                        <Button
                            type="submit"
                            disabled={isVerifying || !password}
                            className="w-full h-14 rounded-2xl premium-gradient text-white shadow-premium text-[11px] font-black uppercase tracking-[0.2em]"
                        >
                            {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Unlock Interface"}
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 pb-20">
            <header className="fixed top-0 left-0 right-0 h-1 bg-primary z-50 shadow-lg" />

            <main className="max-w-6xl mx-auto px-6 pt-24 pb-32">
                <div className="flex flex-col items-center text-center mb-16 space-y-4">
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter">{page?.title}</h1>
                    <p className="text-lg text-muted-foreground font-medium italic opacity-70">
                        {page?.description || "Interactive control center."}
                    </p>

                    <div className="flex items-center gap-6 pt-2">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-primary" />
                            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                                {widgets.filter(w => w.type === 'ENDPOINT').length} Endpoints
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-emerald-500" />
                            <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                                {widgets.filter(w => w.type === 'TERMINAL').length} Terminals
                            </span>
                        </div>
                    </div>

                    {tokenExpiresAt && (
                        <div className="flex items-center gap-2 pt-1 opacity-50">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                Session expires at {tokenExpiresAt.toLocaleTimeString()}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-8">
                    {widgets.map(widget => {
                        if (widget.type === 'ENDPOINT') {
                            const result = executionResults[widget.id];
                            return (
                                <div key={widget.id} className={cn(
                                    "p-10 bg-card border border-border rounded-[3rem] shadow-xl flex flex-col justify-between min-h-[260px] transition-all hover:border-primary/50 group",
                                    widget.size === 'full' ? "w-full" : "w-full md:w-[calc(50%-16px)]"
                                )}>
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-5">
                                                <div className="p-4 rounded-[1.5rem] bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                                    <Zap className="w-7 h-7" />
                                                </div>
                                                <div>
                                                    <h3 className="text-2xl font-black tracking-tight uppercase leading-tight">{widget.title}</h3>
                                                    <Badge variant="outline" className="text-[8px] font-black uppercase tracking-[0.25em] px-2 h-5 mt-1.5 border-primary/30 text-primary/70">Terminal Access Port</Badge>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[13px] font-medium text-muted-foreground mt-6 opacity-60 leading-relaxed max-w-[90%]">
                                            {widget.description || "Launch automated system orchestration pipeline with real-time feedback loop."}
                                        </p>
                                    </div>

                                    <div className="pt-10">
                                        <Button
                                            onClick={() => runWidget(widget)}
                                            disabled={runningWidgets[widget.id]}
                                            className={cn(
                                                "w-full h-16 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[11px] shadow-premium transition-all active:scale-[0.98]",
                                                result ? (result.success ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-rose-500 hover:bg-rose-600 text-white") : (widget.style || "premium-gradient")
                                            )}
                                        >
                                            {runningWidgets[widget.id] ? (
                                                <div className="flex items-center gap-3">
                                                    <Loader2 className="w-6 h-6 animate-spin" />
                                                    <span>Running...</span>
                                                </div>
                                            ) : result ? (
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
                                    </div>
                                </div>
                            );
                        } else if (widget.type === 'TERMINAL') {
                            return (
                                <TerminalWidget
                                    key={widget.id}
                                    widget={widget}
                                    slug={slug || ''}
                                    pageToken={pageToken}
                                />
                            );
                        }
                        return null;
                    })}
                </div>

                {widgets.length === 0 && (
                    <div className="py-32 text-center opacity-30">
                        <Monitor className="w-12 h-12 mx-auto mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest">No nodes deployed</p>
                    </div>
                )}
            </main>

            {/* Workflow Input Modal */}
            {inputModal.isOpen && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-background/60 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setInputModal({ isOpen: false, widget: null, workflowInputs: [] });
                        }
                    }}
                >
                    <div
                        ref={modalRef}
                        className="w-full max-w-sm bg-card border border-border rounded-[2rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-500 slide-in-from-bottom-8"
                    >
                        <div className="px-6 py-4 border-b border-border bg-muted/20">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 rounded-[0.75rem] bg-primary/10 text-primary ring-1 ring-primary/20">
                                    <Terminal className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black tracking-tighter uppercase">{inputModal.widget?.label || 'Config'}</h3>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em] leading-none opacity-50 mt-1">Parameters</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 space-y-5">
                            {inputModal.workflowInputs.map((input, idx) => (
                                <div key={input.id} className="space-y-1.5 animate-in fade-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                                    <div className="flex items-center justify-between px-1">
                                        <label className="text-[9px] font-black uppercase text-primary tracking-[0.2em]">{input.label || input.key}</label>
                                        <Info className="w-2.5 h-2.5 text-muted-foreground opacity-30" />
                                    </div>
                                    {input.type === 'select' ? (
                                        <div className="relative group">
                                            <select
                                                value={inputValues[input.key] || ''}
                                                onChange={e => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                                className="w-full h-10 bg-background border border-border rounded-lg px-4 text-[11px] font-bold outline-none focus:border-primary/50 focus:ring-2 ring-primary/5 transition-all appearance-none cursor-pointer"
                                            >
                                                {(input.default_value || '').split(',').map(opt => (
                                                    <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none group-hover:text-primary transition-colors" />
                                        </div>
                                    ) : (
                                        <Input
                                            type={input.type === 'number' ? 'number' : 'text'}
                                            value={inputValues[input.key] || ''}
                                            onChange={e => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                            className="h-10 bg-background border border-border rounded-lg px-4 text-[11px] font-bold focus:border-primary/50 focus:ring-2 ring-primary/5 transition-all"
                                            placeholder={`Value for ${input.label.toLowerCase()}...`}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="px-6 pb-6 flex flex-col gap-2.5">
                            <Button
                                onClick={() => inputModal.widget && runWidget(inputModal.widget, inputValues)}
                                className="h-11 premium-gradient text-white rounded-[0.75rem] font-black uppercase tracking-[0.3em] text-[10px] shadow-premium hover:shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)] duration-300"
                            >
                                Confirm & Launch
                            </Button>
                            <Button variant="ghost" onClick={() => setInputModal({ isOpen: false, widget: null, workflowInputs: [] })} className="h-8 text-[8px] font-black uppercase tracking-[0.15em] opacity-30 hover:opacity-100 transition-all">Dismiss</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom-Right Execution Log Terminal */}
            {activeExecutionId && (
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
                                        onClick={() => setActiveExecutionId(null)}
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
                                        executionStatus === 'RUNNING' ? "bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary-rgb),0.8)]" :
                                            executionStatus === 'SUCCESS' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                                                "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]")} />
                                    <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">Trace: {executionStatus || 'POLLING'}</h3>
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
                                <div className="flex-1 overflow-y-auto p-8 font-mono text-[12px] leading-relaxed scrollbar-thin selection:bg-primary/40 selection:text-white">
                                    {executionLogs ? executionLogs.split('\n').filter((l, i, arr) => l !== '' || i < arr.length - 1).map((line, i) => (
                                        <div key={i} className="whitespace-pre-wrap min-h-[1.2rem]">
                                            {parseAnsi(line)}
                                        </div>
                                    )) : <div className="text-zinc-700 animate-pulse">Waiting for system buffer...</div>}
                                    <div className="h-4" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Terminal Widget Component ---

interface TerminalWidgetProps {
    widget: PageWidget;
    slug: string;
    pageToken?: string | null;
}

const TerminalWidget: React.FC<TerminalWidgetProps> = ({ widget, slug, pageToken }) => {
    const [output, setOutput] = useState<string>('Connecting...');
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [widgetState, setWidgetState] = useState<'normal' | 'minimized' | 'maximized'>('normal');
    const [isVisible, setIsVisible] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchOutput = useCallback(async () => {
        try {
            const headers: Record<string, string> = {};
            if (pageToken) headers['X-Page-Token'] = pageToken;
            const res = await fetch(`${API_BASE_URL}/public/pages/${slug}/widgets/${widget.id}/run`, { headers });
            if (res.ok) {
                const data = await res.json();
                setOutput(data.output || '(empty content stream)');
                setLastUpdated(new Date());
            } else {
                setOutput(`System Error: ${res.status} [Unauthorized or Not Found]`);
            }
        } catch (err) { } finally { setIsLoading(false); }
    }, [slug, widget.id, pageToken]);

    useEffect(() => {
        if (!isVisible) return;
        fetchOutput();
        const interval = widget.reload_interval === 'realtime' ? 2000 : parseInt(widget.reload_interval || '10', 10) * 1000;
        const t = setInterval(fetchOutput, interval);
        return () => clearInterval(t);
    }, [fetchOutput, widget.reload_interval, isVisible]);

    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [output, widgetState]);

    if (!isVisible) return null;

    return (
        <div className={cn(
            "bg-[#0a0b0e] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl transition-all duration-300 group hover:border-emerald-500/30",
            widgetState === 'maximized' ? "fixed inset-8 z-[120] w-auto h-auto" :
                widget.size === 'full' ? "w-full" : "w-full md:w-[calc(50%-16px)]",
            widgetState === 'minimized' ? "h-[54px]" : ""
        )}>
            <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/5">
                <div className="flex items-center gap-3">
                    {/* Compact Traffic Lights for Terminal Widget */}
                    <div className="flex gap-1 mr-2">
                        <button
                            onClick={() => setIsVisible(false)}
                            className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] border border-[#e0443e] hover:bg-[#ff5f56]/80 transition-all flex items-center justify-center group/btn"
                        >
                            <X className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                        </button>
                        <button
                            onClick={() => setWidgetState(widgetState === 'minimized' ? 'normal' : 'minimized')}
                            className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123] hover:bg-[#ffbd2e]/80 transition-all flex items-center justify-center group/btn"
                        >
                            <ChevronDown className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                        </button>
                        <button
                            onClick={() => setWidgetState(widgetState === 'maximized' ? 'normal' : 'maximized')}
                            className="w-2.5 h-2.5 rounded-full bg-[#27c93f] border border-[#1aab29] hover:bg-[#27c93f]/80 transition-all flex items-center justify-center group/btn"
                        >
                            <Maximize2 className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                        </button>
                    </div>
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] font-mono font-black text-zinc-100 uppercase tracking-[0.2em]">{widget.title}</span>
                </div>
                <button onClick={fetchOutput} className="text-zinc-500 hover:text-emerald-400 transition-all p-1 rounded-full hover:bg-white/5">
                    <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                </button>
            </div>
            {widgetState !== 'minimized' && (
                <>
                    <div ref={scrollRef} className={cn(
                        "p-10 font-mono text-[14px] leading-relaxed text-slate-200 overflow-y-auto scrollbar-thin selection:bg-emerald-500/40 selection:text-white",
                        widgetState === 'maximized' ? "h-[calc(100vh-250px)]" : "min-h-[250px] max-h-[500px]"
                    )}>
                        {output.split('\n').filter((l, i, arr) => l !== '' || i < arr.length - 1).map((l, i) => (
                            <div key={i} className="whitespace-pre-wrap min-h-[1.2rem]">
                                {parseAnsi(l)}
                            </div>
                        ))}
                    </div>
                    <div className="px-10 py-5 bg-black/40 border-t border-white/5 text-[11px] font-mono text-zinc-400 truncate opacity-60 group-hover:opacity-100 transition-opacity uppercase tracking-[0.1em]">
                        <span className="text-emerald-500 font-bold mr-2">$ exec</span> {widget.command}
                    </div>
                </>
            )}
        </div>
    );
};

export default PublicPageView;
