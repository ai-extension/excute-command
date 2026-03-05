import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Plus, Search, MoreHorizontal, Trash2, Edit3, Clock, Play, Pause, Zap, CheckCircle2, Circle, LayoutList, CalendarDays, ChevronRight } from 'lucide-react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { Card } from '../components/ui/card';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { Schedule, Workflow, WorkflowInput, Tag } from '../types';
import { TagSelector } from '../components/TagSelector';
import { Pagination } from '../components/Pagination';
import { ResourceFilters } from '../components/ResourceFilters';
import { ConfirmDialog } from '../components/ConfirmDialog';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import WorkflowInputDialog from '../components/WorkflowInputDialog';
import { AlertCircle } from 'lucide-react';
import ScheduleCalendar from '../components/ScheduleCalendar';
import HookManager from '../components/HookManager';
import { WorkflowHook } from '../types';
import { Switch } from '../components/ui/switch';

const SchedulesPage = () => {
    const navigate = useNavigate();
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
    const [appliedTagIds, setAppliedTagIds] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [activeDialogTab, setActiveDialogTab] = useState<'config' | 'hooks'>('config');

    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    const [formData, setFormData] = useState({
        name: '',
        type: 'ONE_TIME',
        cron_expression: '',
        next_run_at: '',
        status: 'ACTIVE',
        retries: 0,
        workflows: [] as { id: string, name: string, inputs: string }[],
        hooks: [] as WorkflowHook[],
        tags: [] as Tag[],
        catch_up: false
    });

    const [isEditing, setIsEditing] = useState(false);
    const [editingID, setEditingID] = useState<string | null>(null);

    const [isInputDialogOpen, setIsInputDialogOpen] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pendingWorkflow, setPendingWorkflow] = useState<Workflow | null>(null);
    const [workflowSearch, setWorkflowSearch] = useState('');

    const [total, setTotal] = useState(0);

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [availableTags, setAvailableTags] = useState<Tag[]>([]);

    const fetchSchedules = async (searchOverride?: string, tagIdsOverride?: string[]) => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            const search = searchOverride !== undefined ? searchOverride : appliedSearchTerm;
            const tagIds = tagIdsOverride !== undefined ? tagIdsOverride : appliedTagIds;

            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/schedules?limit=${limit}&offset=${offset}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (tagIds.length > 0) {
                tagIds.forEach(id => {
                    url += `&tag_ids=${id}`;
                });
            }
            const response = await apiFetch(url);
            const data = await response.json();
            setSchedules(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch schedules:', error);
        } finally {
            setIsLoading(false);
        }
    };

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

    useEffect(() => {
        fetchSchedules();
        fetchWorkflows();
        fetchTags();
    }, [activeNamespace, offset, limit, appliedSearchTerm, appliedTagIds]);

    const handleApplyFilter = (search: string, filters: { [key: string]: any }) => {
        setSearchTerm(search);
        setAppliedSearchTerm(search);
        setAppliedTagIds(filters.tags || []);
        setOffset(0);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeNamespace) return;
        setIsSubmitting(true);
        try {
            const method = isEditing ? 'PUT' : 'POST';
            const url = isEditing
                ? `${API_BASE_URL}/schedules/${editingID}`
                : `${API_BASE_URL}/namespaces/${activeNamespace.id}/schedules`;

            const payload = {
                ...formData,
                next_run_at: formData.type === 'ONE_TIME' && formData.next_run_at
                    ? new Date(formData.next_run_at).toISOString()
                    : formData.next_run_at,
                tags: formData.tags,
                workflows: formData.workflows.map(w => ({ id: w.id, inputs: w.inputs })),
                hooks: formData.hooks.map((h, idx) => ({ ...h, order: idx, target_workflow: undefined }))
            };
            console.log('[SchedulesPage] Sending payload:', payload);

            const response = await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                await fetchSchedules();
                setIsCreateOpen(false);
                setIsEditing(false);
                setEditingID(null);
                setFormData({ name: '', type: 'ONE_TIME', cron_expression: '', next_run_at: '', status: 'ACTIVE', retries: 0, workflows: [], hooks: [], tags: [], catch_up: false });
                setActiveDialogTab('config');
            }
        } catch (error) {
            console.error('Failed to create schedule:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (schedule: Schedule) => {
        setDeleteTarget(schedule);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/schedules/${deleteTarget.id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await fetchSchedules();
            }
        } catch (error) {
            console.error('Failed to delete schedule:', error);
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    const handleToggleStatus = async (id: string) => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/schedules/${id}/toggle`, {
                method: 'POST'
            });
            if (response.ok) {
                await fetchSchedules();
            }
        } catch (error) {
            console.error('Failed to toggle schedule status:', error);
        }
    };

    const handleEdit = (schedule: Schedule) => {
        setIsEditing(true);
        setEditingID(schedule.id);
        const formatForInput = (isoString?: string) => {
            if (!isoString) return '';
            try {
                // Ensure the string is proper ISO, slice off the Z and decimal seconds if needed
                return new Date(isoString).toISOString().slice(0, 16);
            } catch (e) {
                return '';
            }
        };

        setFormData({
            name: schedule.name,
            type: schedule.type,
            cron_expression: schedule.cron_expression || '',
            next_run_at: formatForInput(schedule.next_run_at),
            status: schedule.status,
            retries: schedule.retries || 0,
            workflows: schedule.scheduled_workflows?.map(sw => ({
                id: sw.workflow_id,
                name: sw.workflow?.name || 'Unknown',
                inputs: sw.inputs || '{}'
            })) || [],
            hooks: schedule.hooks || [],
            tags: schedule.tags || [],
            catch_up: schedule.catch_up || false
        });
        setIsCreateOpen(true);
    };

    const handleCreateFromCalendar = (date: Date) => {
        setIsEditing(false);
        setEditingID(null);

        // Preserve local time visually when pre-filling
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        const dateString = localDate.toISOString().slice(0, 16);

        setFormData({
            name: '',
            type: 'ONE_TIME',
            cron_expression: '',
            next_run_at: dateString,
            status: 'ACTIVE',
            retries: 0,
            workflows: [],
            hooks: [],
            tags: [],
            catch_up: false
        });
        setIsCreateOpen(true);
    };



    const handleSelectWorkflow = (wf: Workflow) => {
        if (wf.inputs && wf.inputs.length > 0) {
            setPendingWorkflow(wf);
            setIsInputDialogOpen(true);
        } else {
            addWorkflowToForm(wf, {});
        }
    };

    const addWorkflowToForm = (wf: Workflow, inputs: Record<string, string>) => {
        setFormData(prev => ({
            ...prev,
            workflows: [...prev.workflows, {
                id: wf.id,
                name: wf.name,
                inputs: JSON.stringify(inputs)
            }]
        }));
    };

    const removeWorkflowFromForm = (index: number) => {
        setFormData(prev => ({
            ...prev,
            workflows: prev.workflows.filter((_, i) => i !== index)
        }));
    };

    return (
        <>
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 px-1">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                        <span className="text-primary">Automations</span>
                        <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                        <span className="text-muted-foreground font-black">Schedules</span>
                    </div>
                </div>

                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <span className="hidden" />
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black tracking-tight">
                                {isEditing ? 'Edit Automation' : 'Create Automation'}
                            </DialogTitle>
                            <div className="flex p-0.5 bg-muted/50 rounded-lg border border-border mt-4">
                                <button
                                    type="button"
                                    onClick={() => setActiveDialogTab('config')}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        activeDialogTab === 'config' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Clock className="w-3 h-3" /> Configuration
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveDialogTab('hooks')}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        activeDialogTab === 'hooks' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Zap className="w-3 h-3" /> Hooks
                                </button>
                            </div>
                        </DialogHeader>

                        <form onSubmit={handleCreate} className="space-y-4 py-4">
                            {activeDialogTab === 'config' ? (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Plan Name</Label>
                                        <Input
                                            placeholder="e.g. Daily Database Backup"
                                            className="h-10 bg-muted/30 border-border rounded-xl font-bold tracking-tight focus:bg-background transition-all"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Type</Label>
                                            <select
                                                className="w-full h-10 bg-muted/30 border border-border rounded-xl font-bold px-3 text-xs outline-none focus:bg-background transition-all"
                                                value={formData.type}
                                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                            >
                                                <option value="ONE_TIME">ONE-TIME</option>
                                                <option value="RECURRING">RECURRING</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            {formData.type === 'RECURRING' ? (
                                                <>
                                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Cron Expression</Label>
                                                    <Input
                                                        placeholder="* * * * * *"
                                                        className="h-10 bg-muted/30 border-border rounded-xl font-bold font-mono text-xs"
                                                        value={formData.cron_expression}
                                                        onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                                                        required
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Next Run (ISO)</Label>
                                                    <div className="relative group/datetime">
                                                        <style dangerouslySetInnerHTML={{
                                                            __html: `
                                                            input[type="datetime-local"]::-webkit-calendar-picker-indicator {
                                                                position: absolute;
                                                                left: 0;
                                                                top: 0;
                                                                width: 100%;
                                                                height: 100%;
                                                                margin: 0;
                                                                padding: 0;
                                                                cursor: pointer;
                                                                opacity: 0;
                                                            }
                                                        `}} />
                                                        <Input
                                                            type="datetime-local"
                                                            className="h-12 bg-muted/30 border-border rounded-xl font-bold text-sm pl-10 pr-4 transition-all focus:bg-background cursor-pointer [color-scheme:dark]"
                                                            value={formData.next_run_at}
                                                            onChange={(e) => setFormData({ ...formData, next_run_at: e.target.value })}
                                                            required
                                                        />
                                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary/60 group-hover/datetime:text-primary group-focus-within/datetime:text-primary transition-colors">
                                                            <CalendarDays className="w-5 h-5 transition-transform group-hover/datetime:scale-110" />
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Max Retries</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                max="5"
                                                className="h-10 bg-muted/30 border-border rounded-xl font-bold text-xs transition-all"
                                                value={formData.retries}
                                                onChange={(e) => setFormData({ ...formData, retries: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Initial Status</Label>
                                            <select
                                                className="w-full h-10 bg-muted/30 border border-border rounded-xl font-bold px-3 text-xs outline-none focus:bg-background transition-all"
                                                value={formData.status}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                            >
                                                <option value="ACTIVE">ACTIVE</option>
                                                <option value="PAUSED">PAUSED</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-xl">
                                        <div className="space-y-0.5">
                                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Catch-up</Label>
                                            <p className="text-[9px] text-muted-foreground font-medium ml-1">Run missed jobs if server was offline.</p>
                                        </div>
                                        <Switch
                                            checked={formData.catch_up}
                                            onCheckedChange={(checked) => setFormData({ ...formData, catch_up: checked })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Tags</Label>
                                        <TagSelector
                                            selectedTags={formData.tags}
                                            onChange={(tags) => setFormData({ ...formData, tags })}
                                        />
                                    </div>
                                    <p className="text-[9px] text-muted-foreground font-medium px-1 italic">Retries occur every 10 seconds upon workflow failure.</p>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Workflows to Execute</Label>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setIsPickerOpen(true)}
                                                className="h-8 text-[9px] font-black uppercase tracking-widest rounded-lg border-primary/20 bg-primary/5 text-primary"
                                            >
                                                <Plus className="w-3 h-3 mr-1" /> Add Workflow
                                            </Button>
                                        </div>

                                        <div className="space-y-2">
                                            {formData.workflows.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-8 bg-muted/20 border border-dashed border-border rounded-xl">
                                                    <AlertCircle className="w-6 h-6 text-muted-foreground/20 mb-2" />
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">No workflows selected</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 text-slate-200">
                                                    {formData.workflows.map((wf, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-xl group transition-all">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-2">
                                                                    <Zap className="w-3 h-3 text-primary" />
                                                                    <span className="text-[11px] font-black uppercase tracking-tight">{wf.name}</span>
                                                                </div>
                                                                {wf.inputs !== "{}" && (
                                                                    <p className="text-[9px] font-medium text-muted-foreground truncate max-w-[200px]">
                                                                        Inputs: {wf.inputs}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                                onClick={() => removeWorkflowFromForm(idx)}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-8 max-h-[500px] overflow-y-auto pr-1">
                                    <HookManager
                                        hooks={formData.hooks}
                                        workflows={workflows}
                                        hookType="BEFORE"
                                        onChange={(hooks) => setFormData({ ...formData, hooks })}
                                    />
                                    <div className="h-px bg-border/40 w-full" />
                                    <HookManager
                                        hooks={formData.hooks}
                                        workflows={workflows}
                                        hookType="AFTER_SUCCESS"
                                        onChange={(hooks) => setFormData({ ...formData, hooks })}
                                    />
                                    <div className="h-px bg-border/40 w-full" />
                                    <HookManager
                                        hooks={formData.hooks}
                                        workflows={workflows}
                                        hookType="AFTER_FAILED"
                                        onChange={(hooks) => setFormData({ ...formData, hooks })}
                                    />
                                </div>
                            )}

                            <DialogFooter className="pt-4">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting || formData.workflows.length === 0}
                                    className="premium-gradient font-black uppercase tracking-widest text-[10px] w-full shadow-premium rounded-xl"
                                >
                                    {isSubmitting ? "Syncing..." : isEditing ? "Save Changes" : "Schedule Automation"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog >

                <ConfirmDialog
                    isOpen={!!deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={confirmDelete}
                    title="Delete Schedule"
                    description={`Are you sure you want to delete the schedule "${deleteTarget?.name}"? Any recurring automation associated with this will stop.`}
                    confirmText="Delete Schedule"
                    variant="danger"
                    isLoading={isDeleting}
                />

                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex bg-muted p-1 rounded-xl border border-border/50">
                            <button
                                onClick={() => setViewMode('list')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                    viewMode === 'list' ? "bg-card text-primary shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <LayoutList className={cn("w-3 h-3", viewMode === 'list' ? "text-primary" : "text-muted-foreground")} />
                                List View
                            </button>
                            <button
                                onClick={() => setViewMode('calendar')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all gap-2 flex items-center",
                                    viewMode === 'calendar' ? "bg-card text-primary shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <CalendarDays className={cn("w-3 h-3", viewMode === 'calendar' ? "text-primary" : "text-muted-foreground")} />
                                Calendar View
                            </button>
                        </div>
                        <Button
                            onClick={() => {
                                setIsEditing(false);
                                setEditingID(null);
                                setFormData({ name: '', type: 'ONE_TIME', cron_expression: '', next_run_at: '', status: 'ACTIVE', retries: 0, workflows: [], hooks: [], tags: [], catch_up: false });
                                setIsCreateOpen(true);
                            }}
                            className="h-9 px-4 rounded-xl premium-gradient text-[10px] font-black uppercase tracking-widest shadow-premium transition-all active:scale-95 gap-2"
                        >
                            <Plus className="w-4 h-4" /> New Schedule
                        </Button>
                    </div>

                    <ResourceFilters
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        onApply={handleApplyFilter}
                        filters={{ tags: appliedTagIds }}
                        filterConfigs={[
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
                            }
                        ]}
                        searchPlaceholder="Search schedules..."
                        isLoading={isLoading}
                    />
                </div>

                <div className="mt-4">
                    {viewMode === 'calendar' ? (
                        <ScheduleCalendar
                            schedules={schedules}
                            onEdit={handleEdit}
                            onToggleStatus={handleToggleStatus}
                            onCreate={handleCreateFromCalendar}
                        />
                    ) : (
                        <Card className="border-border bg-card shadow-premium overflow-hidden rounded-2xl">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 border-border hover:bg-muted/50">
                                        <TableHead className="w-[300px] h-14 font-black uppercase tracking-widest text-[9px] px-8">Schedule</TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[9px]">Timing & Pattern</TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[9px]">Performance</TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[9px]">Workflows</TableHead>
                                        <TableHead className="font-black uppercase tracking-widest text-[9px]">Created By</TableHead>
                                        <TableHead className="text-right h-14 px-8 font-black uppercase tracking-widest text-[9px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-48 text-center bg-transparent">
                                                <div className="flex flex-col items-center justify-center gap-3">
                                                    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Synchronizing chronometer...</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : schedules.length > 0 ? schedules.map((s) => (
                                        <TableRow key={s.id} className="group border-border hover:bg-muted/30 transition-all duration-200">
                                            <TableCell className="px-8 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm shrink-0 transition-colors",
                                                        s.status === 'ACTIVE' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-slate-500/10 border-slate-500/20"
                                                    )}>
                                                        <Clock className={cn("w-5 h-5", s.status === 'ACTIVE' ? "text-emerald-500" : "text-slate-500")} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p
                                                                className="text-sm font-black tracking-tight text-white uppercase cursor-pointer hover:text-primary transition-colors"
                                                                onClick={() => navigate(`/schedules/${s.id}`)}
                                                            >
                                                                {s.name}
                                                            </p>
                                                            <Badge className={cn(
                                                                "font-black text-[8px] uppercase tracking-widest px-1.5 py-0 rounded",
                                                                s.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-slate-500/10 text-slate-500 border-slate-500/10"
                                                            )}>
                                                                {s.status}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <Badge variant="outline" className="text-[8px] font-black tracking-widest bg-muted/20 px-1.5 py-0 border-white/5">
                                                                {s.type}
                                                            </Badge>
                                                            <span className="text-[10px] text-muted-foreground font-bold opacity-40">
                                                                {s.id.substring(0, 8)}
                                                            </span>
                                                        </div>
                                                        {s.tags && s.tags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                {s.tags.map(tag => (
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
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="w-3.5 h-3.5 text-muted-foreground/40" />
                                                        <span className="text-[11px] font-black text-slate-300">
                                                            {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : 'Not set/Finished'}
                                                        </span>
                                                    </div>
                                                    {s.type === 'RECURRING' && (
                                                        <code className="text-[9px] font-bold text-indigo-400 font-mono opacity-80">
                                                            {s.cron_expression}
                                                        </code>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        {s.type === 'ONE_TIME' ? (
                                                            <span className={cn(
                                                                "text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded",
                                                                s.total_runs > 0 ? "bg-indigo-500/10 text-indigo-400" : "bg-muted text-muted-foreground opacity-40"
                                                            )}>
                                                                {s.total_runs > 0 ? 'EXECUTED' : 'PENDING'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-black text-emerald-500/80">
                                                                RUNS: {s.total_runs}
                                                            </span>
                                                        )}

                                                        {s.last_run_status && (
                                                            <Badge className={cn(
                                                                "font-black text-[8px] uppercase tracking-widest px-1.5 py-0 rounded",
                                                                s.last_run_status === 'SUCCESS' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                                    s.last_run_status === 'FAILED' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                                        "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                            )}>
                                                                {s.last_run_status}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {s.retries > 0 && (
                                                        <span className="text-[9px] font-bold text-amber-500/60 uppercase">
                                                            Retries: {s.retries}x
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {s.scheduled_workflows?.map(sw => (
                                                        <Badge key={sw.id} variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-black text-[8px] px-1.5 py-0.5 rounded-md">
                                                            {sw.workflow?.name?.split(' ')[0] || 'Unknown'}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {s.created_by_username ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-black text-primary uppercase shrink-0">
                                                            {s.created_by_username[0]}
                                                        </div>
                                                        <span className="text-[10px] font-semibold text-muted-foreground">{s.created_by_username}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground/40 italic">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right px-8">
                                                <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="rounded-xl hover:bg-muted transition-colors text-zinc-400 hover:text-white"
                                                        onClick={() => handleToggleStatus(s.id)}
                                                        title={s.status === 'ACTIVE' ? "Pause" : "Activate"}
                                                    >
                                                        {s.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 rounded-xl hover:bg-muted transition-colors text-zinc-400 hover:text-white"
                                                        onClick={() => handleEdit(s)}
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors text-zinc-400"
                                                        onClick={() => handleDelete(s)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-48 text-center bg-transparent">
                                                <div className="flex flex-col items-center justify-center gap-4 opacity-40">
                                                    <Calendar className="w-10 h-10" />
                                                    <div className="space-y-1">
                                                        <p className="text-[11px] font-black uppercase tracking-[0.2em]">No active schedules</p>
                                                        <p className="text-[9px] font-bold opacity-60">Plan your first automation to optimize operations.</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>

                            <Pagination
                                total={total}
                                offset={offset}
                                limit={limit}
                                itemName="Schedules"
                                onPageChange={setOffset}
                            />
                        </Card>
                    )
                    }

                    <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                        <DialogContent className="sm:max-w-[400px]">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-black uppercase tracking-tight">Select Workflow</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Filter blueprints..."
                                        className="pl-10 h-10 rounded-xl"
                                        value={workflowSearch}
                                        onChange={(e) => setWorkflowSearch(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                    {workflows
                                        .filter(wf => wf.name.toLowerCase().includes(workflowSearch.toLowerCase()))
                                        .map(wf => (
                                            <div
                                                key={wf.id}
                                                className="flex items-center justify-between p-4 bg-muted/20 hover:bg-muted/40 border border-border rounded-2xl cursor-pointer transition-all group"
                                                onClick={() => {
                                                    handleSelectWorkflow(wf);
                                                    setIsPickerOpen(false);
                                                    setWorkflowSearch('');
                                                }}
                                            >
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-bold text-sm tracking-tight text-white">{wf.name}</span>
                                                    <span className="text-[9px] opacity-40 uppercase font-black tracking-widest">{wf.inputs?.length || 0} inputs required</span>
                                                </div>
                                                <Plus className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isInputDialogOpen} onOpenChange={setIsInputDialogOpen}>
                        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-slate-950 border-white/10 rounded-2xl shadow-2xl">
                            {pendingWorkflow && (
                                <>
                                    <DialogHeader className="p-6 border-b border-white/5 bg-slate-900/40">
                                        <DialogTitle className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                                <Zap className="w-4 h-4 text-indigo-400" />
                                            </div>
                                            Configure {pendingWorkflow.name}
                                        </DialogTitle>
                                    </DialogHeader>
                                    <WorkflowInputDialog
                                        inputs={pendingWorkflow.inputs as WorkflowInput[]}
                                        onConfirm={(values) => {
                                            addWorkflowToForm(pendingWorkflow, values);
                                            setIsInputDialogOpen(false);
                                            setPendingWorkflow(null);
                                        }}
                                        onCancel={() => {
                                            setIsInputDialogOpen(false);
                                            setPendingWorkflow(null);
                                        }}
                                    />
                                </>
                            )}
                        </DialogContent>
                    </Dialog>
                </div>
            </div >
        </>
    );
};

export default SchedulesPage;
