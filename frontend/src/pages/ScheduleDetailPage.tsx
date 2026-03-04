import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Calendar, Clock, Play, Pause, ArrowLeft, Zap,
    History, FileText, CheckCircle2, XCircle, Loader2,
    ChevronRight, Settings, Box
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Schedule, WorkflowExecution, Workflow } from '../types';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import {
    Dialog,
    DialogContent,
} from '../components/ui/dialog';
import ExecutionMonitor from '../components/ExecutionMonitor';
import WorkflowRunner from '../components/WorkflowRunner';

const ScheduleDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { apiFetch } = useAuth();
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedExec, setSelectedExec] = useState<WorkflowExecution | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const fetchData = async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const [schedRes, execRes] = await Promise.all([
                apiFetch(`${API_BASE_URL}/schedules/${id}`),
                apiFetch(`${API_BASE_URL}/schedules/${id}/executions`)
            ]);

            if (schedRes.ok) setSchedule(await schedRes.json());
            if (execRes.ok) setExecutions(await execRes.json());
        } catch (error) {
            console.error('Failed to fetch schedule data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    const handleToggleStatus = async () => {
        if (!schedule) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/schedules/${schedule.id}/toggle`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchData();
            }
        } catch (error) {
            console.error('Failed to toggle schedule status:', error);
        }
    };

    const fetchExecutionDetail = async (exec: WorkflowExecution) => {
        try {
            setLoadingDetail(true);
            const response = await apiFetch(`${API_BASE_URL}/executions/${exec.id}`);
            if (response.ok) {
                const data = await response.json();
                setSelectedExec(data);
            }
        } catch (error) {
            console.error('Failed to fetch execution detail:', error);
        } finally {
            setLoadingDetail(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Success</Badge>;
            case 'FAILED':
                return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
            case 'RUNNING':
                return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running</Badge>;
            default:
                return <Badge variant="outline" className="opacity-50">{status}</Badge>;
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unloading Schedule Details...</p>
            </div>
        );
    }

    if (!schedule) return <div className="p-8 text-white">Schedule not found.</div>;

    return (
        <WorkflowRunner>
            {(runWorkflow) => (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/schedules')}
                                className="h-10 w-10 rounded-xl bg-card border border-border hover:bg-muted"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-black tracking-tight text-white uppercase">{schedule.name}</h1>
                                    <Badge variant="outline" className={cn(
                                        "font-black text-[10px] uppercase tracking-widest px-3 py-1",
                                        schedule.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-zinc-800 text-zinc-500 border-white/5"
                                    )}>
                                        {schedule.status}
                                    </Badge>
                                </div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                                    Schedule ID: {schedule.id}
                                </p>
                                {schedule.tags && schedule.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {schedule.tags.map(tag => (
                                            <span
                                                key={tag.id}
                                                className="px-2 py-0.5 rounded text-[10px] font-bold border"
                                                style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
                                            >
                                                {tag.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Config Sidebar */}
                        <div className="lg:col-span-1 space-y-6">
                            <Card className="bg-card border-border shadow-premium overflow-hidden rounded-2xl">
                                <div className="p-5 border-b border-border bg-muted/30">
                                    <div className="flex items-center gap-2">
                                        <Settings className="w-4 h-4 text-primary" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Configuration</span>
                                    </div>
                                </div>
                                <CardContent className="p-6 space-y-6">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase">Type</span>
                                            <Badge variant="outline" className="font-black text-[10px]">{schedule.type}</Badge>
                                        </div>
                                        {schedule.type === 'RECURRING' && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-bold text-muted-foreground uppercase">Cron</span>
                                                <code className="text-[10px] font-mono font-bold text-indigo-400">{schedule.cron_expression}</code>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase">Max Retries</span>
                                            <span className="text-xs font-black text-amber-500">{schedule.retries}x</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase">Next Run</span>
                                            <span className="text-[11px] font-black text-white">
                                                {schedule.next_run_at ? format(new Date(schedule.next_run_at), 'MMM d, HH:mm:ss') : 'N/A'}
                                            </span>
                                        </div>
                                        <div className="h-px bg-white/5 my-2" />
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase">
                                                {schedule.type === 'ONE_TIME' ? 'Execution Status' : 'Total Runs'}
                                            </span>
                                            {schedule.type === 'ONE_TIME' ? (
                                                <Badge variant="outline" className={cn(
                                                    "font-black text-[9px] uppercase tracking-widest px-2 py-0.5",
                                                    schedule.total_runs > 0 ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-zinc-800 text-zinc-500 border-white/5"
                                                )}>
                                                    {schedule.total_runs > 0 ? 'EXECUTED' : 'PENDING'}
                                                </Badge>
                                            ) : (
                                                <span className="text-xs font-black text-emerald-500">{schedule.total_runs} runs</span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-muted-foreground uppercase">Last Result</span>
                                            {schedule.last_run_status ? (
                                                <Badge className={cn(
                                                    "font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-md",
                                                    schedule.last_run_status === 'SUCCESS' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                        schedule.last_run_status === 'FAILED' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                            "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                )}>
                                                    {schedule.last_run_status}
                                                </Badge>
                                            ) : (
                                                <span className="text-[10px] font-medium text-muted-foreground/40 italic">Never run</span>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-card border-border shadow-premium overflow-hidden rounded-2xl">
                                <div className="p-5 border-b border-border bg-muted/30">
                                    <div className="flex items-center gap-2">
                                        <Box className="w-4 h-4 text-primary" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Target Workflows</span>
                                    </div>
                                </div>
                                <CardContent className="p-4 space-y-3">
                                    {(schedule.scheduled_workflows && schedule.scheduled_workflows.length > 0) ? (
                                        schedule.scheduled_workflows.map(sw => (
                                            <div key={sw.id} className="flex flex-col gap-2 p-3 rounded-xl bg-muted/20 border border-white/5 hover:bg-muted/30 transition-all group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                        <Zap className="w-4 h-4" />
                                                    </div>
                                                    <span className="text-xs font-black text-zinc-300 uppercase tracking-tight">{sw.workflow?.name || 'Unknown Workflow'}</span>
                                                </div>
                                                {sw.inputs && sw.inputs !== "{}" && (
                                                    <div className="pl-11 pr-2 pb-1">
                                                        <p className="text-[9px] font-medium text-muted-foreground break-all bg-black/20 p-2 rounded-lg border border-white/5">
                                                            <span className="text-[8px] font-black uppercase opacity-40 block mb-1">Configured Inputs</span>
                                                            {sw.inputs}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-8 text-center bg-muted/10 rounded-xl border border-dashed border-white/5">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-40">No workflows configured</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* History Main */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <History className="w-5 h-5 text-primary" />
                                    <h2 className="text-xl font-black tracking-tight text-white uppercase">Execution History</h2>
                                </div>
                                <Badge className="bg-primary/10 text-primary border-primary/20 font-black text-[10px] uppercase">
                                    {executions.length} Runs Total
                                </Badge>
                            </div>

                            <div className="space-y-3">
                                {executions.length === 0 ? (
                                    <div className="py-20 flex flex-col items-center justify-center bg-card/50 rounded-3xl border border-dashed border-border border-white/5">
                                        <History className="w-12 h-12 text-muted-foreground/20 mb-4" />
                                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">No historical traces detected</p>
                                    </div>
                                ) : executions.map((exec) => (
                                    <Card
                                        key={exec.id}
                                        className="bg-card hover:bg-muted/50 border-border/50 hover:border-primary/20 transition-all duration-300 cursor-pointer group shadow-sm"
                                        onClick={() => fetchExecutionDetail(exec)}
                                    >
                                        <CardContent className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center border",
                                                    exec.status === 'SUCCESS' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                                                        exec.status === 'FAILED' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                                            'bg-blue-500/10 border-blue-500/20 text-blue-500'
                                                )}>
                                                    <Zap className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <h3 className="font-bold text-sm text-foreground uppercase tracking-tight">{exec.workflow?.name}</h3>
                                                        {getStatusBadge(exec.status)}
                                                    </div>
                                                    <div className="flex gap-4 mt-1 opacity-60">
                                                        <span className="text-[9px] font-bold uppercase flex items-center gap-1.5 font-mono">
                                                            #{exec.id.slice(0, 8)}
                                                        </span>
                                                        <span className="text-[9px] font-bold uppercase flex items-center gap-1.5">
                                                            <Calendar className="w-2.5 h-2.5" />
                                                            {format(new Date(exec.started_at), 'MMM d, HH:mm:ss')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-zinc-700" />
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </div>

                    <Dialog open={!!selectedExec} onOpenChange={(open) => !open && setSelectedExec(null)}>
                        <DialogContent className="max-w-5xl w-[90vw] h-[85vh] p-0 overflow-hidden bg-slate-950 border-white/10">
                            {loadingDetail ? (
                                <div className="h-full flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            ) : selectedExec && (
                                <ExecutionMonitor
                                    mode="HISTORICAL"
                                    execution={selectedExec}
                                    onClose={() => setSelectedExec(null)}
                                    onReRun={(wf, inputs) => runWorkflow({ ...wf, id: selectedExec.workflow_id }, inputs)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </div >
            )}
        </WorkflowRunner >
    );
};

export default ScheduleDetailPage;
