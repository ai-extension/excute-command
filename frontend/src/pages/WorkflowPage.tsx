import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, MoreHorizontal, Play, ChevronRight, Zap, Filter, ArrowUpDown, Settings, Server } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Workflow } from '../types';
import WorkflowRunner from '../components/WorkflowRunner';
import { TagFilter } from '../components/TagFilter';
import { Pagination } from '../components/Pagination';

import { ResourceFilters } from '../components/ResourceFilters';

const WorkflowPage = () => {
    const navigate = useNavigate();
    const { activeNamespace } = useNamespace();
    const { apiFetch } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    // Create workflow dialog state
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newWorkflowName, setNewWorkflowName] = useState('');
    const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const fetchWorkflows = async (searchOverride?: string) => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            const currentSearch = searchOverride !== undefined ? searchOverride : searchTerm;
            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=${limit}&offset=${offset}`;
            if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
            if (selectedTagIds.length > 0) {
                selectedTagIds.forEach(id => {
                    url += `&tag_ids=${id}`;
                });
            }
            const response = await apiFetch(url);
            const data = await response.json();
            setWorkflows(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch workflows:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateWorkflow = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeNamespace || !newWorkflowName.trim()) return;

        setIsCreating(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: newWorkflowName,
                    description: newWorkflowDescription,
                    status: 'active',
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setIsCreateDialogOpen(false);
                setNewWorkflowName('');
                setNewWorkflowDescription('');
                navigate(`/workflows/${data.id}/edit`);
            } else {
                const error = await response.json();
                alert(error.error || 'Failed to create workflow');
            }
        } catch (error) {
            console.error('Failed to create workflow:', error);
            alert('An unexpected error occurred');
        } finally {
            setIsCreating(false);
        }
    };

    useEffect(() => {
        fetchWorkflows();
    }, [activeNamespace, offset, limit]);

    const handleApplyFilter = (search: string) => {
        setSearchTerm(search);
        setOffset(0);
        fetchWorkflows(search);
    };

    return (
        <WorkflowRunner onRunComplete={() => fetchWorkflows()} onCloseMonitor={() => fetchWorkflows()}>
            {(runWorkflow) => (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-2 px-1">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em]">
                            <span className="text-primary">Automations</span>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                            <span className="text-muted-foreground font-black">Workflow Orchestrator</span>
                        </div>
                    </div>

                    <ResourceFilters
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        onApply={handleApplyFilter}
                        searchPlaceholder="Search workflows by name or description..."
                        isLoading={isLoading}
                        primaryAction={
                            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                                <Button
                                    onClick={() => setIsCreateDialogOpen(true)}
                                    className="px-4 rounded-xl premium-gradient font-black uppercase tracking-widest text-[10px] shadow-premium hover:shadow-indigo-500/25 transition-all gap-2"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    New Workflow
                                </Button>
                                <DialogContent className="sm:max-w-md">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <Zap className="w-5 h-5 text-primary" />
                                            Create New Workflow
                                        </DialogTitle>
                                        <DialogDescription>
                                            Define the core identification for your new automation pipeline.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <form onSubmit={handleCreateWorkflow} className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Workflow Name</label>
                                            <Input
                                                value={newWorkflowName}
                                                onChange={(e) => setNewWorkflowName(e.target.value)}
                                                placeholder="e.g. Daily Data Backup"
                                                autoFocus
                                                className="text-sm font-medium focus:ring-1 focus:ring-primary/30"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</label>
                                            <Input
                                                value={newWorkflowDescription}
                                                onChange={(e) => setNewWorkflowDescription(e.target.value)}
                                                placeholder="What does this workflow automate?"
                                                className="text-sm font-medium"
                                            />
                                        </div>
                                        <DialogFooter className="pt-4">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => setIsCreateDialogOpen(false)}
                                                className="h-9 text-[10px] font-bold uppercase tracking-widest px-6"
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                type="submit"
                                                disabled={!newWorkflowName.trim() || isCreating}
                                                className="h-9 text-[10px] font-bold uppercase tracking-widest px-6 premium-gradient"
                                            >
                                                {isCreating ? 'Creating...' : 'Initialize Pipeline'}
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        }
                    />

                    <TagFilter
                        selectedTagIds={selectedTagIds}
                        onChange={setSelectedTagIds}
                        className="px-1"
                    />

                    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden transition-all duration-500">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted hover:bg-muted/80 border-border">
                                    <TableHead className="w-[350px] h-12 font-black uppercase tracking-[0.15em] text-[9px] px-6 text-muted-foreground">Workflow Information</TableHead>
                                    <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Status</TableHead>
                                    <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Orchestration</TableHead>
                                    <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Created By</TableHead>
                                    <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Last Updated</TableHead>
                                    <TableHead className="text-right h-12 px-6 font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32">
                                            <div className="flex flex-col items-center justify-center gap-2 opacity-50">
                                                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Loading workflows...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : workflows.length > 0 ? workflows.map((wf) => (
                                    <TableRow key={wf.id} className="group border-border hover:bg-muted/40 transition-colors duration-200">
                                        <TableCell className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 group-hover:scale-110 transition-all duration-500">
                                                    <Zap className="w-3.5 h-3.5 text-indigo-500" />
                                                </div>
                                                <div>
                                                    <p className="text-[13px] font-black tracking-tight group-hover:text-primary transition-colors">{wf.name}</p>
                                                    <p className="text-[10px] text-muted-foreground font-medium line-clamp-1 opacity-70 mb-1.5">
                                                        {wf.description || 'No description provided'}
                                                    </p>
                                                    {wf.tags && wf.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {wf.tags.map(tag => (
                                                                <span
                                                                    key={tag.id}
                                                                    className="px-1.5 py-0.5 rounded text-[8px] font-bold border"
                                                                    style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
                                                                >
                                                                    {tag.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "font-black text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-xl border-none",
                                                    wf.status === 'SUCCESS' && "bg-emerald-500/10 text-emerald-500",
                                                    wf.status === 'FAILED' && "bg-destructive/10 text-destructive",
                                                    wf.status === 'RUNNING' && "bg-primary/10 text-primary animate-pulse",
                                                    wf.status === 'PENDING' && "bg-amber-500/10 text-amber-500"
                                                )}
                                            >
                                                {wf.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5 grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                                                <div className="px-2 py-0.5 rounded bg-muted text-[10px] font-bold">
                                                    {wf.groups?.length || 0} Groups
                                                </div>
                                                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                                <div className="px-2 py-0.5 rounded bg-muted text-[10px] font-bold">
                                                    {wf.groups?.reduce((acc, g) => acc + (g.steps?.length || 0), 0) || 0} Steps
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {(wf as any).created_by_username ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-black text-primary uppercase shrink-0">
                                                        {(wf as any).created_by_username[0]}
                                                    </div>
                                                    <span className="text-[10px] font-semibold text-muted-foreground">{(wf as any).created_by_username}</span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-muted-foreground/40 italic">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-[11px] font-semibold text-muted-foreground/60 tracking-tight">
                                            {wf.updated_at ? new Date(wf.updated_at).toLocaleString() : 'Never'}
                                        </TableCell>
                                        <TableCell className="text-right px-8">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => runWorkflow(wf)}
                                                    className="w-10 rounded-xl hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
                                                >
                                                    <Play className="w-4 h-4 fill-current" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => navigate(`/workflows/${wf.id}/edit`)}
                                                    className="w-10 rounded-xl hover:bg-muted"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-48 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3 opacity-30">
                                                <Zap className="w-12 h-12" />
                                                <p className="text-[11px] font-black uppercase tracking-widest">No workflows found in this namespace</p>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setIsCreateDialogOpen(true)}
                                                    className="mt-2 rounded-full border-dashed"
                                                >
                                                    Create your first workflow
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <Pagination
                        total={total}
                        offset={offset}
                        limit={limit}
                        itemName="Workflows"
                        onPageChange={setOffset}
                    />

                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-primary" />
                                    Create New Workflow
                                </DialogTitle>
                                <DialogDescription>
                                    Define the core identification for your new automation pipeline.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateWorkflow} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Workflow Name</label>
                                    <Input
                                        value={newWorkflowName}
                                        onChange={(e) => setNewWorkflowName(e.target.value)}
                                        placeholder="e.g. Daily Data Backup"
                                        autoFocus
                                        className="h-10 text-sm font-medium focus:ring-1 focus:ring-primary/30"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</label>
                                    <Input
                                        value={newWorkflowDescription}
                                        onChange={(e) => setNewWorkflowDescription(e.target.value)}
                                        placeholder="What does this workflow automate?"
                                        className="h-10 text-sm font-medium"
                                    />
                                </div>
                                <DialogFooter className="pt-4">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setIsCreateDialogOpen(false)}
                                        className="h-9 text-[10px] font-bold uppercase tracking-widest px-6"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={!newWorkflowName.trim() || isCreating}
                                        className="h-9 text-[10px] font-bold uppercase tracking-widest px-6 premium-gradient"
                                    >
                                        {isCreating ? 'Creating...' : 'Initialize Pipeline'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div >
            )}
        </WorkflowRunner >
    );
};

export default WorkflowPage;
