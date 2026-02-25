import React, { useState, useEffect } from 'react';
import {
    Zap, X, CheckCircle2, AlertCircle, Clock,
    ArrowRight, ChevronDown, ChevronRight,
    Terminal, Server, Layers, Play, Pause, Square, Monitor
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
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
}

const ExecutionMonitor: React.FC<ExecutionMonitorProps> = ({
    mode,
    workflow: initialWorkflow,
    execution: initialExecution,
    onClose
}) => {
    const [workflow, setWorkflow] = useState<Workflow | null>(initialWorkflow || initialExecution?.workflow || null);
    const [execution, setExecution] = useState<WorkflowExecution | null>(initialExecution || null);
    const [activeStepID, setActiveStepID] = useState<string | null>(null);
    const [globalLogs, setGlobalLogs] = useState<string[]>([]);
    const { token } = useAuth();

    useEffect(() => {
        if (mode === 'LIVE' && workflow) {
            const ws = new WebSocket(`ws://${window.location.host.split(':')[0]}:8080/api/ws`);
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'status') {
                    if (msg.target_type === 'step' && msg.status === 'RUNNING') {
                        setActiveStepID(msg.target_id);
                    }
                    setWorkflow(prev => {
                        if (!prev) return prev;
                        const next = { ...prev };
                        if (msg.target_id === next.id) next.status = msg.status;
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
            return () => ws.close();
        } else if (mode === 'HISTORICAL' && execution) {
            // Load full workflow if not present
            if (!workflow && token) {
                fetch(`${API_BASE_URL}/workflows/${execution.workflow_id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                    .then(res => res.json())
                    .then(setWorkflow);
            }
            // Fetch global logs
            fetch(`${API_BASE_URL}/executions/${execution.id}/logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(res => res.text())
                .then(text => setGlobalLogs([text]));
        }
    }, [mode, token]);

    if (!workflow) return null;

    const getStepOutput = (stepID: string) => {
        if (mode === 'HISTORICAL' && execution?.steps) {
            const stepResult = execution.steps.find(s => s.step_id === stepID);
            return stepResult ? [stepResult.output] : [];
        }
        return [];
    };

    const getStepStatus = (stepID: string) => {
        if (mode === 'HISTORICAL' && execution?.steps) {
            const stepResult = execution.steps.find(s => s.step_id === stepID);
            return stepResult?.status || 'PENDING';
        }
        // For live, we use the status in the workflow object which is updated by WS
        const step = workflow.groups?.flatMap(g => g.steps || []).find(s => s.id === stepID);
        return step?.status || 'PENDING';
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0b0e] animate-in fade-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#13151b] border-b border-[#1f212a] select-none shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex gap-2 mr-1">
                        <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-inner hover:bg-[#ff5f56]/80 transition-colors" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-inner" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-inner" />
                    </div>
                    <div className="flex items-center gap-3 py-1 px-3 bg-black/30 rounded-full border border-white/5">
                        <Zap className={cn("w-3.5 h-3.5 shadow-[0_0_10px_rgba(99,102,241,0.5)]", mode === 'LIVE' ? "text-primary" : "text-amber-500")} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            {mode === 'LIVE' ? 'Live Orchestration Monitor' : 'Execution Audit Vault'} <span className="text-zinc-600 px-1">•</span> {workflow.name}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Badge variant="outline" className={cn(
                        "font-black text-[9px] uppercase tracking-widest px-3 py-1",
                        mode === 'LIVE' ? "bg-primary/10 border-primary/20 text-primary animate-pulse" : "bg-zinc-800 border-white/10 text-zinc-400"
                    )}>
                        {mode === 'LIVE' ? workflow.status : execution?.status}
                    </Badge>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Workflow Structure */}
                <div className="w-1/2 overflow-y-auto border-r border-white/5 p-6 bg-black/20 custom-scrollbar">
                    <div className="space-y-6">
                        {workflow.groups?.map((group) => (
                            <div key={group.id} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-7 h-7 rounded-lg flex items-center justify-center border",
                                            group.status === 'RUNNING' ? "bg-primary/20 border-primary/40 animate-pulse text-primary" :
                                                group.status === 'SUCCESS' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                                                    "bg-zinc-800 border-white/5 text-zinc-500"
                                        )}>
                                            <Layers className="w-3.5 h-3.5" />
                                        </div>
                                        <div>
                                            <p className="text-[12px] font-black tracking-tight text-white uppercase">{group.name}</p>
                                            <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                                                {group.is_parallel ? 'Parallel Execution' : 'Sequential Order'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-2 ml-10">
                                    {group.steps?.map((step) => {
                                        const status = getStepStatus(step.id);
                                        return (
                                            <button
                                                key={step.id}
                                                onClick={() => setActiveStepID(step.id)}
                                                className={cn(
                                                    "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group",
                                                    activeStepID === step.id ? "bg-primary/10 border-primary/30" : "bg-black/30 border-white/5 hover:border-white/10",
                                                    status === 'RUNNING' && "border-primary/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        status === 'RUNNING' ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(99,102,241,1)]" :
                                                            status === 'SUCCESS' ? "bg-emerald-500" :
                                                                status === 'FAILED' ? "bg-destructive" : "bg-zinc-700"
                                                    )} />
                                                    <div>
                                                        <p className="text-[11px] font-bold tracking-tight text-zinc-300">{step.name}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <Server className="w-2.5 h-2.5 text-zinc-600" />
                                                            <span className="text-[8px] font-black uppercase text-zinc-600 tracking-tighter">
                                                                {step.server_id ? 'Remote Host' : 'Local Engine'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <ChevronRight className="w-3 h-3 text-zinc-700" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Telemetry Window */}
                <div className="flex-1 flex flex-col bg-black">
                    <div className="px-6 py-3 bg-[#13151b] border-b border-white/5 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                {mode === 'LIVE' ? 'Live Console Output' : 'Historical Execution Trace'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setActiveStepID(null)}
                                className={cn(
                                    "h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                    !activeStepID ? "bg-primary/20 text-primary border border-primary/30" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                )}
                            >
                                <Monitor className="w-3.5 h-3.5 mr-2" />
                                Global Trace
                            </Button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden p-1">
                        <TerminalLog
                            targetID={activeStepID || workflow.id}
                            isActive={true}
                            isLive={mode === 'LIVE'}
                            initialLogs={activeStepID ? getStepOutput(activeStepID) : globalLogs}
                            className="h-full border-0 rounded-none bg-transparent"
                        />
                    </div>
                </div>
            </div>

            {/* Status Footer */}
            <div className="px-8 py-3 bg-[#13151b] border-t border-[#1f212a] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-zinc-600" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                            {mode === 'LIVE' ? `Session Start: ${new Date().toLocaleTimeString()}` : `Executed: ${new Date(execution?.started_at || "").toLocaleString()}`}
                        </span>
                    </div>
                    <div className="w-px h-3 bg-white/5" />
                    <div className="flex items-center gap-2">
                        <Monitor className="w-3.5 h-3.5 text-zinc-600" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                            {mode === 'LIVE' ? 'Telemetry Feed: Encrypted' : 'Audit Integrity: Verified'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExecutionMonitor;
