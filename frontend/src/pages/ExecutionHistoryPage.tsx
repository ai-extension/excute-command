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
import { WorkflowExecution, Workflow } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { format } from 'date-fns';
import { API_BASE_URL } from '../lib/api';
import ExecutionMonitor from '../components/ExecutionMonitor';
import WorkflowRunner from '../components/WorkflowRunner';
import { Pagination } from '../components/Pagination';
import WorkflowHistory from '../components/WorkflowHistory';
import { useUsers } from '../hooks/useUsers';

const ExecutionHistoryPage = () => {
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedExec, setSelectedExec] = useState<WorkflowExecution | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [workflowFilter, setWorkflowFilter] = useState<string>('ALL');
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [selectedExecutedBy, setSelectedExecutedBy] = useState<string | undefined>(undefined);
    const { users: availableUsers, fetchUsers } = useUsers();

    useEffect(() => {
        if (activeNamespace) {
            fetchWorkflows();
        }
    }, [activeNamespace]);

    const fetchWorkflows = async (search?: string) => {
        if (!activeNamespace) return;
        try {
            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=20`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            const response = await apiFetch(url);
            const data = await response.json();
            setWorkflows(data.items || (Array.isArray(data) ? data : []));
        } catch (error) {
            console.error('Failed to fetch workflows:', error);
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
        if (!end) return 'In Progress...';
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        const diff = Math.floor((endTime - startTime) / 1000);
        if (diff < 60) return `${diff}s`;
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        return `${mins}m ${secs}s`;
    };

    const handleApplyFilter = (search: string, filters: { [key: string]: any }) => {
        setSearchQuery(search);
        setStatusFilter(filters.status || 'ALL');
        setWorkflowFilter(filters.workflowId || 'ALL');
        setSelectedExecutedBy(filters.executedBy);
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
                        filters={{ status: statusFilter, workflowId: workflowFilter, executedBy: selectedExecutedBy }}
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
                                width: 'w-32',
                                isSearchable: true
                            },
                            {
                                key: 'workflowId',
                                placeholder: 'WORKFLOW',
                                options: [
                                    { label: 'ALL WORKFLOWS', value: 'ALL' },
                                    ...workflows.map(wf => ({ label: wf.name.toUpperCase(), value: wf.id }))
                                ],
                                width: 'w-48',
                                isSearchable: true,
                                onSearch: (query) => fetchWorkflows(query)
                            },
                            {
                                key: 'executedBy',
                                placeholder: 'EXECUTED BY',
                                type: 'single',
                                isSearchable: true,
                                onSearch: (query) => fetchUsers(query),
                                options: [
                                    { label: 'ALL EXECUTORS', value: '' },
                                    ...availableUsers.map(u => ({ label: u.username.toUpperCase(), value: u.id }))
                                ],
                                width: 'w-48'
                            }
                        ]}
                        searchPlaceholder="SEARCH BY WORKFLOW OR ID..."
                        isLoading={loading}
                        onReset={() => {
                            setSearchQuery('');
                            setStatusFilter('ALL');
                            setWorkflowFilter('ALL');
                            setSelectedExecutedBy(undefined);
                        }}
                    />

                    {/* Main Content */}
                    <div className="bg-card/30 backdrop-blur-sm rounded-3xl border border-border p-6 shadow-premium relative overflow-hidden flex-1 flex flex-col min-h-0">
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <WorkflowHistory
                                namespaceId={activeNamespace?.id}
                                status={statusFilter}
                                workflowId={workflowFilter !== 'ALL' ? workflowFilter : undefined}
                                executedBy={selectedExecutedBy}
                                search={searchQuery}
                                onReRun={(wf: any, inputs: any, gId?: string, sId?: string, execId?: string) => runWorkflow(wf, inputs, gId, sId, execId)}
                            />
                        </div>
                    </div>
                </div>
            )
            }
        </WorkflowRunner >
    );
};

export default ExecutionHistoryPage;
