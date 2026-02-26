import React, { useState, useEffect } from 'react';
import { Database, Plus, Search, MoreHorizontal, Trash2, Edit3, Globe, Code } from 'lucide-react';
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

    const [formData, setFormData] = useState({
        key: '',
        value: '',
        description: ''
    });

    const fetchVariables = async () => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/global-variables`);
            const data = await response.json();
            setVariables(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch global variables:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchVariables();
    }, [activeNamespace]);

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

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this global variable?')) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/global-variables/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await fetchVariables();
            }
        } catch (error) {
            console.error('Failed to delete global variable:', error);
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

    const filteredVariables = variables.filter(v =>
        v.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-row justify-between items-end">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Globe className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Namespace Settings</span>
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter">Global Variables</h1>
                    <p className="text-muted-foreground text-sm font-medium">Define variables accessible across all workflows in this namespace.</p>
                </div>

                <Dialog open={isCreateOpen} onOpenChange={(open) => {
                    setIsCreateOpen(open);
                    if (!open) setFormData({ key: '', value: '', description: '' });
                }}>
                    <DialogTrigger asChild>
                        <Button className="premium-gradient font-black uppercase tracking-widest text-[10px] h-11 px-6 shadow-premium rounded-xl gap-2">
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
            </div>

            <div className="flex items-center gap-4 bg-card p-3 rounded-2xl border border-border shadow-card">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-all group-focus-within:text-primary" />
                    <Input
                        placeholder="Search by key or description..."
                        className="pl-11 h-11 bg-background border-border rounded-xl font-semibold text-sm transition-all focus:bg-muted/30"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Card className="border-border bg-card shadow-premium overflow-hidden rounded-2xl">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 border-border hover:bg-muted/50">
                            <TableHead className="w-[300px] h-14 font-black uppercase tracking-widest text-[9px] px-8">Variable Key</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Resolved Value</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Reference Code</TableHead>
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
                        ) : filteredVariables.length > 0 ? filteredVariables.map((v) => (
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
                                    <div className="flex items-center gap-1.5 group/code cursor-help">
                                        <Code className="w-3.5 h-3.5 text-indigo-400 opacity-60" />
                                        <span className="text-[10px] font-black text-indigo-400 tracking-wider">
                                            {"{{"}global.{v.key}{"}}"}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right px-8">
                                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 rounded-xl hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors"
                                            onClick={() => openEditDialog(v)}
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            onClick={() => handleDelete(v.id)}
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
        </div>
    );
};

export default GlobalVariablesPage;
