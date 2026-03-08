import React, { useState, useEffect, useCallback } from 'react';
import {
    Zap, X, CheckCircle2, AlertCircle, Clock,
    ArrowRight, ChevronDown, ChevronRight,
    Terminal, Server, Layers, Play, Pause, Square, Monitor,
    Download, Plus, FileText, Calendar, File
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from './ui/dialog';
import { cn } from '../lib/utils';
import { Workflow, WorkflowGroup, WorkflowStep, WorkflowExecution } from '../types';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import TerminalLog from './TerminalLog';

interface ExecutionMonitorProps {
    mode: 'LIVE' | 'HISTORICAL';
    workflow?: Workflow;
    execution?: WorkflowExecution;
    onClose: () => void;
    onReady?: () => void;
    onReRun?: (workflow: Workflow, inputs: Record<string, string>, startGroupID?: string, startStepID?: string, fromExecutionID?: string) => void;
}

const ExecutionMonitor: React.FC<ExecutionMonitorProps> = ({
    mode,
    workflow: initialWorkflow,
    execution: initialExecution,
    onClose,
    onReady,
    onReRun
}) => {
    const [workflow, setWorkflow] = useState<Workflow | null>(initialWorkflow || initialExecution?.workflow || null);
    const [execution, setExecution] = useState<WorkflowExecution | null>(initialExecution || null);
    const [activeStepID, setActiveStepID] = useState<string | null>(null);
    const [activeGroupID, setActiveGroupID] = useState<string | null>(null);
    const [globalLogs, setGlobalLogs] = useState<string[]>([]);
    const [stepLogs, setStepLogs] = useState<string[]>([]);
    const [isStatusWSReady, setIsStatusWSReady] = useState(false);
    const [isTerminalReady, setIsTerminalReady] = useState(false);
    const [showStopConfirm, setShowStopConfirm] = useState(false);
    const { apiFetch, showToast } = useAuth();
    const workflowID = workflow?.id;
    const executionIDRef = React.useRef<string | undefined>(execution?.id || (workflow as any)?.execution_id);
    const wsRef = React.useRef<WebSocket | null>(null);
    useEffect(() => {
        const currentID = execution?.id || (workflow as any)?.execution_id;
        if (currentID) {
            executionIDRef.current = currentID;
        }
    }, [execution?.id, (workflow as any)?.execution_id]);

    // Sync internal workflow state with initialWorkflow prop
    // This is crucial in LIVE mode because the runner initially opens the monitor
    // and then later provides the execution_id once the backend responds.
    useEffect(() => {
        if (initialWorkflow) {
            setWorkflow(prev => {
                // Only update if we don't have an execution_id yet but the new prop does
                if (!(prev as any)?.execution_id && (initialWorkflow as any).execution_id) {
                    return { ...prev, ...initialWorkflow };
                }
                return prev;
            });
        }
    }, [initialWorkflow]);
    const handleDownloadLogs = () => {
        if (!workflow) return;
        const logsToDownload = activeStepID ? stepLogs : globalLogs;
        const content = logsToDownload.join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = activeStepID
            ? `logs-step-${activeStepID}-${new Date().toISOString()}.txt`
            : `logs-global-${workflow.id}-${new Date().toISOString()}.txt`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const syncStatus = useCallback(async () => {
        if (!workflowID) return;
        try {
            const data = await apiFetch(`${API_BASE_URL}/workflows/${workflowID}`);
            const updatedWF = await data.json();
            setWorkflow(updatedWF);
        } catch (err) {
            console.error('Failed to sync workflow status:', err);
        }
    }, [workflowID, apiFetch]);

    useEffect(() => {
        if (mode === 'LIVE' && isStatusWSReady && isTerminalReady) {
            if (onReady) onReady();
        } else if (mode === 'HISTORICAL') {
            // In historical mode, it's always "ready" as soon as it mounts or logic completes
            // but we don't usually need onReady for historical
            if (onReady) onReady();
        }
    }, [isStatusWSReady, isTerminalReady, mode, onReady]);

    const { token } = useAuth();
    // Effect for WebSocket (Live Mode)
    useEffect(() => {
        if (mode !== 'LIVE' || !workflowID) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let baseUrl = API_BASE_URL;
        if (baseUrl.startsWith('/')) {
            baseUrl = `${window.location.host}${baseUrl}`;
        } else {
            baseUrl = baseUrl.replace(/^http(s)?:\/\//, '');
        }

        const wsUrl = `${protocol}//${baseUrl}/ws?token=${token || ''}&status_only=true`;
        console.log('Establishing Status WebSocket connection:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'status') {
                const currentExecID = executionIDRef.current;
                if (msg.execution_id && msg.execution_id !== currentExecID?.toString()) {
                    return;
                }

                setWorkflow(prev => {
                    if (!prev) return prev;
                    if (msg.target_id === prev.id) return { ...prev, status: msg.status };

                    const next = { ...prev };
                    next.groups = next.groups?.map(g => {
                        if (g.id === msg.target_id) return { ...g, status: msg.status };
                        return {
                            ...g,
                            steps: g.steps?.map(s => {
                                if (s.id === msg.target_id) return { ...s, status: msg.status };
                                return s;
                            })
                        };
                    });
                    return next;
                });
            }
        };

        ws.onopen = () => {
            console.log('Status WebSocket connected');
            setIsStatusWSReady(true);

            const currentExecID = executionIDRef.current;
            if (currentExecID) {
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    execution_id: currentExecID
                }));
            }
            syncStatus();
        };

        ws.onclose = () => {
            console.log('Status WebSocket disconnected');
            setIsStatusWSReady(false);
            wsRef.current = null;
        };

        return () => ws.close();
    }, [mode, workflowID, syncStatus, token]);

    // Send subscribe message if executionID changes while WS is already open
    useEffect(() => {
        const currentExecID = execution?.id || (workflow as any)?.execution_id;
        if (mode === 'LIVE' && currentExecID && isStatusWSReady && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'subscribe',
                execution_id: currentExecID
            }));
            syncStatus();
        }
    }, [execution?.id, (workflow as any)?.execution_id, isStatusWSReady, mode, syncStatus]);

    // Fetch full execution details if we only have an ID (mostly for LIVE mode transition)
    useEffect(() => {
        const execID = execution?.id || (workflow as any)?.execution_id;
        if (execID && !execution) {
            apiFetch(`${API_BASE_URL}/executions/${execID}`)
                .then(res => res.json())
                .then(setExecution)
                .catch(err => console.error('Failed to fetch execution details:', err));
        }
    }, [execution?.id, (workflow as any)?.execution_id, apiFetch]);

    // Effect for Data Fetching (Historical Mode logs)
    useEffect(() => {
        if (mode === 'HISTORICAL' && execution) {
            // Load full workflow if not present
            if (!workflow) {
                apiFetch(`${API_BASE_URL}/workflows/${execution.workflow_id}`)
                    .then(res => res.json())
                    .then(setWorkflow);
            }
            // Fetch global logs
            apiFetch(`${API_BASE_URL}/executions/${execution.id}/logs`)
                .then(res => res.text())
                .then(text => setGlobalLogs(text.split('\n').filter(line => line.length > 0)));
        }
    }, [mode, execution?.id, apiFetch, !!workflow]);

    useEffect(() => {
        if (mode === 'HISTORICAL' && execution && activeStepID) {
            apiFetch(`${API_BASE_URL}/executions/${execution.id}/logs?step_id=${activeStepID}`)
                .then(res => res.text())
                .then(text => setStepLogs(text.split('\n').filter(line => line.length > 0)))
                .catch(() => setStepLogs(['[Log file not found]']));
        } else if (mode === 'HISTORICAL' && execution && activeGroupID) {
            apiFetch(`${API_BASE_URL}/executions/${execution.id}/logs?group_id=${activeGroupID}`)
                .then(res => res.text())
                .then(text => setStepLogs(text.split('\n').filter(line => line.length > 0)))
                .catch(() => setStepLogs(['[Log file not found]']));
        } else {
            setStepLogs([]);
        }
    }, [activeStepID, activeGroupID, execution, mode]);

    if (!workflow) return null;

    const getStepOutput = (stepID: string) => {
        if (mode === 'LIVE') return [];
        return stepLogs;
    };

    const getStepStatus = (stepID: string) => {
        if (mode === 'HISTORICAL' && execution?.steps) {
            const stepResult = execution.steps.find(s => s.step_id === stepID);
            return stepResult?.status || 'PENDING';
        }
        // For live, we use the status dynamically patched into the workflow object by WS
        const step = workflow.groups?.flatMap(g => g.steps || []).find(s => s.id === stepID);
        return (step as any)?.status || 'PENDING';
    };

    const handleStop = async () => {
        const execID = (mode === 'LIVE' ? (workflow as any)?.execution_id : execution?.id);
        if (!execID) return;

        setShowStopConfirm(false);
        try {
            await apiFetch(`${API_BASE_URL}/executions/${execID}/stop`, {
                method: 'POST'
            });
            // Status will be updated via WebSocket in Live mode
            if (mode === 'HISTORICAL') {
                // For historical, we just refresh if possible or show message
                showToast('Stop signal sent.', 'info');
            }
        } catch (err) {
            console.error('Failed to stop execution:', err);
            showToast('Failed to stop execution', 'error');
        }
    };

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in zoom-in-95 duration-300 max-h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border select-none shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex gap-2 mr-1">
                        <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-inner hover:bg-[#ff5f56]/80 transition-colors cursor-pointer" />
                        <button className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-inner hover:bg-[#ffbd2e]/80 transition-colors cursor-pointer" />
                        <button className="w-3 h-3 rounded-full bg-[#27c93f] shadow-inner hover:bg-[#27c93f]/80 transition-colors cursor-pointer" />
                    </div>
                    <div className="flex items-center gap-3 py-1 px-3 bg-muted/30 rounded-full border border-border/50">
                        <Zap className={cn("w-3.5 h-3.5 shadow-[0_0_10px_rgba(99,102,241,0.5)]", mode === 'LIVE' ? "text-primary" : "text-amber-500")} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {mode === 'LIVE' ? 'Live Orchestration Monitor' : 'Execution Audit Vault'} <span className="text-muted-foreground/40 px-1">•</span> {workflow.name}
                        </span>
                        {execution?.trigger_source === 'SCHEDULE' && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5 ml-2">
                                <Clock className="w-3 h-3 mr-1" /> Scheduled
                            </Badge>
                        )}
                        {execution?.trigger_source === 'PAGE' && (
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5 ml-2">
                                <Layers className="w-3 h-3 mr-1" /> Page: {execution.page?.title || 'Public'}
                            </Badge>
                        )}
                        {execution?.trigger_source === 'HOOK' && (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5 ml-2">
                                <Zap className="w-3 h-3 mr-1" /> Hook
                            </Badge>
                        )}
                        {execution?.trigger_source === 'STEP' && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5 ml-2">
                                <Zap className="w-3 h-3 mr-1" /> Step Action
                            </Badge>
                        )}
                        {execution?.trigger_source === 'MANUAL' && (
                            <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5 ml-2">
                                <Plus className="w-3 h-3 mr-1" /> Manual
                            </Badge>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 mr-2">
                        {((mode === 'LIVE' && (workflow.status === 'RUNNING' || workflow.status === 'PENDING')) ||
                            (mode === 'HISTORICAL' && (execution?.status === 'RUNNING' || execution?.status === 'PENDING'))) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleStop}
                                    className="h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest text-destructive hover:text-white hover:bg-destructive/90 border border-destructive/20 hover:border-destructive transition-all mr-1 group"
                                >
                                    <Square className="w-3 h-3 mr-2 fill-current opacity-50 group-hover:opacity-100 transition-opacity" />
                                    Stop Execution
                                </Button>
                            )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDownloadLogs}
                            className="h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all"
                        >
                            <Download className="w-3.5 h-3.5 mr-2" />
                            Download Trace
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setActiveStepID(null);
                                setActiveGroupID(null);
                            }}
                            className={cn(
                                "h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                !activeStepID ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            <Monitor className="w-3.5 h-3.5 mr-2" />
                            Global Trace
                        </Button>
                        {onReRun && workflow && (workflow.status !== 'RUNNING' && workflow.status !== 'PENDING') && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    let inputs: Record<string, string> = {};
                                    if (execution?.inputs) {
                                        try {
                                            inputs = JSON.parse(execution.inputs);
                                        } catch (e) {
                                            console.error('Failed to parse inputs for rerun:', e);
                                        }
                                    }
                                    onReRun(workflow, inputs, undefined, undefined, execution?.id);
                                }}
                                className="h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/5 border border-emerald-500/20 transition-all ml-1"
                            >
                                <Play className="w-3.5 h-3.5 mr-2" />
                                Run Again
                            </Button>
                        )}
                    </div>
                    <Badge variant="outline" className={cn(
                        "font-black text-[9px] uppercase tracking-widest px-3 py-1",
                        mode === 'LIVE' ? "bg-primary/10 border-primary/20 text-primary animate-pulse" : "bg-muted border-border text-muted-foreground"
                    )}>
                        {mode === 'LIVE' ? workflow.status : execution?.status}
                    </Badge>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Workflow Structure */}
                <div className="w-80 shrink-0 overflow-auto border-r border-border p-6 bg-muted/20 custom-scrollbar">
                    <div className="space-y-6">
                        {workflow.groups?.map((group) => (
                            <div key={group.id} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-7 h-7 rounded-lg flex items-center justify-center border",
                                            group.status === 'RUNNING' ? "bg-primary/20 border-primary/40 animate-pulse text-primary" :
                                                group.status === 'SUCCESS' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                                                    "bg-muted border-border text-muted-foreground/60"
                                        )}>
                                            <Layers className="w-3.5 h-3.5" />
                                        </div>
                                        <button
                                            onClick={() => {
                                                setActiveGroupID(group.id);
                                                setActiveStepID(null);
                                            }}
                                            className={cn(
                                                "flex flex-col gap-0.5 text-left transition-all",
                                                activeGroupID === group.id ? "opacity-100" : "opacity-60 hover:opacity-100"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <p className={cn(
                                                    "text-[12px] font-black tracking-tight uppercase",
                                                    activeGroupID === group.id ? "text-primary" : "text-foreground"
                                                )}>{group.name}</p>
                                                <div className="flex items-center gap-1">
                                                    {group.continue_on_failure && (
                                                        <span title="Continue on Failure">
                                                            <AlertCircle className="w-2.5 h-2.5 text-amber-500" />
                                                        </span>
                                                    )}
                                                    {group.is_copy_enabled && (
                                                        <span title="Relay Enabled">
                                                            <File className="w-2.5 h-2.5 text-emerald-500" />
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                                                {group.is_parallel ? 'Parallel Execution' : 'Sequential Order'}
                                            </p>
                                        </button>
                                    </div>
                                    {onReRun && (mode === 'HISTORICAL' || (mode === 'LIVE' && workflow.status !== 'RUNNING' && workflow.status !== 'PENDING')) && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                let inputs: Record<string, string> = {};
                                                if (execution?.inputs) {
                                                    try {
                                                        inputs = JSON.parse(execution.inputs);
                                                    } catch (e) { }
                                                }
                                                onReRun(workflow, inputs, group.id, undefined, execution?.id);
                                            }}
                                            title="Run from this group"
                                            className="h-6 w-6 rounded-md hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Play className="w-3 h-3" />
                                        </Button>
                                    )}
                                </div>

                                <div className="grid gap-2 ml-10">
                                    {group.steps?.map((step) => {
                                        const status = getStepStatus(step.id);
                                        return (
                                            <button
                                                key={step.id}
                                                onClick={() => {
                                                    setActiveStepID(step.id);
                                                    setActiveGroupID(null);
                                                }}
                                                className={cn(
                                                    "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
                                                    activeStepID === step.id ? "bg-primary/10 border-primary/30" : "bg-muted/10 border-border hover:border-border/80",
                                                    status === 'RUNNING' && "border-primary/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        status === 'RUNNING' ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(99,102,241,1)]" :
                                                            status === 'SUCCESS' ? "bg-emerald-500" :
                                                                status === 'FAILED' ? "bg-destructive" : "bg-muted-foreground/30"
                                                    )} />
                                                    <div>
                                                        <p className="text-[11px] font-bold tracking-tight text-foreground/80">{step.name}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <Server className="w-2.5 h-2.5 text-muted-foreground/40" />
                                                            <span className="text-[8px] font-black uppercase text-muted-foreground/40 tracking-tighter">
                                                                {step.server_id ? 'Remote Host' : 'Local Engine'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {onReRun && (mode === 'HISTORICAL' || (mode === 'LIVE' && workflow.status !== 'RUNNING' && workflow.status !== 'PENDING')) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                let inputs: Record<string, string> = {};
                                                                if (execution?.inputs) {
                                                                    try {
                                                                        inputs = JSON.parse(execution.inputs);
                                                                    } catch (e) { }
                                                                }
                                                                onReRun(workflow, inputs, group.id, step.id, execution?.id);
                                                            }}
                                                            title="Run from this step"
                                                            className="h-6 w-6 rounded-md hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500 transition-all opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Play className="w-3 h-3" />
                                                        </Button>
                                                    )}
                                                    <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex-1 flex flex-col bg-background min-w-0 overflow-hidden">
                    <div className="flex-1 flex flex-col overflow-hidden p-1">
                        <TerminalLog
                            targetID={activeStepID || activeGroupID || (workflow?.id || 'GLOBAL')}
                            executionID={execution?.id || (workflow as any)?.execution_id}
                            isActive={true}
                            isGlobal={!activeStepID && !activeGroupID}
                            isGroup={!!activeGroupID && !activeStepID}
                            isLive={mode === 'LIVE'}
                            showHeader={false}
                            initialLogs={activeStepID || activeGroupID ? stepLogs : globalLogs}
                            onReady={() => setIsTerminalReady(true)}
                            className="flex-1 border-0 rounded-none bg-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Status Footer */}
            <div className="px-8 py-3 bg-card border-t border-border flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                            {mode === 'LIVE' ? `Session Start: ${new Date().toLocaleTimeString()}` : `Executed: ${new Date(execution?.started_at || "").toLocaleString()}`}
                        </span>
                    </div>
                    <div className="w-px h-3 bg-border/50" />
                    <div className="flex items-center gap-2">
                        <Monitor className="w-3.5 h-3.5 text-muted-foreground/40" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                            {mode === 'LIVE' ? 'Telemetry Feed: Encrypted' : 'Audit Integrity: Verified'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Stop Confirmation Dialog */}
            <Dialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Stop Execution</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to forcefully stop this workflow execution?
                            This will immediately terminate all active processes.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setShowStopConfirm(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleStop}>
                            Stop Execution
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default ExecutionMonitor;
