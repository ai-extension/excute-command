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
    const [jumpPage, setJumpPage] = useState("");

    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    // Create workflow dialog state
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newWorkflowName, setNewWorkflowName] = useState('');
    const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const fetchWorkflows = async (pageOffset = offset) => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=${limit}&offset=${pageOffset}`);
            const data = await response.json();
            if (data && data.items) {
                setWorkflows(data.items);
                setTotal(data.total);
            } else {
                setWorkflows(Array.isArray(data) ? data : []);
                setTotal(Array.isArray(data) ? data.length : 0);
            }
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
    }, [activeNamespace]);

    const filteredWorkflows = workflows.filter(wf => {
        const matchesSearch = wf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            wf.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTags = selectedTagIds.length === 0 ||
            selectedTagIds.every(tagId => wf.tags?.some(wt => wt.id === tagId));
        return matchesSearch && matchesTags;
    });

    const handlePageChange = (newOffset: number) => {
        setOffset(newOffset);
        fetchWorkflows(newOffset);
    };

    const handleJumpPage = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const page = parseInt(jumpPage, 10);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
            handlePageChange((page - 1) * limit);
            setJumpPage("");
        }
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

                    <div className="flex items-center justify-between gap-4 bg-card p-2.5 rounded-xl border border-border shadow-card">
                        <div className="relative flex-1 max-w-md group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground transition-all group-focus-within:text-primary group-focus-within:scale-110" />
                            <Input
                                placeholder="Search workflows by name or description..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-11 h-9 bg-background border-border rounded-lg focus-visible:ring-primary/20 placeholder:text-muted-foreground/50 font-semibold text-xs transition-all focus:bg-muted/30"
                            />
                        </div>
                        <div className="flex gap-1.5 items-center">
                            <Button variant="outline" className="h-9 rounded-lg border-border px-3.5 font-black uppercase tracking-tight text-[8.5px] bg-background gap-1 shadow-sm hover:bg-muted transition-all">
                                <Filter className="w-3 h-3" /> Filter
                            </Button>
                            <Button
                                onClick={() => setIsCreateDialogOpen(true)}
                                className="h-9 px-5 rounded-lg premium-gradient font-black uppercase tracking-widest text-[9px] shadow-premium hover:shadow-indigo-500/25 transition-all gap-2"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                New Workflow
                            </Button>
                        </div>
                    </div>

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
                                ) : filteredWorkflows.length > 0 ? filteredWorkflows.map((wf) => (
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
                                        <TableCell className="text-[11px] font-semibold text-muted-foreground/60 tracking-tight">
                                            {wf.updated_at ? new Date(wf.updated_at).toLocaleString() : 'Never'}
                                        </TableCell>
                                        <TableCell className="text-right px-8">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => runWorkflow(wf)}
                                                    className="h-10 w-10 rounded-xl hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
                                                >
                                                    <Play className="w-4 h-4 fill-current" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => navigate(`/workflows/${wf.id}/edit`)}
                                                    className="h-10 w-10 rounded-xl hover:bg-muted"
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

                    {total > 0 && (
                        <div className="flex items-center justify-between px-4 py-4 bg-muted/10 border-t border-border/50">
                            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Showing {total === 0 ? 0 : offset + 1} to {Math.min(offset + limit, total)} of {total} Workflows
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-bold text-muted-foreground">
                                    Page {currentPage} of {Math.max(1, totalPages)}
                                </span>
                                
                                <form onSubmit={handleJumpPage} className="flex items-center border border-border rounded-lg overflow-hidden h-8 bg-background shadow-sm hover:border-primary/50 focus-within:border-primary/50 transition-colors">
                                    <Input 
                                        type="number" 
                                        min={1} 
                                        max={Math.max(1, totalPages)}
                                        value={jumpPage} 
                                        onChange={(e) => setJumpPage(e.target.value)}
                                        placeholder={currentPage.toString()}
                                        className="h-full w-14 px-2 text-[10px] font-bold text-center border-0 focus-visible:ring-0 rounded-none bg-transparent"
                                    />
                                    <Button 
                                        type="submit"
                                        disabled={!jumpPage || parseInt(jumpPage) < 1 || parseInt(jumpPage) > totalPages}
                                        variant="ghost" 
                                        className="h-full rounded-none border-l border-border px-3 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                                    >
                                        Go
                                    </Button>
                                </form>
                            </div>
                        </div>
                    )}

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
