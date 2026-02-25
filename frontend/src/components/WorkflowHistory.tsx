import React, { useState, useEffect } from 'react';
import {
    History,
    FileText,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    Calendar,
    ChevronRight,
    Monitor
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

interface WorkflowHistoryProps {
    workflowId: string;
    onReRun?: (workflow: any, inputs: Record<string, string>) => void;
}

const WorkflowHistory: React.FC<WorkflowHistoryProps> = ({ workflowId, onReRun }) => {
    const { apiFetch } = useAuth();
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedExec, setSelectedExec] = useState<WorkflowExecution | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        if (workflowId) {
            fetchHistory();
        }
    }, [workflowId]);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const response = await apiFetch(`${API_BASE_URL}/workflows/${workflowId}/executions`);
            if (response.ok) {
                const data = await response.json();
                setExecutions(data || []);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        } finally {
            setLoading(false);
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
                return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Success</Badge>;
            case 'FAILED':
                return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
            case 'RUNNING':
                return <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getDuration = (start: string, end?: string) => {
        if (!end) return 'Running...';
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        const diff = Math.floor((endTime - startTime) / 1000);
        if (diff < 60) return `${diff}s`;
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        return `${mins}m ${secs}s`;
    };

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
                </div>
                <Button variant="ghost" size="sm" onClick={fetchHistory}>Refresh</Button>
            </div>

            {executions.length === 0 ? (
                <div className="text-center py-12 bg-white/5 border border-dashed rounded-lg">
                    <History className="w-8 h-8 mx-auto text-muted-foreground animate-pulse mb-2" />
                    <p className="text-sm text-muted-foreground">No execution history found for this workflow.</p>
                </div>
            ) : (
                <div className="overflow-y-auto max-h-[calc(100vh-450px)] space-y-2 px-1 custom-scrollbar">
                    {executions.map((exec) => (
                        <Card
                            key={exec.id}
                            className="bg-white/5 border-white/10 hover:bg-white/[0.08] transition-colors cursor-pointer group overflow-hidden"
                            onClick={() => fetchExecutionDetail(exec)}
                        >
                            <CardContent className="p-3 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-1 h-10 rounded-full ${exec.status === 'SUCCESS' ? 'bg-green-500' :
                                        exec.status === 'FAILED' ? 'bg-red-500' : 'bg-blue-500'
                                        }`} />
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-muted-foreground">#{exec.id.slice(0, 8)}</span>
                                            {getStatusBadge(exec.status)}
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
                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </CardContent>
                        </Card>
                    ))}
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
