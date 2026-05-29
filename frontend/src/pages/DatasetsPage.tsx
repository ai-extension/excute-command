import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePersistentState } from '../hooks/usePersistentState';
import { Database, Plus, Trash2, Edit3, Table2, ChevronRight, Rows3, X } from 'lucide-react';

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
import { Card } from '../components/ui/card';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { Dataset, DatasetColumn } from '../types';
import { Pagination } from '../components/Pagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useUsers } from '../hooks/useUsers';

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
import { Textarea } from "../components/ui/textarea";

import { ResourceFilters } from '../components/ResourceFilters';

const emptyForm = { key: '', name: '', description: '' };

const COLUMN_TYPES = ['string', 'number', 'bool', 'json'];

const parseColumns = (raw?: string): DatasetColumn[] => {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.filter((c) => c && typeof c.name === 'string') : [];
    } catch {
        return [];
    }
};

const DatasetsPage = () => {
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const navigate = useNavigate();
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selected, setSelected] = useState<Dataset | null>(null);
    const [searchTerm, setSearchTerm] = usePersistentState('ds_search', '');
    const [selectedCreatedBy, setSelectedCreatedBy] = usePersistentState<string | undefined>('ds_createdBy', undefined);
    const { users: availableUsers, fetchUsers } = useUsers();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<Dataset | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [total, setTotal] = useState(0);
    const [limit] = useState(15);
    const [offset, setOffset] = useState(0);

    const [formData, setFormData] = useState(emptyForm);
    const [cols, setCols] = useState<DatasetColumn[]>([]);


    const fetchDatasets = async () => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/datasets?limit=${limit}&offset=${offset}`;
            if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
            if (selectedCreatedBy) url += `&created_by=${selectedCreatedBy}`;
            const response = await apiFetch(url);
            const data = await response.json();
            setDatasets(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch datasets:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDatasets();
    }, [activeNamespace, offset, limit, selectedCreatedBy]);

    const handleApplyFilter = (search: string, filters: { [key: string]: any }) => {
        setSearchTerm(search);
        setSelectedCreatedBy(filters.createdBy);
        setOffset(0);
    };

    // Serialize the column editor rows (drop empty names) into the stored JSON string.
    const serializeColumns = (): string =>
        JSON.stringify(
            cols
                .map(c => ({ name: c.name.trim(), type: c.type, default: c.default || '' }))
                .filter(c => c.name)
        );

    const addColumn = () => setCols([...cols, { name: '', type: 'string', default: '' }]);
    const updateColumn = (idx: number, patch: Partial<DatasetColumn>) =>
        setCols(cols.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    const removeColumn = (idx: number) => setCols(cols.filter((_, i) => i !== idx));

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeNamespace) return;
        const columns = serializeColumns();
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/datasets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, columns })
            });
            if (response.ok) {
                await fetchDatasets();
                setIsCreateOpen(false);
                setFormData(emptyForm);
                setCols([]);
            }
        } catch (error) {
            console.error('Failed to create dataset:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selected) return;
        const columns = serializeColumns();
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/datasets/${selected.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, columns })
            });
            if (response.ok) {
                await fetchDatasets();
                setIsEditOpen(false);
                setSelected(null);
                setFormData(emptyForm);
                setCols([]);
            }
        } catch (error) {
            console.error('Failed to update dataset:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/datasets/${deleteTarget.id}`, { method: 'DELETE' });
            if (response.ok) await fetchDatasets();
        } catch (error) {
            console.error('Failed to delete dataset:', error);
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    const openEditDialog = (d: Dataset) => {
        setSelected(d);
        setCols(parseColumns(d.columns));
        setFormData({
            key: d.key,
            name: d.name,
            description: d.description,
        });
        setIsEditOpen(true);
    };

    const renderColumnsField = () => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Columns (optional)</Label>
                <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1 rounded-md" onClick={addColumn}>
                    <Plus className="w-3 h-3" /> Add Field
                </Button>
            </div>
            {cols.length === 0 ? (
                <p className="text-[10px] font-bold opacity-40 px-1 italic">No columns. Records still accept any JSON fields.</p>
            ) : (
                <div className="space-y-1.5">
                    {cols.map((c, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <Input
                                placeholder="field name"
                                className="h-8 w-32 bg-muted/30 border-border rounded-md text-xs font-medium"
                                value={c.name}
                                onChange={(e) => updateColumn(idx, { name: e.target.value })}
                            />
                            <select
                                value={c.type}
                                onChange={(e) => updateColumn(idx, { type: e.target.value })}
                                className="h-8 px-1 w-20 text-[10px] font-bold border border-border rounded-md bg-background text-foreground outline-none cursor-pointer"
                            >
                                {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <Input
                                placeholder="default value"
                                className="h-8 flex-1 bg-muted/30 border-border rounded-md text-xs font-mono"
                                value={c.default || ''}
                                onChange={(e) => updateColumn(idx, { default: e.target.value })}
                            />
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={() => removeColumn(idx)}>
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
            <p className="text-[10px] font-bold opacity-50 px-1 italic">
                UI hint only — used for record-form fields and table headers; not enforced.
            </p>
        </div>
    );

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Table2 className="w-3.5 h-3.5 text-primary" />
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                        <span className="text-primary">Data</span>
                        <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                        <span className="text-muted-foreground font-black">Datasets</span>
                    </div>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={(open) => {
                    setIsCreateOpen(open);
                    if (!open) { setFormData(emptyForm); setCols([]); }
                }}>
                    <DialogTrigger asChild>
                        <Button className="h-8 premium-gradient font-black uppercase tracking-widest text-[10px] px-4 shadow-premium rounded-md gap-2">
                            <Plus className="w-3.5 h-3.5" /> Add Dataset
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px]">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black tracking-tight">Create Dataset</DialogTitle>
                            <DialogDescription className="text-xs font-medium text-muted-foreground">
                                Define a structured data collection for this namespace.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Key</Label>
                                <Input
                                    placeholder="e.g. users"
                                    className="h-9 bg-muted/30 border-border rounded-md font-bold tracking-tight focus:bg-background transition-all"
                                    value={formData.key}
                                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Name</Label>
                                <Input
                                    placeholder="e.g. Allowed Users"
                                    className="h-9 bg-muted/30 border-border rounded-md font-medium focus:bg-background transition-all"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Description</Label>
                                <Textarea
                                    placeholder="What is this dataset for?"
                                    className="min-h-[70px] bg-muted/30 border-border rounded-md font-medium resize-none"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            {renderColumnsField()}
                            <DialogFooter className="pt-4">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="premium-gradient font-black uppercase tracking-widest text-[10px] h-9 w-full shadow-premium rounded-md"
                                >
                                    {isSubmitting ? "Creating..." : "Save Dataset"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <ResourceFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onApply={handleApplyFilter}
                filters={{ createdBy: selectedCreatedBy }}
                filterConfigs={[
                    {
                        key: 'createdBy',
                        placeholder: 'CREATED BY',
                        type: 'single',
                        isSearchable: true,
                        onSearch: (query: string) => fetchUsers(query),
                        options: [
                            { label: 'ALL CREATORS', value: '' },
                            ...availableUsers.map(u => ({ label: u.username.toUpperCase(), value: u.id }))
                        ],
                        width: 'w-48'
                    }
                ]}
                searchPlaceholder="Search by key, name or description..."
                isLoading={isLoading}
                onReset={() => {
                    setSearchTerm('');
                    setSelectedCreatedBy(undefined);
                }}
                primaryAction={null}
            />

            <Card className="rounded-md border border-border bg-card shadow-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted hover:bg-muted/80 border-border">
                            <TableHead className="w-[320px] h-9 font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground px-6">Dataset</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground">Description</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground">Created By</TableHead>
                            <TableHead className="text-right h-9 px-6 font-black uppercase tracking-[0.15em] text-[10px] text-muted-foreground">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && datasets.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-48 text-center bg-transparent">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Loading datasets...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : datasets.length > 0 ? datasets.map((d) => (
                            <TableRow key={d.id} className="group border-border hover:bg-muted/30 transition-all duration-200">
                                <TableCell className="px-6 py-4">
                                    <div>
                                        <p className="text-sm font-black tracking-tight text-primary">{d.name}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground/70 mt-0.5">{d.key}</p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <p className="text-xs text-muted-foreground font-medium line-clamp-2 max-w-[360px]">
                                        {d.description || <span className="italic opacity-40">No description</span>}
                                    </p>
                                </TableCell>
                                <TableCell>
                                    {d.created_by_username ? (
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-black text-primary uppercase shrink-0">
                                                {d.created_by_username[0]}
                                            </div>
                                            <span className="text-[10px] font-semibold text-muted-foreground">{d.created_by_username}</span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] text-muted-foreground/40 italic">—</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right px-6">
                                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-md hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
                                            onClick={() => navigate(`/datasets/${d.id}`)}
                                            title="Manage records"
                                        >
                                            <Rows3 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-md hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors"
                                            onClick={() => openEditDialog(d)}
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            onClick={() => setDeleteTarget(d)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-48 text-center bg-transparent">
                                    <div className="flex flex-col items-center justify-center gap-4 opacity-40">
                                        <Database className="w-10 h-10" />
                                        <div className="space-y-1">
                                            <p className="text-xs font-black uppercase tracking-[0.2em]">No datasets found</p>
                                            <p className="text-[10px] font-bold opacity-60">Create structured data collections to use across workflows.</p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-2 rounded-full border-dashed"
                                            onClick={() => setIsCreateOpen(true)}
                                        >
                                            Create Dataset
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>

            <Pagination
                total={total}
                offset={offset}
                limit={limit}
                itemName="Datasets"
                onPageChange={setOffset}
            />

            {/* Edit Dialog */}
            <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setCols([]); }}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black tracking-tight">Edit Dataset</DialogTitle>
                        <DialogDescription className="text-xs font-medium text-muted-foreground">
                            Update <span className="text-primary font-bold">{selected?.name}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpdate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Key</Label>
                            <Input
                                className="h-9 bg-muted/10 border-border rounded-md font-bold tracking-tight opacity-60"
                                value={formData.key}
                                disabled
                            />
                            <p className="text-[10px] font-bold text-amber-500/80 px-1 italic">* Keys cannot be modified after creation to prevent flow breakage.</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Name</Label>
                            <Input
                                className="h-9 bg-muted/30 border-border rounded-md font-medium"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Description</Label>
                            <Textarea
                                className="min-h-[70px] bg-muted/30 border-border rounded-md font-medium resize-none"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        {renderColumnsField()}
                        <DialogFooter className="pt-4">
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="premium-gradient font-black uppercase tracking-widest text-[10px] h-9 w-full shadow-premium rounded-md"
                            >
                                {isSubmitting ? "Updating..." : "Update Dataset"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title="Delete Dataset"
                description={`Delete dataset "${deleteTarget?.name}" and all its records? This cannot be undone.`}
                confirmText="Delete Dataset"
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
};

export default DatasetsPage;
