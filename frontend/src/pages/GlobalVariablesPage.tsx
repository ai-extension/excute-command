import React, { useState, useEffect } from 'react';
import { Database, Plus, Search, MoreHorizontal, Trash2, Edit3, Globe, Code, ChevronRight, Copy, Check } from 'lucide-react';

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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { GlobalVariable } from '../types';
import { Pagination } from '../components/Pagination';
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
import { Textarea } from "../components/ui/textarea";

import { ResourceFilters } from '../components/ResourceFilters';

const GlobalVariablesPage = () => {
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [variables, setVariables] = useState<GlobalVariable[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedVar, setSelectedVar] = useState<GlobalVariable | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    };

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<GlobalVariable | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    const [formData, setFormData] = useState({
        key: '',
        value: '',
        description: ''
    });

    const fetchVariables = async (searchOverride?: string) => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            const currentSearch = searchOverride !== undefined ? searchOverride : searchTerm;
            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/global-variables?limit=${limit}&offset=${offset}`;
            if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
            const response = await apiFetch(url);
            const data = await response.json();
            setVariables(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch global variables:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchVariables();
    }, [activeNamespace, offset, limit]);

    const handleApplyFilter = (search: string) => {
        setSearchTerm(search);
        setOffset(0);
        fetchVariables(search);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeNamespace) return;
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/global-variables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                await fetchVariables();
                setIsCreateOpen(false);
                setFormData({ key: '', value: '', description: '' });
            }
        } catch (error) {
            console.error('Failed to create global variable:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedVar) return;
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/global-variables/${selectedVar.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                await fetchVariables();
                setIsEditOpen(false);
                setSelectedVar(null);
                setFormData({ key: '', value: '', description: '' });
            }
        } catch (error) {
            console.error('Failed to update global variable:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (gv: GlobalVariable) => {
        setDeleteTarget(gv);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/global-variables/${deleteTarget.id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await fetchVariables();
            }
        } catch (error) {
            console.error('Failed to delete global variable:', error);
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    const openEditDialog = (gv: GlobalVariable) => {
        setSelectedVar(gv);
        setFormData({
            key: gv.key,
            value: gv.value,
            description: gv.description
        });
        setIsEditOpen(true);
    };



    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 px-1">
                <Globe className="w-3.5 h-3.5 text-primary" />
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                    <span className="text-primary">Settings</span>
                    <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                    <span className="text-muted-foreground font-black">Global Variables</span>
                </div>
            </div>

            <ResourceFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onApply={handleApplyFilter}
                searchPlaceholder="Search by key or description..."
                isLoading={isLoading}
                primaryAction={
                    <Dialog open={isCreateOpen} onOpenChange={(open) => {
                        setIsCreateOpen(open);
                        if (!open) setFormData({ key: '', value: '', description: '' });
                    }}>
                        <DialogTrigger asChild>
                            <Button className="premium-gradient font-black uppercase tracking-widest text-[10px] px-4 shadow-premium rounded-xl gap-2">
                                <Plus className="w-4 h-4" /> Add Global Variable
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-black tracking-tight">Create Variable</DialogTitle>
                                <DialogDescription className="text-[11px] font-medium text-muted-foreground">
                                    Define a new key-value pair for this namespace.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreate} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Key Name</Label>
                                    <Input
                                        placeholder="e.g. API_ENDPOINT"
                                        className="h-12 bg-muted/30 border-border rounded-xl font-bold uppercase tracking-tight focus:bg-background transition-all"
                                        value={formData.key}
                                        onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Value</Label>
                                    <Input
                                        placeholder="e.g. https://api.example.com"
                                        className="h-12 bg-muted/30 border-border rounded-xl font-medium"
                                        value={formData.value}
                                        onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Description</Label>
                                    <Textarea
                                        placeholder="What is this variable used for?"
                                        className="min-h-[100px] bg-muted/30 border-border rounded-xl font-medium resize-none"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>
                                <DialogFooter className="pt-4">
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 w-full shadow-premium rounded-xl"
                                    >
                                        {isSubmitting ? "Creating..." : "Save Variable"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                }
            />

            <Card className="border-border bg-card shadow-premium overflow-hidden rounded-2xl">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 border-border hover:bg-muted/50">
                            <TableHead className="w-[300px] h-14 font-black uppercase tracking-widest text-[9px] px-8">Variable Key</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Resolved Value</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Reference Code</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Created By</TableHead>
                            <TableHead className="text-right h-14 px-8 font-black uppercase tracking-widest text-[9px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-48 text-center bg-transparent">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Loading global registry...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : variables.length > 0 ? variables.map((v) => (
                            <TableRow key={v.id} className="group border-border hover:bg-muted/30 transition-all duration-200">
                                <TableCell className="px-8 py-5">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-sm shrink-0">
                                            <Globe className="w-5 h-5 text-indigo-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black tracking-tight text-primary uppercase">{v.key}</p>
                                            <p className="text-[11px] text-muted-foreground font-medium line-clamp-1 opacity-70 mt-0.5">
                                                {v.description || 'No description provided'}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 max-w-[300px]">
                                        <code className="px-3 py-1.5 rounded-lg bg-muted text-[11px] font-bold text-slate-300 border border-border/50 truncate">
                                            {v.value}
                                        </code>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 group/copy">
                                        <div className="flex items-center gap-1.5">
                                            <Code className="w-3.5 h-3.5 text-indigo-400 opacity-60" />
                                            <span className="text-[10px] font-black text-indigo-400 tracking-wider">
                                                {"{{"}global.{v.key}{"}}"}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 rounded-md hover:bg-indigo-500/10 hover:text-indigo-500 transition-all opacity-0 group-hover/copy:opacity-100"
                                            onClick={() => copyToClipboard(`{{global.${v.key}}}`, v.id)}
                                            title="Copy reference"
                                        >
                                            {copiedId === v.id ? (
                                                <Check className="w-3 h-3 text-emerald-500" />
                                            ) : (
                                                <Copy className="w-3 h-3" />
                                            )}
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {v.created_by_username ? (
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-black text-primary uppercase shrink-0">
                                                {v.created_by_username[0]}
                                            </div>
                                            <span className="text-[10px] font-semibold text-muted-foreground">{v.created_by_username}</span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] text-muted-foreground/40 italic">—</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right px-8">
                                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-xl hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors"
                                            onClick={() => openEditDialog(v)}
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            onClick={() => handleDelete(v)}
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
                                            <p className="text-[11px] font-black uppercase tracking-[0.2em]">No global variables found</p>
                                            <p className="text-[9px] font-bold opacity-60">Create namespace-wide variables to use across flows.</p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-2 rounded-full border-dashed"
                                            onClick={() => setIsCreateOpen(true)}
                                        >
                                            Initialize Registry
                                        </Button>
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
                    itemName="Global Variables"
                    onPageChange={setOffset}
                />
            </Card>

            {/* Edit Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black tracking-tight">Edit Variable</DialogTitle>
                        <DialogDescription className="text-[11px] font-medium text-muted-foreground">
                            Update the global configuration for <span className="text-primary font-bold uppercase">{selectedVar?.key}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpdate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Key Name</Label>
                            <Input
                                className="h-12 bg-muted/10 border-border rounded-xl font-bold uppercase tracking-tight opacity-60"
                                value={formData.key}
                                disabled
                            />
                            <p className="text-[8px] font-bold text-amber-500/80 px-1 italic">* Variable keys cannot be modified after creation to prevent flow breakage.</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">New Value</Label>
                            <Input
                                placeholder="Value..."
                                className="h-12 bg-muted/30 border-border rounded-xl font-medium"
                                value={formData.value}
                                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Description</Label>
                            <Textarea
                                placeholder="Description..."
                                className="min-h-[100px] bg-muted/30 border-border rounded-xl font-medium resize-none"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        <DialogFooter className="pt-4">
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 w-full shadow-premium rounded-xl"
                            >
                                {isSubmitting ? "Updating..." : "Update variable"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title="Delete Global Variable"
                description={`Are you sure you want to delete the variable "${deleteTarget?.key}"?`}
                confirmText="Delete Variable"
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
};

export default GlobalVariablesPage;
