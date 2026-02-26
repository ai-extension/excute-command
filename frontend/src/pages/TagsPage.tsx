import React, { useState, useEffect } from 'react';
import { Tag as TagIcon, Plus, Search, Trash2, Edit3, Paintbrush } from 'lucide-react';
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
import { Tag } from '../types';

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

const TagsPage = () => {
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [tags, setTags] = useState<Tag[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        color: '#6366f1' // default indigo-500
    });

    const fetchTags = async () => {
        if (!activeNamespace) return;
        setIsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/tags`);
            const data = await response.json();
            setTags(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch tags:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTags();
    }, [activeNamespace]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeNamespace) return;
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                await fetchTags();
                setIsCreateOpen(false);
                setFormData({ name: '', color: '#6366f1' });
            }
        } catch (error) {
            console.error('Failed to create tag:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTag) return;
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/tags/${selectedTag.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                await fetchTags();
                setIsEditOpen(false);
                setSelectedTag(null);
                setFormData({ name: '', color: '#6366f1' });
            }
        } catch (error) {
            console.error('Failed to update tag:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this tag?')) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/tags/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await fetchTags();
            }
        } catch (error) {
            console.error('Failed to delete tag:', error);
        }
    };

    const openEditDialog = (tag: Tag) => {
        setSelectedTag(tag);
        setFormData({
            name: tag.name,
            color: tag.color
        });
        setIsEditOpen(true);
    };

    const filteredTags = tags.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-row justify-between items-end">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <TagIcon className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Namespace Settings</span>
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter">Tags Management</h1>
                    <p className="text-muted-foreground text-sm font-medium">Create and manage color-coded tags to organize your workflows and schedules.</p>
                </div>

                <Dialog open={isCreateOpen} onOpenChange={(open) => {
                    setIsCreateOpen(open);
                    if (!open) setFormData({ name: '', color: '#6366f1' });
                }}>
                    <DialogTrigger asChild>
                        <Button className="premium-gradient font-black uppercase tracking-widest text-[10px] h-11 px-6 shadow-premium rounded-xl gap-2">
                            <Plus className="w-4 h-4" /> Create Tag
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black tracking-tight">Create Tag</DialogTitle>
                            <DialogDescription className="text-[11px] font-medium text-muted-foreground">
                                Add a new tag to the namespace. tags can be used to filter and categorize.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreate} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Tag Name</Label>
                                <Input
                                    placeholder="e.g. Production, High Priority"
                                    className="h-12 bg-muted/30 border-border rounded-xl font-bold tracking-tight focus:bg-background transition-all"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Color</Label>
                                <div className="flex items-center gap-4">
                                    <Input
                                        type="color"
                                        className="h-12 w-20 p-1 cursor-pointer bg-muted/30 border-border rounded-xl"
                                        value={formData.color}
                                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                    />
                                    <div
                                        className="px-4 py-2 rounded-full text-xs font-bold border"
                                        style={{ backgroundColor: `${formData.color}20`, color: formData.color, borderColor: `${formData.color}40` }}
                                    >
                                        {formData.name || 'Preview Tag'}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter className="pt-4">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 w-full shadow-premium rounded-xl"
                                >
                                    {isSubmitting ? "Creating..." : "Save Tag"}
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
                        placeholder="Search tags..."
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
                            <TableHead className="w-[300px] h-14 font-black uppercase tracking-widest text-[9px] px-8">Tag</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Hex Color</TableHead>
                            <TableHead className="text-right h-14 px-8 font-black uppercase tracking-widest text-[9px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-48 text-center bg-transparent">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Loading tags...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredTags.length > 0 ? filteredTags.map((t) => (
                            <TableRow key={t.id} className="group border-border hover:bg-muted/30 transition-all duration-200">
                                <TableCell className="px-8 py-5">
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="px-3 py-1 rounded-full text-xs font-bold border"
                                            style={{ backgroundColor: `${t.color}20`, color: t.color, borderColor: `${t.color}40` }}
                                        >
                                            {t.name}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }}></div>
                                        <code className="text-[11px] font-bold text-muted-foreground lowercase">
                                            {t.color}
                                        </code>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right px-8">
                                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 rounded-xl hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors"
                                            onClick={() => openEditDialog(t)}
                                        >
                                            <Edit3 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors"
                                            onClick={() => handleDelete(t.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={3} className="h-48 text-center bg-transparent">
                                    <div className="flex flex-col items-center justify-center gap-4 opacity-40">
                                        <Paintbrush className="w-10 h-10" />
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-black uppercase tracking-[0.2em]">No tags found</p>
                                            <p className="text-[9px] font-bold opacity-60">Create tags to better organize your flows.</p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-2 rounded-full border-dashed"
                                            onClick={() => setIsCreateOpen(true)}
                                        >
                                            Create First Tag
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
                        <DialogTitle className="text-2xl font-black tracking-tight">Edit Tag</DialogTitle>
                        <DialogDescription className="text-[11px] font-medium text-muted-foreground">
                            Update the tag's name and color.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpdate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Tag Name</Label>
                            <Input
                                className="h-12 bg-muted/30 border-border rounded-xl font-bold tracking-tight"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Color</Label>
                            <div className="flex items-center gap-4">
                                <Input
                                    type="color"
                                    className="h-12 w-20 p-1 cursor-pointer bg-muted/30 border-border rounded-xl"
                                    value={formData.color}
                                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                />
                                <div
                                    className="px-4 py-2 rounded-full text-xs font-bold border"
                                    style={{ backgroundColor: `${formData.color}20`, color: formData.color, borderColor: `${formData.color}40` }}
                                >
                                    {formData.name || 'Preview Tag'}
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="pt-4">
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 w-full shadow-premium rounded-xl"
                            >
                                {isSubmitting ? "Updating..." : "Update Tag"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default TagsPage;
