import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Zap, Lock, Globe, ShieldCheck, Play, Terminal, Info, AlertTriangle, CheckCircle2, Loader2, Monitor, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { Page, Workflow } from '../types';
import { API_BASE_URL } from '../lib/api';

const PublicPageView = () => {
    const { slug } = useParams();
    const [page, setPage] = useState<Page | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [requiresPassword, setRequiresPassword] = useState(false);

    // Execution State
    const [runningWorkflows, setRunningWorkflows] = useState<Record<string, boolean>>({});
    const [executionResults, setExecutionResults] = useState<Record<string, { success: boolean, message: string }>>({});

    // Input Modal State
    const [inputModal, setInputModal] = useState<{
        isOpen: boolean;
        workflowId: string;
        pageWorkflowId: string;
        label: string;
        inputs: any[];
    }>({
        isOpen: false,
        workflowId: '',
        pageWorkflowId: '',
        label: '',
        inputs: []
    });
    const [inputValues, setInputValues] = useState<Record<string, string>>({});

    // Log Streaming State
    const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
    const [executionLogs, setExecutionLogs] = useState<string>('');
    const [executionStatus, setExecutionStatus] = useState<string | null>(null);
    const [isPollingLogs, setIsPollingLogs] = useState(false);

    const fetchPageContent = useCallback(async (pwd?: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const url = `${API_BASE_URL}/public/pages/${slug}${pwd ? '?p=' + pwd : ''}`;
            const response = await fetch(url, {
                method: pwd ? 'POST' : 'GET',
                ...(pwd && {
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                })
            });

            if (response.status === 410) {
                setError('This link has expired and is no longer accessible.');
                setIsLoading(false);
                return;
            }

            const data = await response.json();

            if (response.status === 401 || data.requires_password) {
                setRequiresPassword(true);
                setPage(data); // Partial data (title, desc)
            } else if (!response.ok) {
                setError(data.error || `Server responded with ${response.status}: ${response.statusText}`);
            } else {
                setPage(data);
                setIsAuthorized(true);
                setRequiresPassword(false);
            }
        } catch (err) {
            setError('The secure uplink could not be established. Please check your network connection.');
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
                setPage(data);
                setIsAuthorized(true);
                setRequiresPassword(false);
            } else {
                setError('Invalid password. Access denied.');
            }
        } catch (err) {
            setError('Verification failed.');
        } finally {
            setIsVerifying(false);
        }
    };

    // Poll Execution Status and Logs
    useEffect(() => {
        if (!activeExecutionId || !isAuthorized) return;

        let isMounted = true;
        const pollInterval = setInterval(async () => {
            try {
                // Fetch Status
                const statusRes = await fetch(`${API_BASE_URL}/public/pages/${slug}/executions/${activeExecutionId}`, {
                    headers: { ...(password && { 'X-Page-Password': password }) }
                });
                const statusData = await statusRes.json();

                if (isMounted) {
                    setExecutionStatus(statusData.status);
                    if (statusData.status === 'SUCCESS' || statusData.status === 'FAILED') {
                        setIsPollingLogs(false);
                        clearInterval(pollInterval);
                    }
                }

                // Fetch Logs
                const logsRes = await fetch(`${API_BASE_URL}/public/pages/${slug}/executions/${activeExecutionId}/logs`, {
                    headers: { ...(password && { 'X-Page-Password': password }) }
                });
                const logsData = await logsRes.text();
                if (isMounted) {
                    setExecutionLogs(logsData);
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 2000);

        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, [activeExecutionId, slug, password, isAuthorized]);

    const executeWorkflow = async (workflowId: string, pageWorkflowId: string, inputs: Record<string, string> = {}) => {
        // Check if workflow has inputs and they are not provided yet
        const pw = page?.workflows?.find(p => p.id === pageWorkflowId);
        if (pw?.workflow?.inputs && pw.workflow.inputs.length > 0 && Object.keys(inputs).length === 0) {
            setInputModal({
                isOpen: true,
                workflowId,
                pageWorkflowId,
                label: pw.label,
                inputs: pw.workflow.inputs
            });
            // Initialize default values
            const defaults: Record<string, string> = {};
            pw.workflow.inputs.forEach(input => {
                defaults[input.key] = input.default_value || '';
            });
            setInputValues(defaults);
            return;
        }

        setInputModal(prev => ({ ...prev, isOpen: false }));
        setRunningWorkflows(prev => ({ ...prev, [pageWorkflowId]: true }));
        try {
            const response = await fetch(`${API_BASE_URL}/public/pages/${slug}/run/${workflowId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(password && { 'X-Page-Password': password })
                },
                body: JSON.stringify({ inputs })
            });

            const data = await response.json();
            if (response.ok) {
                setExecutionResults(prev => ({ ...prev, [pageWorkflowId]: { success: true, message: 'Orchestration Initialized' } }));

                // If ShowLog is enabled, start polling
                if (pw?.show_log) {
                    setActiveExecutionId(data.execution_id);
                    setExecutionLogs('Initializing uplink...');
                    setExecutionStatus('RUNNING');
                    setIsPollingLogs(true);
                }
            } else {
                setExecutionResults(prev => ({ ...prev, [pageWorkflowId]: { success: false, message: data.error || 'Execution Forbidden' } }));
            }
        } catch (err) {
            setExecutionResults(prev => ({ ...prev, [pageWorkflowId]: { success: false, message: 'Network Failure' } }));
        } finally {
            setRunningWorkflows(prev => ({ ...prev, [pageWorkflowId]: false }));
            setTimeout(() => {
                setExecutionResults(prev => {
                    const next = { ...prev };
                    delete next[pageWorkflowId];
                    return next;
                });
            }, 3000);
        }
    };

    if (isLoading && !page) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
                <div className="premium-gradient p-4 rounded-3xl shadow-premium animate-bounce mb-6">
                    <Zap className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-2xl font-black tracking-tighter uppercase mb-2">Establishing Secure Uplink</h1>
                <p className="text-muted-foreground font-medium italic opacity-50">Handshaking with Antigravity Engine...</p>
            </div>
        );
    }

    if (error && !requiresPassword) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
                <div className="p-4 rounded-3xl bg-destructive/10 text-destructive mb-6">
                    <AlertTriangle className="w-12 h-12" />
                </div>
                <h1 className="text-2xl font-black tracking-tighter uppercase mb-2">
                    {error.includes('expired') ? 'Link Expired' : 'Access Terminated'}
                </h1>
                <p className="text-muted-foreground font-medium mb-8 max-w-md">{error}</p>
                {!error.includes('expired') && (
                    <Button onClick={() => window.location.reload()} variant="outline" className="rounded-xl px-8 h-12 font-bold uppercase tracking-widest text-[11px]">
                        Attempt Reconnection
                    </Button>
                )}
            </div>
        );
    }

    if (requiresPassword && !isAuthorized) {
        return (
            <div className="min-h-screen bg-[var(--sidebar-bg)] flex flex-col items-center justify-center p-6">
                <div className="w-full max-w-md bg-card border border-border rounded-[2.5rem] p-10 shadow-2xl shadow-black/20 animate-in fade-in zoom-in-95 duration-500">
                    <div className="text-center mb-10">
                        <div className="inline-flex p-5 rounded-[2rem] bg-amber-500/10 text-amber-500 mb-6 shadow-inner ring-1 ring-amber-500/20">
                            <ShieldCheck className="w-10 h-10" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter uppercase mb-2">Encrypted Access</h1>
                        <p className="text-muted-foreground text-sm font-medium">Authentication required for <span className="text-amber-500 font-bold">"{page?.title}"</span></p>
                    </div>

                    <form onSubmit={handlePasswordSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-1">Page Password</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="h-14 bg-background border-border rounded-2xl text-center text-xl tracking-widest focus:ring-amber-500/30 font-mono"
                                autoFocus
                            />
                        </div>
                        {error && (
                            <div className="bg-destructive/10 text-destructive text-[11px] font-bold p-3 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-1">
                                <AlertTriangle className="w-4 h-4" /> {error}
                            </div>
                        )}
                        <Button
                            type="submit"
                            disabled={isVerifying || !password}
                            className="w-full h-14 rounded-2xl premium-gradient text-white shadow-premium text-[11px] font-black uppercase tracking-[0.2em]"
                        >
                            {isVerifying ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                "Decrypt & Unlock"
                            )}
                        </Button>
                    </form>

                    <p className="text-center mt-8 text-[10px] font-medium text-muted-foreground uppercase tracking-widest opacity-30">
                        Powered by Antigravity OS v4.2
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
            {/* Cyberpunk Header */}
            <header className="fixed top-0 left-0 right-0 h-2 bg-gradient-to-r from-primary via-emerald-500 to-primary z-50 shadow-[0_4px_30px_rgba(var(--primary-rgb),0.3)]" />

            <main className="max-w-6xl mx-auto px-6 pt-24 pb-20">
                <div className="flex flex-col items-center text-center mb-20 space-y-6 animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className="p-1 rounded-full bg-primary/20 ring-4 ring-primary/5">
                        <Badge className="bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1 h-auto rounded-full shadow-lg">
                            Live Interface
                        </Badge>
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/60 leading-none">
                            {page?.title}
                        </h1>
                        <p className="text-lg md:text-xl text-muted-foreground font-medium italic max-w-2xl opacity-70">
                            {page?.description || "Interactive control center for autonomous workflow orchestration."}
                        </p>
                    </div>

                    <div className="flex items-center gap-6 pt-4">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Status</span>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]" />
                                <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">Connected</span>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-border/50" />
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Endpoints</span>
                            <span className="text-xs font-bold uppercase tracking-widest mt-1">{page?.workflows?.length || 0} Ready</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-300">
                    {page?.workflows?.map((pw) => (
                        <div
                            key={pw.id}
                            className="group relative bg-card/50 backdrop-blur-xl border border-border rounded-[2rem] p-8 hover:border-primary/50 transition-all duration-500 shadow-xl hover:shadow-2xl hover:shadow-primary/5 flex flex-col justify-between min-h-[280px]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-500 shadow-inner">
                                            <Zap className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <Badge variant="outline" className="text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0 h-4 bg-muted/50 border-border/50 text-muted-foreground mb-1">
                                                Pipeline
                                            </Badge>
                                            <h3 className="text-xl font-black tracking-tight">{pw.label}</h3>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-sm font-medium text-muted-foreground leading-relaxed line-clamp-3 opacity-60">
                                    Authorized for remote execution on core infrastructure via secure API gateway.
                                </p>
                            </div>

                            <div className="relative z-10 pt-8 mt-auto">
                                <Button
                                    onClick={() => executeWorkflow(pw.workflow_id, pw.id)}
                                    disabled={runningWorkflows[pw.id]}
                                    className={cn(
                                        "w-full h-16 rounded-[1.25rem] font-black uppercase tracking-[0.25em] text-[11px] transition-all duration-300 active:scale-95 shadow-premium",
                                        pw.style,
                                        runningWorkflows[pw.id] && "opacity-50 saturate-50 cursor-not-allowed"
                                    )}
                                >
                                    {runningWorkflows[pw.id] ? (
                                        <div className="flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>Processing...</span>
                                        </div>
                                    ) : executionResults[pw.id] ? (
                                        <div className="flex items-center gap-2 animate-in zoom-in-95 duration-200">
                                            {executionResults[pw.id].success ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                            <span>{executionResults[pw.id].message}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <Play className="w-5 h-5 fill-current" />
                                            <span>Initiate Launch</span>
                                        </div>
                                    )}
                                </Button>

                                <div className="flex justify-center mt-4">
                                    <div className="flex items-center gap-1.5 opacity-30">
                                        <Terminal className="w-3 h-3" />
                                        <span className="text-[8px] font-bold uppercase tracking-widest">v4.2-STABLE</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {(!page?.workflows || page.workflows.length === 0) && (
                    <div className="col-span-full py-24 text-center space-y-4 opacity-50">
                        <Monitor className="w-16 h-16 mx-auto text-muted-foreground" />
                        <h3 className="text-xl font-bold uppercase tracking-widest text-muted-foreground">Empty Terminal</h3>
                        <p className="text-sm font-medium italic">No interactive control nodes have been deployed to this interface.</p>
                    </div>
                )}
            </main>

            {/* Footer with Branding */}
            <footer className="py-12 border-t border-border/50 relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-primary/5 rounded-full blur-[100px] -z-10" />
                <div className="max-w-4xl mx-auto px-6 flex flex-col items-center gap-6">
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border shadow-soft">
                        <div className="premium-gradient p-2 rounded-lg text-white">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col text-left">
                            <span className="text-sm font-black tracking-tighter leading-none">ANTIGRAVITY ENGINE</span>
                            <span className="text-[8px] font-bold text-primary uppercase tracking-[0.2em] mt-1">Autonomous Execution OS</span>
                        </div>
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.3em]">
                        &copy; 2026 Deepmind Antigravity Division • Secure Production Environment
                    </p>
                </div>
            </footer>

            {/* Input Modal */}
            {inputModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={() => setInputModal(prev => ({ ...prev, isOpen: false }))} />
                    <div className="relative w-full max-w-lg bg-card border border-border rounded-[2.5rem] p-8 shadow-2xl shadow-black/40 animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-emerald-500" />

                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                                    <Terminal className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight leading-none mb-1">Runtime Parameters</h3>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{inputModal.label}</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-xl hover:bg-muted"
                                onClick={() => setInputModal(prev => ({ ...prev, isOpen: false }))}
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="space-y-6">
                            {inputModal.inputs.map((input) => (
                                <div key={input.key} className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-1 flex items-center justify-between">
                                        {input.label}
                                        <Badge variant="outline" className="text-[8px] h-4 px-1.5 opacity-50">{input.type}</Badge>
                                    </label>
                                    <Input
                                        type={input.type === 'number' ? 'number' : 'text'}
                                        value={inputValues[input.key] || ''}
                                        onChange={(e) => setInputValues(prev => ({ ...prev, [input.key]: e.target.value }))}
                                        placeholder={`Enter ${input.label.toLowerCase()}...`}
                                        className="h-12 bg-background border-border rounded-xl font-medium focus:ring-primary/20"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="mt-10 flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px]"
                                onClick={() => setInputModal(prev => ({ ...prev, isOpen: false }))}
                            >
                                Abort
                            </Button>
                            <Button
                                className="flex-[2] h-14 rounded-2xl premium-gradient text-white shadow-premium font-black uppercase tracking-widest text-[10px]"
                                onClick={() => executeWorkflow(inputModal.workflowId, inputModal.pageWorkflowId, inputValues)}
                                disabled={runningWorkflows[inputModal.pageWorkflowId]}
                            >
                                {runningWorkflows[inputModal.pageWorkflowId] ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <Play className="w-4 h-4 mr-2 fill-current" />
                                        Confirm Launch
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Log Viewer Overlay */}
            {activeExecutionId && (
                <div className="fixed bottom-8 right-8 z-[90] w-full max-w-2xl animate-in slide-in-from-right-8 duration-500">
                    <div className="bg-[#0a0a0c] border border-primary/30 rounded-3xl shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)] overflow-hidden flex flex-col h-[500px]">
                        <div className="bg-muted/30 p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-2 h-2 rounded-full shadow-[0_0_10px_rgba(var(--primary-rgb),1)]",
                                    executionStatus === 'RUNNING' ? "bg-primary animate-pulse" :
                                        executionStatus === 'SUCCESS' ? "bg-emerald-500" : "bg-destructive"
                                )} />
                                <div className="flex flex-col">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary leading-none">Live Execution Trace</h4>
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mt-1">ID: {activeExecutionId.slice(0, 8)}...</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge className={cn(
                                    "text-[9px] font-black uppercase px-2 h-5 flex items-center shadow-inner",
                                    executionStatus === 'RUNNING' ? "bg-primary/20 text-primary border-primary/30" :
                                        executionStatus === 'SUCCESS' ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" :
                                            "bg-destructive/20 text-destructive border-destructive/30"
                                )}>
                                    {executionStatus}
                                </Badge>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg hover:bg-white/5"
                                    onClick={() => {
                                        setActiveExecutionId(null);
                                        setExecutionLogs('');
                                        setExecutionStatus(null);
                                    }}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-white/10">
                            {executionLogs.split('\n').map((line, i) => (
                                <div key={i} className={cn(
                                    "py-0.5",
                                    line.includes('ERROR') || line.includes('FAILED') ? "text-rose-400" :
                                        line.includes('SUCCESS') ? "text-emerald-400" :
                                            line.includes('STEP') ? "text-primary font-bold mt-2" :
                                                line.includes('GROUP') ? "text-amber-400 font-bold mt-4 border-b border-white/5 pb-1" :
                                                    "text-zinc-400"
                                )}>
                                    {line}
                                </div>
                            ))}
                            {executionStatus === 'RUNNING' && (
                                <div className="flex items-center gap-2 mt-4 text-primary animate-pulse font-bold">
                                    <span className="w-1.5 h-4 bg-primary" />
                                    <span>WAITING FOR NEXT TELEMETRY PACKET...</span>
                                </div>
                            )}
                        </div>
                        <div className="p-3 bg-black/40 border-t border-white/5 flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                            <div className="flex items-center gap-2">
                                <Terminal className="w-3 h-3 text-primary" />
                                <span>Secure Log Stream</span>
                            </div>
                            <span>v4.2-Live</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PublicPageView;
