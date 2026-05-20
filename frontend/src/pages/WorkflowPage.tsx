import React, { useState, useEffect, useRef } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    ChevronRight,
    Zap,
    Settings,
    Play,
    Trash2,
    Layout,
    Database,
    History,
    FileText,
    Settings as SettingsIcon,
    Globe,
    Lock, SquareChartGantt,
    Upload,
    ClipboardPaste,
    AlertCircle,
    CheckCircle2,
    Download,
    RefreshCw
} from 'lucide-react';
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
import { SearchableSelect } from '../components/SearchableSelect';
import { cn } from '../lib/utils';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Workflow, Tag, Server as ServerType } from '../types';
import WorkflowRunner from '../components/WorkflowRunner';
import { TagSelector } from '../components/TagSelector';
import { Pagination } from '../components/Pagination';
import { ResourceFilters } from '../components/ResourceFilters';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useUsers } from '../hooks/useUsers';

const WorkflowPage = () => {
    const navigate = useNavigate();
    const { activeNamespace } = useNamespace();
    const { apiFetch, showToast } = useAuth();

    // Filter & List State
    const [searchTerm, setSearchTerm] = usePersistentState('wf_search', '');
    const [selectedTagIds, setSelectedTagIds] = usePersistentState<string[]>('wf_tags', []);
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(15);
    const [offset, setOffset] = useState(0);
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [selectedCreatedBy, setSelectedCreatedBy] = usePersistentState<string | undefined>('wf_createdBy', undefined);
    const [visibilityFilter, setVisibilityFilter] = usePersistentState<'all' | 'public' | 'draft'>('wf_visibility', 'all');
    const { users: availableUsers, fetchUsers } = useUsers();

    // Create workflow dialog state
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newWorkflowName, setNewWorkflowName] = useState('');
    const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
    const [newWorkflowTags, setNewWorkflowTags] = useState<Tag[]>([]);
    const [newWorkflowDefaultServerId, setNewWorkflowDefaultServerId] = useState<string>('');
    const [availableServers, setAvailableServers] = useState<ServerType[]>([]);
    const [isCreating, setIsCreating] = useState(false);

    // Clone workflow state
    const [cloneTarget, setCloneTarget] = useState<Workflow | null>(null);
    const [isCloning, setIsCloning] = useState(false);

    // Delete workflow state
    const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);

    // Paste JSON Import state
    const [isPasteDialogOpen, setIsPasteDialogOpen] = useState(false);
    const [pasteJson, setPasteJson] = useState('');
    const [pasteError, setPasteError] = useState<string | null>(null);
    const [parsedPreview, setParsedPreview] = useState<{ name: string; description: string; groupCount: number; stepCount: number } | null>(null);
    const [isPasteImporting, setIsPasteImporting] = useState(false);
    const [importServerId, setImportServerId] = useState<string>('');
    const [importMode, setImportMode] = useState<'create' | 'update'>('create');
    const [updateTargetId, setUpdateTargetId] = useState<string>('');
    const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setIsPasteDialogOpen(true);
            setImportServerId('');
            setImportMode('create');
            setUpdateTargetId('');
            handlePasteJsonChange(content);
            setPasteJson(content);
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePasteJsonChange = (value: string) => {
        setPasteJson(value);
        setPasteError(null);
        setParsedPreview(null);

        if (!value.trim()) return;

        try {
            const parsed = JSON.parse(value);
            if (!parsed.name || typeof parsed.name !== 'string') {
                setPasteError('Missing required field: "name"');
                return;
            }
            const groups = parsed.groups || [];
            const stepCount = groups.reduce((acc: number, g: any) => acc + (g.steps?.length || 0), 0);
            setParsedPreview({
                name: parsed.name,
                description: parsed.description || '',
                groupCount: groups.length,
                stepCount,
            });
        } catch {
            setPasteError('Invalid JSON format');
        }
    };

    const handlePasteImportConfirm = () => {
        if (importMode === 'update' && updateTargetId) {
            setShowOverwriteConfirm(true);
        } else {
            handlePasteImport();
        }
    };

    const handlePasteImport = async () => {
        if (!activeNamespace || !parsedPreview) return;
        if (importMode === 'create' && !importServerId) return;

        setShowOverwriteConfirm(false);
        setIsPasteImporting(true);
        try {
            const workflowData = JSON.parse(pasteJson);
            if (importServerId) {
                workflowData.default_server_id = importServerId;
            }

            let url: string;
            let method: string;
            if (importMode === 'update' && updateTargetId) {
                url = `${API_BASE_URL}/workflows/${updateTargetId}/import`;
                method = 'PUT';
            } else {
                url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows/import`;
                method = 'POST';
            }

            const response = await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(workflowData),
            });

            if (response.ok) {
                const data = await response.json();
                showToast(importMode === 'update' ? 'Workflow updated successfully' : 'Workflow imported successfully', 'success');
                setIsPasteDialogOpen(false);
                setPasteJson('');
                setParsedPreview(null);
                navigate(`/workflows/${data.id}/edit`);
            } else {
                const error = await response.json();
                setPasteError(error.error || 'Failed to import workflow');
            }
        } catch {
            setPasteError('Failed to import workflow');
        } finally {
            setIsPasteImporting(false);
        }
    };

    const handleExportWorkflow = async (wf: Workflow) => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/workflows/${wf.id}`);
            if (!response.ok) throw new Error('Failed to fetch workflow');
            const data = await response.json();

            const stripIds = (obj: any): any => {
                if (Array.isArray(obj)) return obj.map(stripIds);
                if (obj !== null && typeof obj === 'object') {
                    const newObj: any = {};
                    for (const key in obj) {
                        if (['id', 'workflow_id', 'group_id', 'step_id', 'created_at', 'updated_at', 'server_id', 'default_server_id', 'copy_target_server_id', 'target_workflow', 'created_by', 'created_by_username', 'namespace_id', 'default_server', 'copy_target_server'].includes(key)) continue;
                        newObj[key] = stripIds(obj[key]);
                    }
                    return newObj;
                }
                return obj;
            };

            const exportData = stripIds({
                name: data.name,
                description: data.description,
                ai_guide: data.ai_guide,
                is_template: data.is_template,
                is_public: data.is_public,
                timeout_minutes: data.timeout_minutes,
                target_folder: data.target_folder,
                cleanup_files: data.cleanup_files,
                tags: data.tags,
                inputs: data.inputs,
                variables: data.variables,
                groups: data.groups,
                hooks: data.hooks,
            });

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${data.name.replace(/\s+/g, '-').toLowerCase()}-export.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showToast('Workflow exported successfully', 'success');
        } catch {
            showToast('Failed to export workflow', 'error');
        }
    };

    const fetchWorkflows = async (searchOverride?: string, tagIdsOverride?: string[], templatesOverride?: boolean) => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            const currentSearch = searchOverride !== undefined ? searchOverride : searchTerm;
            const currentTagIds = tagIdsOverride !== undefined ? tagIdsOverride : selectedTagIds;
            const currentShowTemplates = templatesOverride !== undefined ? templatesOverride : showTemplates;
            const currentCreatedBy = selectedCreatedBy;
            const currentVisibility = visibilityFilter;

            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=${limit}&offset=${offset}&is_template=${currentShowTemplates}`;
            if (currentVisibility !== 'all') {
                url += `&is_public=${currentVisibility === 'public'}`;
            } else {
                url += `&is_public=all`;
            }
            if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
            if (currentCreatedBy) url += `&created_by=${currentCreatedBy}`;
            if (currentTagIds.length > 0) {
                currentTagIds.forEach(id => {
                    url += `&tag_ids=${id}`;
                });
            }

            const response = await apiFetch(url);
            const data = await response.json();
            setWorkflows(data.items || (Array.isArray(data) ? data : []));
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch workflows:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTags = async () => {
        if (!activeNamespace) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/tags`);
            const data = await response.json();
            setAvailableTags(data.items || (Array.isArray(data) ? data : []));
        } catch (error) {
            console.error('Failed to fetch tags:', error);
        }
    };

    const fetchServers = async (query?: string) => {
        try {
            let url = `${API_BASE_URL}/servers?limit=15`;
            if (query) url += `&search=${encodeURIComponent(query)}`;
            const response = await apiFetch(url);
            if (!response.ok) throw new Error(`Servers fetch failed: ${response.status}`);
            const data = await response.json();
            const items = data.items || (Array.isArray(data) ? data : []);

            setAvailableServers(prev => {
                const existing = new Map(prev.map(s => [s.id, s]));
                items.forEach((s: ServerType) => existing.set(s.id, s));
                return Array.from(existing.values());
            });
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        }
    };

    const handleSearchServers = async (query: string) => {
        try {
            const url = `${API_BASE_URL}/servers?limit=50&search=${encodeURIComponent(query)}`;
            const response = await apiFetch(url);
            if (!response.ok) throw new Error(`Search failed: ${response.status}`);
            const data = await response.json();
            const items = data.items || (Array.isArray(data) ? data : []);

            setAvailableServers(prev => {
                const existing = new Map(prev.map(s => [s.id, s]));
                items.forEach((s: ServerType) => existing.set(s.id, s));
                return Array.from(existing.values());
            });
        } catch (error) {
            console.error('Failed to search servers:', error);
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
                    tags: newWorkflowTags,
                    default_server_id: newWorkflowDefaultServerId || undefined,
                    status: 'PENDING',
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setIsCreateDialogOpen(false);
                setNewWorkflowName('');
                setNewWorkflowDescription('');
                setNewWorkflowTags([]);
                setNewWorkflowDefaultServerId('');
                navigate(`/workflows/${data.id}/edit`);
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to create workflow', 'error');
            }
        } catch (error) {
            console.error('Failed to create workflow:', error);
            showToast('An unexpected error occurred', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleClone = (wf: Workflow) => {
        setCloneTarget(wf);
    };

    const confirmClone = async () => {
        if (!cloneTarget) return;
        setIsCloning(true);

        try {
            const response = await apiFetch(`${API_BASE_URL}/workflows/${cloneTarget.id}/clone`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    target_namespace_id: activeNamespace?.id
                })
            });

            if (response.ok) {
                const data = await response.json();
                setShowTemplates(false);
                setOffset(0);
                setTimeout(() => fetchWorkflows('', [], false), 100);
                navigate(`/workflows/${data.id}/edit`);
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to clone template', 'error');
            }
        } catch (error) {
            console.error('Failed to clone template:', error);
            showToast('An unexpected error occurred', 'error');
        } finally {
            setIsCloning(false);
            setCloneTarget(null);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);

        try {
            const response = await apiFetch(`${API_BASE_URL}/workflows/${deleteTarget.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                fetchWorkflows();
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to delete workflow', 'error');
            }
        } catch (error) {
            console.error('Failed to delete workflow:', error);
            showToast('An unexpected error occurred', 'error');
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    useEffect(() => {
        if (activeNamespace) {
            fetchWorkflows();
            fetchTags();
            fetchServers();
        }
    }, [activeNamespace, limit, offset, searchTerm, selectedTagIds, showTemplates, selectedCreatedBy, visibilityFilter]);

    const handleApplyFilter = (search: string, filters: { [key: string]: any }) => {
        setSearchTerm(search);
        setSelectedTagIds(filters.tags || []);
        setSelectedCreatedBy(filters.createdBy);
        setVisibilityFilter(filters.visibility || 'all');
        setOffset(0);
    };

    return (
        <div className="h-full">
            <WorkflowRunner onRunComplete={() => fetchWorkflows()} onCloseMonitor={() => fetchWorkflows()}>
                {(runWorkflow) => (
                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {/* Header with Breadcrumb-like title */}
                        <div className="flex items-center gap-2 px-1">
                            <Zap className="w-3.5 h-3.5 text-primary" />
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em]">
                                <span className="text-primary cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setShowTemplates(false)}>Automations</span>
                                <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                                <span className={cn("transition-colors duration-300", showTemplates ? "text-primary font-black animate-pulse" : "text-muted-foreground font-black")}>
                                    {showTemplates ? 'Template Repository' : 'Workflow Orchestrator'}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex bg-muted p-1 rounded-md border border-border/50">
                                    <button
                                        onClick={() => setShowTemplates(false)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                                            !showTemplates ? "bg-card text-primary shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        My Workflows
                                    </button>
                                    <button
                                        onClick={() => setShowTemplates(true)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all gap-2 flex items-center",
                                            showTemplates ? "bg-card text-primary shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Zap className={cn("w-2.5 h-2.5", showTemplates ? "text-primary" : "text-muted-foreground")} />
                                        Template Library
                                    </button>
                                </div>

                                {!showTemplates && (
                                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                                        <div>
                                            <Button
                                                onClick={handleImportClick}
                                                variant="outline"
                                                className="h-8 px-4 mx-2 rounded-md border-dashed border-primary/30 text-primary hover:bg-primary/5 font-black uppercase tracking-widest text-[10px] transition-all gap-2"
                                            >
                                                <Upload className="w-3.5 h-3.5" />
                                                Import File
                                            </Button>

                                            <Button
                                                onClick={() => { setIsPasteDialogOpen(true); setPasteJson(''); setPasteError(null); setParsedPreview(null); setImportServerId(''); setImportMode('create'); setUpdateTargetId(''); }}
                                                variant="outline"
                                                className="h-8 px-4 mx-2 rounded-xl border-dashed border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/5 font-black uppercase tracking-widest text-[9px] transition-all gap-2"
                                            >
                                                <ClipboardPaste className="w-3.5 h-3.5" />
                                                Paste JSON
                                            </Button>

                                            <Button
                                                onClick={() => setIsCreateDialogOpen(true)}
                                                className="h-8 px-4 mx-2 rounded-md premium-gradient font-black uppercase tracking-widest text-[10px] shadow-premium hover:shadow-indigo-500/25 transition-all gap-2"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                New Workflow
                                            </Button>
                                        </div>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                            accept=".json"
                                            className="hidden"
                                        />
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
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Organize Tags</label>
                                                    <TagSelector selectedTags={newWorkflowTags} onChange={setNewWorkflowTags} />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Default Target Resource (Mandatory)</label>
                                                    <SearchableSelect
                                                        options={availableServers.map(s => ({
                                                            label: `${s.name} (${s.host})`,
                                                            value: s.id,
                                                            searchTerms: `${s.name} ${s.host} ${s.description || ''}`
                                                        }))}
                                                        value={newWorkflowDefaultServerId}
                                                        onValueChange={(val) => setNewWorkflowDefaultServerId(val)}
                                                        onSearch={handleSearchServers}
                                                        placeholder="— Select target resource —"
                                                        isSearchable={true}
                                                        triggerClassName="h-9 text-sm"
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
                                                        disabled={!newWorkflowName.trim() || !newWorkflowDefaultServerId || isCreating}
                                                        className="h-9 text-[10px] font-bold uppercase tracking-widest px-6 premium-gradient"
                                                    >
                                                        {isCreating ? 'Creating...' : 'Initialize Pipeline'}
                                                    </Button>
                                                </DialogFooter>
                                            </form>
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </div>

                            <ResourceFilters
                                searchTerm={searchTerm}
                                onSearchChange={setSearchTerm}
                                onApply={handleApplyFilter}
                                filters={{ tags: selectedTagIds, createdBy: selectedCreatedBy, visibility: visibilityFilter }}
                                filterConfigs={[
                                    {
                                        key: 'visibility',
                                        placeholder: 'Visibility',
                                        type: 'single',
                                        options: [
                                            { label: 'All Status', value: 'all' },
                                            { label: 'Public Only', value: 'public' },
                                            { label: 'Draft Only', value: 'draft' }
                                        ]
                                    },
                                    {
                                        key: 'tags',
                                        placeholder: 'Tags',
                                        type: 'multi',
                                        isSearchable: true,
                                        onSearch: (query) => {
                                            apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace?.id}/tags?search=${encodeURIComponent(query)}`)
                                                .then(res => res.json())
                                                .then(data => {
                                                    setAvailableTags(data.items || (Array.isArray(data) ? data : []));
                                                })
                                                .catch(err => console.error('Failed to search tags:', err));
                                        },
                                        options: availableTags.map(t => ({ label: t.name, value: t.id }))
                                    },
                                    {
                                        key: 'createdBy',
                                        placeholder: 'Created By',
                                        type: 'single',
                                        isSearchable: true,
                                        onSearch: (query) => fetchUsers(query),
                                        options: [
                                            { label: 'All Creators', value: '' },
                                            ...availableUsers.map(u => ({ label: u.username, value: u.id }))
                                        ]
                                    }
                                ]}
                                searchPlaceholder={showTemplates ? "Search blueprint library..." : "Search workflows by name or description..."}
                                isLoading={isLoading}
                                onReset={() => {
                                    setSearchTerm('');
                                    setSelectedTagIds([]);
                                    setSelectedCreatedBy(undefined);
                                    setVisibilityFilter('all');
                                }}
                            />

                            <div className="rounded-md border border-border bg-card shadow-card overflow-hidden transition-all duration-500">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted hover:bg-muted/80 border-border">
                                            <TableHead className="w-[350px] h-9 font-black uppercase tracking-[0.15em] text-[10px] px-6 text-muted-foreground">Workflow Information</TableHead>
                                            {!showTemplates && (
                                                <TableHead className="font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground">Execution</TableHead>
                                            )}
                                            <TableHead className="font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground">Orchestration</TableHead>
                                            <TableHead className="font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground">Created By</TableHead>
                                            <TableHead className="font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground">Created At</TableHead>
                                            <TableHead className="text-right h-9 px-6 font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={showTemplates ? 5 : 6} className="h-32">
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
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className={cn(
                                                                    "text-sm font-black tracking-tight transition-colors",
                                                                    wf.is_public ? "group-hover:text-indigo-500" : "group-hover:text-amber-500"
                                                                )}>{wf.name}</p>
                                                                {!wf.is_public && (
                                                                    <SquareChartGantt className="w-3 h-3 text-amber-500 opacity-60" />
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-muted-foreground font-medium line-clamp-1 opacity-70 mb-1.5">
                                                                {wf.description || 'No description provided'}
                                                            </p>
                                                            {wf.tags && wf.tags.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-1">
                                                                    {wf.tags.map(tag => (
                                                                        <span
                                                                            key={tag.id}
                                                                            className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
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
                                                {!showTemplates && (
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "font-black text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md border-none",
                                                                wf.status === 'SUCCESS' ? "bg-emerald-500/10 text-emerald-500" :
                                                                    wf.status === 'FAILED' ? "bg-destructive/10 text-destructive" :
                                                                        wf.status === 'RUNNING' ? "bg-primary/10 text-primary animate-pulse" :
                                                                            "bg-muted text-muted-foreground"
                                                            )}
                                                        >
                                                            {wf.status}
                                                        </Badge>
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-all">
                                                        <div className="px-2 py-0.5 rounded bg-muted text-[10px] font-bold">
                                                            {wf.group_count || 0} Groups
                                                        </div>
                                                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                                        <div className="px-2 py-0.5 rounded bg-muted text-[10px] font-bold">
                                                            {wf.step_count || 0} Steps
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {(wf as any).created_by_username ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-black text-primary uppercase shrink-0">
                                                                {(wf as any).created_by_username[0]}
                                                            </div>
                                                            <span className="text-[10px] font-semibold text-muted-foreground">{(wf as any).created_by_username}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-muted-foreground/40 italic">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs font-semibold text-muted-foreground/60 tracking-tight">
                                                    {wf.created_at ? new Date(wf.created_at).toLocaleString() : 'Never'}
                                                </TableCell>
                                                <TableCell className="text-right px-8">
                                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                                                        {showTemplates ? (
                                                            <div className="flex gap-1 items-center">
                                                                <Button
                                                                    onClick={() => handleClone(wf)}
                                                                    className="h-8 rounded-md bg-amber-500/10 text-amber-600 font-black uppercase tracking-widest text-[10px] px-4 gap-2 hover:bg-amber-500 hover:text-white border border-amber-500/20 transition-all shadow-sm"
                                                                >
                                                                    <Plus className="w-3 h-3" />
                                                                    Apply Template
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => navigate(`/workflows/${wf.id}/edit`)}
                                                                    className="w-10 h-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                                >
                                                                    <Settings className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => setDeleteTarget(wf)}
                                                                    className="w-10 h-8 rounded-md hover:bg-destructive/10 hover:text-destructive"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => runWorkflow(wf)}
                                                                    className="w-10 rounded-md hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
                                                                >
                                                                    <Play className="w-4 h-4 fill-current" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => handleExportWorkflow(wf)}
                                                                    className="w-10 rounded-xl hover:bg-cyan-500/10 hover:text-cyan-500 transition-colors"
                                                                    title="Export as JSON"
                                                                >
                                                                    <Download className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => navigate(`/workflows/${wf.id}/edit`)}
                                                                    className="w-10 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                                >
                                                                    <Settings className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => setDeleteTarget(wf)}
                                                                    className="w-10 rounded-md hover:bg-destructive/10 hover:text-destructive"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={showTemplates ? 5 : 6} className="h-48 text-center">
                                                    <div className="flex flex-col items-center justify-center gap-3 opacity-30">
                                                        <Zap className="w-12 h-12" />
                                                        <p className="text-xs font-black uppercase tracking-widest">
                                                            {showTemplates ? 'No templates in blueprint library' : 'No workflows found in this namespace'}
                                                        </p>
                                                        {!showTemplates && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setIsCreateDialogOpen(true)}
                                                                className="mt-2 rounded-full border-dashed"
                                                            >
                                                                Create your first workflow
                                                            </Button>
                                                        )}
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
                                itemName={showTemplates ? "Templates" : "Workflows"}
                                onPageChange={setOffset}
                            />
                        </div>
                    </div>
                )}
            </WorkflowRunner>

            <ConfirmDialog
                isOpen={!!cloneTarget}
                onClose={() => setCloneTarget(null)}
                onConfirm={confirmClone}
                title="Deploy Template"
                description={`Are you sure you want to deploy the automation "${cloneTarget?.name}" into your current workspace?`}
                confirmText="Deploy Automation"
                variant="success"
                isLoading={isCloning}
            />

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title="Delete Automation"
                description={`Are you sure you want to delete the automation "${deleteTarget?.name}"? This action can be undone by an administrator.`}
                confirmText="Delete Automation"
                variant="danger"
                isLoading={isDeleting}
            />

            <Dialog open={isPasteDialogOpen} onOpenChange={setIsPasteDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ClipboardPaste className="w-5 h-5 text-cyan-500" />
                            Import Workflow from JSON
                        </DialogTitle>
                        <DialogDescription>
                            Paste workflow JSON generated by AI or exported from another instance.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setImportMode('create'); setUpdateTargetId(''); }}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-widest transition-all",
                                    importMode === 'create'
                                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-500"
                                        : "border-border text-muted-foreground hover:border-muted-foreground/50"
                                )}
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Create New
                            </button>
                            <button
                                onClick={() => setImportMode('update')}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-widest transition-all",
                                    importMode === 'update'
                                        ? "border-amber-500 bg-amber-500/10 text-amber-500"
                                        : "border-border text-muted-foreground hover:border-muted-foreground/50"
                                )}
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Update Existing
                            </button>
                        </div>

                        {importMode === 'update' && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Target Workflow to Update (Required)</label>
                                <SearchableSelect
                                    options={workflows.map(w => ({
                                        label: w.name,
                                        value: w.id,
                                        searchTerms: `${w.name} ${w.description || ''}`
                                    }))}
                                    value={updateTargetId}
                                    onValueChange={(val) => setUpdateTargetId(val)}
                                    placeholder="— Select workflow to overwrite —"
                                    isSearchable={true}
                                    triggerClassName="h-10 text-sm"
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Workflow JSON</label>
                            <textarea
                                value={pasteJson}
                                onChange={(e) => handlePasteJsonChange(e.target.value)}
                                placeholder={'{\n  "name": "My Workflow",\n  "description": "...",\n  "groups": [...]\n}'}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono min-h-[200px] resize-y"
                                spellCheck={false}
                            />
                        </div>

                        {pasteError && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                <p className="text-xs font-medium text-destructive">{pasteError}</p>
                            </div>
                        )}

                        {parsedPreview && (
                            <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Valid JSON — Preview</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Name</p>
                                        <p className="text-sm font-semibold truncate">{parsedPreview.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Description</p>
                                        <p className="text-sm font-medium text-muted-foreground truncate">{parsedPreview.description || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Groups</p>
                                        <p className="text-sm font-semibold">{parsedPreview.groupCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Steps</p>
                                        <p className="text-sm font-semibold">{parsedPreview.stepCount}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-primary">
                                Default Target Resource {importMode === 'create' ? '(Required)' : '(Optional — leave empty to keep current)'}
                            </label>
                            <SearchableSelect
                                options={availableServers.map(s => ({
                                    label: `${s.name} (${s.host})`,
                                    value: s.id,
                                    searchTerms: `${s.name} ${s.host} ${s.description || ''}`
                                }))}
                                value={importServerId}
                                onValueChange={(val) => setImportServerId(val)}
                                onSearch={handleSearchServers}
                                placeholder="— Select target resource —"
                                isSearchable={true}
                                triggerClassName="h-10 text-sm"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsPasteDialogOpen(false)}
                            className="h-9 text-[10px] font-bold uppercase tracking-widest px-6"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handlePasteImportConfirm}
                            disabled={
                                !parsedPreview || isPasteImporting
                                || (importMode === 'create' && !importServerId)
                                || (importMode === 'update' && !updateTargetId)
                            }
                            className={cn(
                                "h-9 text-[10px] font-bold uppercase tracking-widest px-6 text-white",
                                importMode === 'update'
                                    ? "bg-amber-600 hover:bg-amber-700"
                                    : "bg-cyan-600 hover:bg-cyan-700"
                            )}
                        >
                            {isPasteImporting
                                ? (importMode === 'update' ? 'Updating...' : 'Importing...')
                                : (importMode === 'update' ? 'Update Workflow' : 'Import Workflow')
                            }
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                isOpen={showOverwriteConfirm}
                onClose={() => setShowOverwriteConfirm(false)}
                onConfirm={handlePasteImport}
                title="Overwrite Workflow"
                description={`This will overwrite the workflow "${workflows.find(w => w.id === updateTargetId)?.name || ''}" with the imported JSON. All existing groups, steps, inputs, and variables will be replaced. This action cannot be undone.`}
                confirmText="Yes, Overwrite"
                variant="danger"
                isLoading={isPasteImporting}
            />
        </div>
    );
};

export default WorkflowPage;
