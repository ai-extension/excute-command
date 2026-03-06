import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
    Zap, Loader2, Monitor, Terminal, Clock, Sun, Moon, Copy, Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Page, PageWidget, PageLayout, WorkflowInput } from '../types';
import { Button } from '../components/ui/button';
import WorkflowInputDialog from '../components/WorkflowInputDialog';
import { API_BASE_URL } from '../lib/api';

// Extracted Components
import PasswordProtection from '../components/PasswordProtection';
import TerminalWidget from '../components/public/TerminalWidget';
import EndpointWidget from '../components/public/EndpointWidget';
import PageExecutionTerminal from '../components/public/PageExecutionTerminal';

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

    const closeInputModal = () => {
        setInputModal({ isOpen: false, widget: null, workflowInputs: [] });
    };

    // Log Streaming State
    const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
    const [executionLogs, setExecutionLogs] = useState<string>('');
    const [executionStatus, setExecutionStatus] = useState<string | null>(null);
    const [isPollingLogs, setIsPollingLogs] = useState(false);
    const [terminalState, setTerminalState] = useState<'normal' | 'minimized' | 'maximized'>('normal');
    const [publicTheme, setPublicTheme] = useState<'light' | 'dark'>(() => {
        return (localStorage.getItem('public-theme') as 'light' | 'dark') || 'dark';
    });
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        localStorage.setItem('public-theme', publicTheme);
        // Direct manipulation of document element to override global ThemeProvider
        if (publicTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [publicTheme]);

    // Restore admin theme when leaving public page
    useEffect(() => {
        const originalTheme = localStorage.getItem('theme') || 'dark';
        return () => {
            if (originalTheme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };
    }, []);

    const togglePublicTheme = () => {
        setPublicTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const copyPublicUrl = () => {
        navigator.clipboard.writeText(window.location.href);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

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

    const [completionAlert, setCompletionAlert] = useState<{ show: boolean, status: string, message: string } | null>(null);

    // Auto-close completion alert
    useEffect(() => {
        if (completionAlert?.show) {
            const timer = setTimeout(() => {
                setCompletionAlert(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [completionAlert]);

    // Logs Polling
    useEffect(() => {
        if (!activeExecutionId || !isAuthorized) return;
        let isMounted = true;
        const poll = setInterval(async () => {
            try {
                const headers: Record<string, string> = {};
                if (pageToken) headers['X-Page-Token'] = pageToken;
                const sRes = await fetch(`${API_BASE_URL}/public/pages/${slug}/executions/${activeExecutionId}`, { headers });

                if (sRes.status === 401) {
                    setTokenExpired(true);
                    setIsAuthorized(false);
                    setIsPollingLogs(false);
                    return;
                }

                const sData = await sRes.json();
                if (isMounted) {
                    const prevStatus = executionStatus;
                    const newStatus = sData.status;
                    setExecutionStatus(newStatus);

                    if (newStatus === 'SUCCESS' || newStatus === 'FAILED') {
                        setIsPollingLogs(false);
                        clearInterval(poll);

                        if (prevStatus === 'RUNNING' || prevStatus === 'PENDING') {
                            setCompletionAlert({
                                show: true,
                                status: newStatus,
                                message: newStatus === 'SUCCESS' ? 'Workflow executed successfully!' : 'Workflow execution failed.'
                            });
                        }
                    }
                }
                const lRes = await fetch(`${API_BASE_URL}/public/pages/${slug}/executions/${activeExecutionId}/logs`, { headers });
                const lData = await lRes.text();
                if (isMounted) setExecutionLogs(lData);
            } catch (err) { }
        }, 2000);
        return () => { isMounted = false; clearInterval(poll); };
    }, [activeExecutionId, slug, isAuthorized, pageToken, executionStatus]);

    const runWidget = async (widget: PageWidget, inputs: Record<string, string> = {}) => {
        if (widget.type !== 'ENDPOINT' || !widget.workflow_id) {
            setExecutionResults(prev => ({ ...prev, [widget.id]: { success: false, message: 'INVALID CONFIG' } }));
            return;
        }

        const pw = page?.workflows?.find(p => p.workflow_id === widget.workflow_id);
        const workflowInputs = pw?.workflow?.inputs || [];

        if (workflowInputs.length > 0 && Object.keys(inputs).length === 0) {
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

            if (response.status === 401) {
                setTokenExpired(true); setIsAuthorized(false);
                return;
            }

            const data = await response.json();
            if (response.ok) {
                setExecutionResults(prev => ({ ...prev, [widget.id]: { success: true, message: 'SUCCESS' } }));
                if (widget.show_log) {
                    setActiveExecutionId(data.execution_id);
                    setExecutionLogs('Initializing trace...');
                    setExecutionStatus('RUNNING');
                    setIsPollingLogs(true);
                    setTerminalState('normal');
                } else {
                    setCompletionAlert({
                        show: true,
                        status: 'SUCCESS',
                        message: 'Workflow executed successfully!'
                    });
                }
            } else {
                setExecutionResults(prev => ({ ...prev, [widget.id]: { success: false, message: data.error || 'FAILED' } }));
                setCompletionAlert({
                    show: true,
                    status: 'FAILED',
                    message: `Execution failed: ${data.error || 'Unknown error'}`
                });
            }
        } catch (err) {
            setExecutionResults(prev => ({ ...prev, [widget.id]: { success: false, message: 'ERROR' } }));
            setCompletionAlert({
                show: true,
                status: 'FAILED',
                message: 'Error connecting to server.'
            });
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
            <PasswordProtection
                pageTitle={page?.title || ''}
                password={password}
                setPassword={setPassword}
                onSubmit={handlePasswordSubmit}
                isVerifying={isVerifying}
                error={error}
                tokenExpired={tokenExpired}
            />
        );
    }

    return (
        <div className="min-h-screen transition-colors duration-300">
            <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 pb-20">
                <header className="fixed top-0 left-0 right-0 h-1 bg-primary z-50 shadow-lg" />

                {/* Floating Navigation / Auth / Theme Tools */}
                <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-10 w-10 rounded-xl glass shadow-premium border-white/10"
                        onClick={copyPublicUrl}
                        title="Copy Public Link"
                    >
                        {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-10 w-10 rounded-xl glass shadow-premium border-white/10"
                        onClick={togglePublicTheme}
                        title={`Switch to ${publicTheme === 'dark' ? 'light' : 'dark'} mode`}
                    >
                        {publicTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                    </Button>
                </div>

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
                                return (
                                    <EndpointWidget
                                        key={widget.id}
                                        widget={widget}
                                        isRunning={runningWidgets[widget.id]}
                                        result={executionResults[widget.id]}
                                        onRun={runWidget}
                                    />
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

                <WorkflowInputDialog
                    isOpen={inputModal.isOpen}
                    onOpenChange={(open) => !open && closeInputModal()}
                    inputs={inputModal.workflowInputs}
                    confirmLabel="Confirm & Launch"
                    onConfirm={(values) => {
                        if (inputModal.widget) {
                            runWidget(inputModal.widget, values);
                        }
                    }}
                    onCancel={closeInputModal}
                />

                <PageExecutionTerminal
                    activeExecutionId={activeExecutionId}
                    executionStatus={executionStatus}
                    executionLogs={executionLogs}
                    terminalState={terminalState}
                    setTerminalState={setTerminalState}
                    onClose={() => setActiveExecutionId(null)}
                />
            </div>
        </div>
    );
};

export default PublicPageView;
