import React, { useState, useEffect, useRef } from 'react';
import {
    History,
    Clock,
    CheckCircle2,
    Loader2,
    Calendar,
    ChevronRight,
    CalendarClock,
    RefreshCw,
    ChevronDown,
    Zap,
    FileText,
    Plus,
    XCircle
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
    Dialog,
    DialogContent
} from './ui/dialog';
import { WorkflowExecution } from '../types';
import { format } from 'date-fns';
import { API_BASE_URL } from '../lib/api';
import ExecutionMonitor from './ExecutionMonitor';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

const PAGE_SIZE = 20;

interface WorkflowHistoryProps {
    workflowId: string;
    onReRun?: (workflow: any, inputs: Record<string, string>) => void;
}

const WorkflowHistory: React.FC<WorkflowHistoryProps> = ({ workflowId, onReRun }) => {
    const { apiFetch } = useAuth();
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [total, setTotal] = useState(0);
    const offsetRef = useRef(0);
    const [selectedExec, setSelectedExec] = useState<WorkflowExecution | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const loadPage = async (currentOffset: number, replace = false) => {
        if (replace) setLoading(true);
        else setLoadingMore(true);

        try {
            const response = await apiFetch(
                `${API_BASE_URL}/workflows/${workflowId}/executions?limit=${PAGE_SIZE}&offset=${currentOffset}`
            );
            if (response.ok) {
                const data = await response.json();
                const items: WorkflowExecution[] = Array.isArray(data) ? data : (data.items || []);
                const totalCount: number = Array.isArray(data) ? data.length : (data.total || 0);
                setTotal(totalCount);
                setExecutions(prev => replace ? items : [...prev, ...items]);
                offsetRef.current = currentOffset + items.length;
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const refresh = () => {
        offsetRef.current = 0;
        setExecutions([]);
        setTotal(0);
        loadPage(0, true);
    };

    useEffect(() => {
        if (workflowId) refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workflowId]);

    const fetchExecutionDetail = async (exec: WorkflowExecution) => {
        try {
            setLoadingDetail(true);
            const response = await apiFetch(`${API_BASE_URL}/executions/${exec.id}`);
            if (response.ok) setSelectedExec(await response.json());
        } catch (error) {
            console.error('Failed to fetch execution detail:', error);
        } finally {
            setLoadingDetail(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Success</Badge>;
            case 'FAILED':
                return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
            case 'RUNNING':
                return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getTriggerBadge = (exec: WorkflowExecution) => {
        switch (exec.trigger_source) {
            case 'SCHEDULE':
                return (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5">
                        <Calendar className="w-3 h-3 mr-1" /> Scheduled
                    </Badge>
                );
            case 'PAGE':
                return (
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5">
                        <FileText className="w-3 h-3 mr-1" /> Page: {exec.page?.title || 'Public'}
                    </Badge>
                );
            case 'HOOK':
                return (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5">
                        <Zap className="w-3 h-3 mr-1" /> Hook
                    </Badge>
                );
            case 'STEP':
                return (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5">
                        <Zap className="w-3 h-3 mr-1" /> Step Action
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5">
                        <Plus className="w-3 h-3 mr-1" /> Manual
                    </Badge>
                );
        }
    };

    const getDuration = (start: string, end?: string) => {
        if (!end) return 'Running...';
        const diff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
        if (diff < 60) return `${diff}s`;
        return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    };

    const hasMore = executions.length < total;

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-emerald-500" />
                    <h3 className="font-semibold text-sm">Execution History</h3>
                    {total > 0 && (
                        <Badge variant="outline" className="text-[9px] font-black px-1.5 py-0">
                            {total} runs
                        </Badge>
                    )}
                </div>
                <Button variant="ghost" size="sm" onClick={refresh} className="gap-1 text-xs">
                    <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
            </div>

            {executions.length === 0 ? (
                <div className="text-center py-12 bg-white/5 border border-dashed rounded-lg">
                    <History className="w-8 h-8 mx-auto text-muted-foreground animate-pulse mb-2" />
                    <p className="text-sm text-muted-foreground">No execution history found for this workflow.</p>
                </div>
            ) : (
                <div className="space-y-2 px-1">
                    {executions.map((exec) => (
                        <Card
                            key={exec.id}
                            className="bg-white/5 border-white/10 hover:bg-white/[0.08] transition-colors cursor-pointer group overflow-hidden"
                            onClick={() => fetchExecutionDetail(exec)}
                        >
                            <CardContent className="p-3 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-1 h-10 rounded-full shrink-0",
                                        exec.status === 'SUCCESS' ? 'bg-green-500' :
                                            exec.status === 'FAILED' ? 'bg-red-500' : 'bg-blue-500'
                                    )} />
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-mono text-muted-foreground">#{exec.id.slice(0, 8)}</span>
                                            {getStatusBadge(exec.status)}
                                            {getTriggerBadge(exec)}
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {format(new Date(exec.started_at), 'MMM d, HH:mm:ss')}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {getDuration(exec.started_at, exec.finished_at)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                            </CardContent>
                        </Card>
                    ))}

                    {/* Load More button */}
                    {hasMore && (
                        <div className="pt-2 flex justify-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => loadPage(offsetRef.current)}
                                disabled={loadingMore}
                                className="gap-2 border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 font-bold text-xs"
                            >
                                {loadingMore ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                )}
                                {loadingMore ? 'Loading...' : `Load more (${total - executions.length} remaining)`}
                            </Button>
                        </div>
                    )}
                    {!hasMore && executions.length >= PAGE_SIZE && (
                        <p className="text-center text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest pt-2">
                            All {total} runs loaded
                        </p>
                    )}
                </div>
            )}

            <Dialog open={!!selectedExec} onOpenChange={(open: boolean) => !open && setSelectedExec(null)}>
                <DialogContent hideClose className="max-w-5xl w-[90vw] h-[85vh] p-0 overflow-hidden bg-slate-950 border-white/10">
                    {loadingDetail ? (
                        <div className="h-full flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : selectedExec && (
                        <ExecutionMonitor
                            mode="HISTORICAL"
                            execution={selectedExec}
                            onClose={() => setSelectedExec(null)}
                            onReRun={onReRun}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default WorkflowHistory;
