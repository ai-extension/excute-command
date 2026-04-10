import React, { useState, useEffect } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { formatToLocalInput, convertToUTC } from '../lib/date';
import { Schedule, Workflow, Tag } from '../types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import ScheduleCalendar from '../components/ScheduleCalendar';
import { ScheduleHeader } from '../components/schedules/ScheduleHeader';
import { ScheduleTable } from '../components/schedules/ScheduleTable';
import { ScheduleFormDialog } from '../components/schedules/ScheduleFormDialog';
import { WorkflowPickerDialog } from '../components/WorkflowPickerDialog';
import { useUsers } from '../hooks/useUsers';
import WorkflowInputDialog from '../components/WorkflowInputDialog';
import { WorkflowInput } from '../types';

const SchedulesPage = () => {
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [appliedSearchTerm, setAppliedSearchTerm] = useState('');
    const [appliedTagIds, setAppliedTagIds] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [selectedCreatedBy, setSelectedCreatedBy] = useState<string | undefined>(undefined);
    const { users: availableUsers, fetchUsers } = useUsers();
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);

    const fetchTags = async (query: string = '') => {
        if (!activeNamespace) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/tags?search=${query}&limit=50`);
            const data = await response.json();
            setAvailableTags(data.items || []);
        } catch (error) {
            console.error('Failed to fetch tags:', error);
        }
    };

    const [limit, setLimit] = useState(15);
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(0);

    const [formData, setFormData] = useState({
        name: '',
        type: 'ONE_TIME',
        cron_expression: '',
        next_run_at: '',
        status: 'ACTIVE',
        retries: 0,
        workflows: [] as { id: string, name: string, inputs: string }[],
        hooks: [] as any[],
        tags: [] as Tag[],
        catch_up: false
    });

    const [isEditing, setIsEditing] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Workflow input dialog state
    const [isInputDialogOpen, setIsInputDialogOpen] = useState(false);
    const [pendingWorkflow, setPendingWorkflow] = useState<Workflow | null>(null);

    const fetchSchedules = async () => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/schedules?limit=${limit}&offset=${offset}`;
            if (appliedSearchTerm) url += `&search=${encodeURIComponent(appliedSearchTerm)}`;
            if (appliedTagIds.length > 0) {
                appliedTagIds.forEach(id => {
                    url += `&tag_ids=${id}`;
                });
            }
            if (selectedCreatedBy) url += `&created_by=${selectedCreatedBy}`;
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

    useEffect(() => {
        fetchSchedules();
        fetchTags();
    }, [activeNamespace, offset, limit, appliedSearchTerm, appliedTagIds, selectedCreatedBy]);

    const handleSaveSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeNamespace) return;
        setIsSubmitting(true);
        try {
            const method = isEditing ? 'PUT' : 'POST';
            const url = isEditing
                ? `${API_BASE_URL}/schedules/${editingSchedule?.id}`
                : `${API_BASE_URL}/namespaces/${activeNamespace.id}/schedules`;

            const payload = {
                ...formData,
                next_run_at: formData.type === 'ONE_TIME' && formData.next_run_at
                    ? convertToUTC(formData.next_run_at)
                    : formData.next_run_at,
                tags: formData.tags,
                workflows: formData.workflows.map(w => ({ id: w.id, inputs: w.inputs })),
                hooks: formData.hooks.map((h, idx) => ({ ...h, order: idx }))
            };

            const response = await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                await fetchSchedules();
                setIsFormOpen(false);
                setIsEditing(false);
                setEditingSchedule(null);
            }
        } catch (error) {
            console.error('Failed to save schedule:', error);
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
                setDeleteTarget(null);
            }
        } catch (error) {
            console.error('Failed to delete schedule:', error);
        } finally {
            setIsDeleting(false);
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

    const handleOpenForm = (schedule?: Schedule, date?: Date) => {
        if (schedule) {
            setIsEditing(true);
            setEditingSchedule(schedule);

            setFormData({
                name: schedule.name,
                type: schedule.type,
                cron_expression: schedule.cron_expression || '',
                next_run_at: formatToLocalInput(schedule.next_run_at),
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
        } else {
            setIsEditing(false);
            setEditingSchedule(null);

            // Default next run to now
            const now = new Date();

            setFormData({
                name: '',
                type: 'ONE_TIME',
                cron_expression: '0 0 * * *',
                next_run_at: formatToLocalInput(now),
                status: 'ACTIVE',
                retries: 0,
                workflows: [],
                hooks: [],
                tags: [],
                catch_up: true
            });
        }
        setIsFormOpen(true);
    };

    const handleWorkflowSelect = (workflow: Workflow) => {
        if (workflow.inputs && workflow.inputs.length > 0) {
            setPendingWorkflow(workflow);
            setIsInputDialogOpen(true);
        } else {
            setFormData(prev => ({
                ...prev,
                workflows: [...prev.workflows, {
                    id: workflow.id,
                    name: workflow.name,
                    inputs: '{}'
                }]
            }));
            setIsPickerOpen(false);
        }
    };

    const handleConfirmScheduleWorkflowInputs = (values: Record<string, string>) => {
        if (!pendingWorkflow) return;

        setFormData(prev => ({
            ...prev,
            workflows: [...prev.workflows, {
                id: pendingWorkflow.id,
                name: pendingWorkflow.name,
                inputs: JSON.stringify(values)
            }]
        }));

        setIsInputDialogOpen(false);
        setPendingWorkflow(null);
        setIsPickerOpen(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <ScheduleHeader
                viewMode={viewMode}
                setViewMode={setViewMode}
                onNewSchedule={() => handleOpenForm()}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onApplyFilter={(search: string, filters: { [key: string]: any }) => {
                    setAppliedSearchTerm(search);
                    setAppliedTagIds(filters.tagIds || []);
                    setSelectedCreatedBy(filters.createdBy);
                    setOffset(0);
                }}
                selectedCreatedBy={selectedCreatedBy}
                availableUsers={availableUsers}
                onFetchUsers={fetchUsers}
                availableTags={availableTags}
                onFetchTags={fetchTags}
                onReset={() => {
                    setSearchTerm('');
                    setAppliedSearchTerm('');
                    setSelectedCreatedBy(undefined);
                    setAppliedTagIds([]);
                }}
            />

            {viewMode === 'list' ? (
                <ScheduleTable
                    schedules={schedules}
                    isLoading={isLoading}
                    onEdit={handleOpenForm}
                    onDelete={handleDelete}
                    onToggleStatus={handleToggleStatus}
                    total={total}
                    offset={offset}
                    limit={limit}
                    onPageChange={setOffset}
                />
            ) : (
                <ScheduleCalendar
                    schedules={schedules}
                    onEdit={handleOpenForm}
                    onToggleStatus={handleToggleStatus}
                    onCreate={(date: Date) => handleOpenForm(undefined, date)}
                />
            )}

            <ScheduleFormDialog
                isOpen={isFormOpen}
                onOpenChange={setIsFormOpen}
                isEditing={isEditing}
                isSubmitting={isSubmitting}
                formData={formData}
                setFormData={setFormData}
                onSubmit={handleSaveSchedule}
                setIsPickerOpen={setIsPickerOpen}
            />

            <WorkflowPickerDialog
                isOpen={isPickerOpen}
                onOpenChange={setIsPickerOpen}
                onSelect={handleWorkflowSelect}
            />

            <WorkflowInputDialog
                isOpen={isInputDialogOpen}
                onOpenChange={setIsInputDialogOpen}
                inputs={pendingWorkflow?.inputs as WorkflowInput[] || []}
                onConfirm={handleConfirmScheduleWorkflowInputs}
                onCancel={() => {
                    setIsInputDialogOpen(false);
                    setPendingWorkflow(null);
                }}
            />

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Delete Schedule"
                description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
                confirmText="Delete"
                variant="danger"
                onConfirm={confirmDelete}
                isLoading={isDeleting}
            />
        </div>
    );
};

export default SchedulesPage;
