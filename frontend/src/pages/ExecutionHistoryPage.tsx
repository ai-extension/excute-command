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
    Search,
    Filter,
    Zap,
    Plus
} from 'lucide-react';
import { ResourceFilters } from '../components/ResourceFilters';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '../components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import { WorkflowExecution, Workflow } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { format } from 'date-fns';
import { API_BASE_URL } from '../lib/api';
import ExecutionMonitor from '../components/ExecutionMonitor';
import WorkflowRunner from '../components/WorkflowRunner';
import { Pagination } from '../components/Pagination';

const ExecutionHistoryPage = () => {
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedExec, setSelectedExec] = useState<WorkflowExecution | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [workflowFilter, setWorkflowFilter] = useState<string>('ALL');
    const [workflows, setWorkflows] = useState<Workflow[]>([]);

    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        if (activeNamespace) {
            fetchHistory();
            fetchWorkflows();
        }
    }, [activeNamespace, offset, limit]);

    const fetchWorkflows = async () => {
        if (!activeNamespace) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=1000`);
            const data = await response.json();
            setWorkflows(data.items || (Array.isArray(data) ? data : []));
        } catch (error) {
            console.error('Failed to fetch workflows:', error);
        }
    };

    const fetchHistory = async (searchOverride?: string, statusOverride?: string, workflowOverride?: string) => {
        if (!activeNamespace) return;
        try {
            setLoading(true);
            setError(null);

            const search = searchOverride !== undefined ? searchOverride : searchQuery;
            const status = statusOverride !== undefined ? statusOverride : statusFilter;
            const workflowId = workflowOverride !== undefined ? workflowOverride : workflowFilter;

            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/executions?limit=${limit}&offset=${offset}`;
            if (status !== 'ALL') url += `&status=${status}`;
            if (workflowId !== 'ALL') url += `&workflow_id=${workflowId}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const response = await apiFetch(url);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Server error: ${response.status}`);
            }
            const data = await response.json();
            setExecutions(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch history:', error);
            setError(error instanceof Error ? error.message : 'Failed to retrieve execution records');
        } finally {
            setLoading(false);
        }
    };

    const fetchExecutionDetail = async (exec: WorkflowExecution) => {
        try {
            setLoadingDetail(true);
            const response = await apiFetch(`${API_BASE_URL}/executions/${exec.id}`);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to fetch execution detail');
            }
            const data = await response.json();
            setSelectedExec(data);
        } catch (error) {
            console.error('Failed to fetch execution detail:', error);
            setSelectedExec(null);
        } finally {
            setLoadingDetail(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20 shadow-sm"><CheckCircle2 className="w-3 h-3 mr-1" /> Success</Badge>;
            case 'FAILED':
                return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 shadow-sm"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
            case 'RUNNING':
                return <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20 shadow-sm"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running</Badge>;
            default:
                return <Badge variant="outline" className="opacity-50">{status}</Badge>;
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
            default:
                return (
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-500/20 font-black text-[8px] uppercase tracking-widest px-2 py-0.5">
                        <Plus className="w-3 h-3 mr-1" /> Manual
                    </Badge>
                );
        }
    };

    const getDuration = (start: string, end?: string) => {
        if (!end) return 'In Progress...';
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        const diff = Math.floor((endTime - startTime) / 1000);
        if (diff < 60) return `${diff}s`;
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        return `${mins}m ${secs}s`;
    };

    const handleApplyFilter = (search: string, filters: { [key: string]: string }) => {
        setSearchQuery(search);
        setStatusFilter(filters.status || 'ALL');
        setWorkflowFilter(filters.workflowId || 'ALL');
        setOffset(0);
        fetchHistory(search, filters.status, filters.workflowId);
    };

    return (
        <WorkflowRunner>
            {(runWorkflow) => (
                <div className="flex flex-col gap-8 h-full animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 px-1">
                        <History className="w-3.5 h-3.5 text-primary" />
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                            <span className="text-primary">Automations</span>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                            <span className="text-muted-foreground font-black">Execution History</span>
                        </div>
                    </div>

                    <ResourceFilters
                        searchTerm={searchQuery}
                        onSearchChange={setSearchQuery}
                        onApply={handleApplyFilter}
                        filters={{ status: statusFilter, workflowId: workflowFilter }}
                        onFilterChange={(key, val) => {
                            if (key === 'status') setStatusFilter(val);
                            if (key === 'workflowId') setWorkflowFilter(val);
                        }}
                        filterConfigs={[
                            {
                                key: 'status',
                                placeholder: 'STATUS',
                                options: [
                                    { label: 'ALL STATUS', value: 'ALL' },
                                    { label: 'SUCCESS', value: 'SUCCESS' },
                                    { label: 'FAILED', value: 'FAILED' },
                                    { label: 'RUNNING', value: 'RUNNING' }
                                ],
                                width: 'w-32'
                            },
                            {
                                key: 'workflowId',
                                placeholder: 'WORKFLOW',
                                options: [
                                    { label: 'ALL WORKFLOWS', value: 'ALL' },
                                    ...workflows.map(wf => ({ label: wf.name.toUpperCase(), value: wf.id }))
                                ],
                                width: 'w-48'
                            }
                        ]}
                        searchPlaceholder="SEARCH BY WORKFLOW OR ID..."
                        isLoading={loading}
                        primaryAction={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSearchQuery('');
                                    setStatusFilter('ALL');
                                    setWorkflowFilter('ALL');
                                    setOffset(0);
                                    // fetchHistory will be triggered by useEffect because some state might change
                                    // but actually we should just call it to be sure
                                    fetchHistory('', 'ALL', 'ALL');
                                }}
                                disabled={loading}
                                className="h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 bg-card hover:bg-muted"
                            >
                                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                                Reset
                            </Button>
                        }
                    />

                    {/* Main Content */}
                    <div className="bg-card/30 backdrop-blur-sm rounded-3xl border border-border p-6 shadow-premium relative overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

                        {error ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 bg-destructive/5 rounded-2xl border border-dashed border-destructive/20 animate-in fade-in zoom-in-95 duration-300">
                                <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                                    <XCircle className="w-10 h-10 text-destructive" />
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="text-sm font-bold text-destructive uppercase tracking-widest">Audit Log Synchronization Failure</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium max-w-sm mx-auto">{error}</p>
                                </div>
                                <Button
                                    onClick={() => fetchHistory()}
                                    variant="outline"
                                    className="px-8 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold uppercase tracking-widest text-[10px]"
                                >
                                    Retry Synchronization
                                </Button>
                            </div>
                        ) : loading && executions.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                <Loader2 className="w-10 h-10 animate-spin text-primary opacity-50" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Initializing Historical Data...</p>
                            </div>
                        ) : executions.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 bg-background/5 rounded-2xl border border-dashed border-border/50">
                                <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center animate-hover">
                                    <History className="w-10 h-10 text-muted-foreground/30" />
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="text-sm font-bold text-foreground">No executions discovered</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Try refining your search or execute a workflow to begin</p>
                                </div>
                                <Button onClick={() => window.location.href = '/workflows'} className="h-9 px-6 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-primary/10">
                                    Navigate to Blueprints
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar flex flex-col">
                                <div className="space-y-3 flex-1">
                                    {executions.map((exec: WorkflowExecution) => (
                                        <Card
                                            key={exec.id}
                                            className="bg-card hover:bg-muted/50 border-border/50 hover:border-primary/20 transition-all duration-300 cursor-pointer group shadow-sm hover:translate-x-1"
                                            onClick={() => fetchExecutionDetail(exec)}
                                        >
                                            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                                <div className="flex items-center gap-5">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 group-hover:scale-110 shadow-inner",
                                                        exec.status === 'SUCCESS' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                                                            exec.status === 'FAILED' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                                                'bg-blue-500/10 border-blue-500/20 text-blue-500 animate-pulse'
                                                    )}>
                                                        <Zap className={cn("w-5 h-5", exec.status === 'RUNNING' && 'animate-spin-slow')} />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-3">
                                                            <h3 className="font-bold text-sm text-foreground tracking-tight group-hover:text-primary transition-colors">
                                                                {exec.workflow?.name || 'TERMINATED_FLOW'}
                                                            </h3>
                                                            {getStatusBadge(exec.status)}
                                                            {getTriggerBadge(exec)}
                                                        </div>
                                                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-bold tracking-wider uppercase opacity-80">
                                                            <span className="flex items-center gap-1.5 font-mono text-primary/60">
                                                                <FileText className="w-3 h-3" />
                                                                #{exec.id.slice(0, 8)}
                                                            </span>
                                                            <span className="flex items-center gap-1.5">
                                                                <Calendar className="w-3 h-3" />
                                                                {format(new Date(exec.started_at), 'MMM d, HH:mm:ss')}
                                                            </span>
                                                            <span className="flex items-center gap-1.5">
                                                                <Clock className="w-3 h-3" />
                                                                {getDuration(exec.started_at, exec.finished_at)}
                                                            </span>
                                                            {exec.user?.username && (
                                                                <span className="flex items-center gap-1.5 text-indigo-400/70 normal-case">
                                                                    <div className="h-3.5 w-3.5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[7px] font-black text-indigo-400 uppercase">
                                                                        {exec.user.username[0]}
                                                                    </div>
                                                                    {exec.user.username}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-9 px-4 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all shadow-input"
                                                >
                                                    InSPECT_TRaCE
                                                    <ChevronRight className="w-3.5 h-3.5 ml-2" />
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                                <div className="mt-6 border-t border-border pt-4">
                                    <Pagination
                                        total={total}
                                        offset={offset}
                                        limit={limit}
                                        itemName="Executions"
                                        onPageChange={setOffset}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Log Viewer Dialog */}
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
                                    onReRun={(wf, inputs) => runWorkflow({ ...wf, id: selectedExec.workflow_id }, inputs)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </div>
            )
            }
        </WorkflowRunner >
    );
};

export default ExecutionHistoryPage;
