import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Layout, Save, ChevronLeft, Plus, Trash2, GripVertical,
    Settings as SettingsIcon, Globe, Lock, Eye, Copy, Zap,
    Type, Palette, Sliders, Monitor, Clock, EyeOff, Terminal
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { Page, PageWorkflow, Workflow } from '../types';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';

const PageDesignerPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeNamespace } = useNamespace();
    const { apiFetch } = useAuth();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [slug, setSlug] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [password, setPassword] = useState('');
    const [expirationOption, setExpirationOption] = useState<'none' | '1h' | '1d' | '1w'>('none');
    const [pageWorkflows, setPageWorkflows] = useState<Partial<PageWorkflow>[]>([]);
    const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>([]);

    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'design' | 'settings'>('design');

    useEffect(() => {
        const fetchWorkflows = async () => {
            if (!activeNamespace) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=1000`);
                const data = await response.json();
                setAvailableWorkflows(data.items || (Array.isArray(data) ? data : []));
            } catch (error) {
                console.error('Failed to fetch workflows:', error);
            }
        };

        const fetchPage = async () => {
            if (!id) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}/pages/${id}`);
                const data = await response.json();
                setTitle(data.title);
                setDescription(data.description);
                setSlug(data.slug);
                setIsPublic(data.is_public);
                // We won't pre-calculate the option from the date for now, 
                // but usually, we'd check if data.expires_at is set.
                setPageWorkflows(data.workflows || []);
            } catch (error) {
                console.error('Failed to fetch page:', error);
            }
        };

        fetchWorkflows();
        if (id) fetchPage();
    }, [id, activeNamespace, apiFetch]);

    const handleSave = async () => {
        if (!activeNamespace || !title.trim() || !slug.trim()) return;

        setIsSaving(true);
        try {
            const pageData = {
                title,
                description,
                slug,
                is_public: isPublic,
                password: password || undefined,
                expires_at: calculateExpiration(expirationOption),
                layout: JSON.stringify({ components: [] }),
                namespace_id: activeNamespace.id,
                workflows: pageWorkflows.map((pw, idx) => ({
                    ...pw,
                    order: idx,
                }))
            };

            const response = await apiFetch(`${API_BASE_URL}/pages/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pageData)
            });

            if (response.ok) {
                navigate('/pages');
            }
        } catch (error) {
            console.error('Failed to save page:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const addWorkflowToPage = (workflow: Workflow) => {
        const newPW: Partial<PageWorkflow> = {
            workflow_id: workflow.id,
            label: workflow.name,
            style: 'premium-gradient',
            show_log: false,
            workflow: workflow
        };
        setPageWorkflows([...pageWorkflows, newPW]);
    };

    const removeWorkflow = (index: number) => {
        setPageWorkflows(pageWorkflows.filter((_, i) => i !== index));
    };

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const items = Array.from(pageWorkflows);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        setPageWorkflows(items);
    };

    const updatePWField = (index: number, field: keyof PageWorkflow, value: any) => {
        const updated = [...pageWorkflows];
        updated[index] = { ...updated[index], [field]: value };
        setPageWorkflows(updated);
    };
    const calculateExpiration = (option: string) => {
        if (option === 'none') return undefined;
        const date = new Date();
        if (option === '1h') date.setHours(date.getHours() + 1);
        else if (option === '1d') date.setDate(date.getDate() + 1);
        else if (option === '1w') date.setDate(date.getDate() + 7);
        return date.toISOString();
    };

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] bg-background rounded-xl border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Page Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-card border-b border-border shadow-sm">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/pages')}
                        className="h-9 w-9 rounded-lg"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-bold tracking-tight uppercase">Page Designer</h1>
                            <Badge variant="outline" className="text-[9px] font-bold px-1.5 h-4 bg-primary/10 border-primary/20 text-primary">
                                BETA
                            </Badge>
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest leading-none">
                            {title || 'Untitled Page'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex p-0.5 bg-muted/50 rounded-lg border border-border mr-2">
                        <button
                            onClick={() => setActiveTab('design')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all",
                                activeTab === 'design' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Palette className="w-3 h-3" /> Design
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all",
                                activeTab === 'settings' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <SettingsIcon className="w-3 h-3" /> Settings
                        </button>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="premium-gradient text-white text-[10px] font-bold uppercase tracking-widest h-9 px-6 rounded-lg shadow-premium"
                    >
                        <Save className="w-3.5 h-3.5 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Page'}
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar: Available Workflows */}
                <div className="w-80 border-r border-border bg-card flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-border">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Available Workflows</h2>
                        <div className="relative">
                            <Input placeholder="Search workflows..." className="h-9 text-xs pl-8 bg-background" />
                            <Zap className="w-3 h-3 absolute left-2.5 top-3 text-muted-foreground" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {availableWorkflows.map(wf => (
                            <button
                                key={wf.id}
                                onClick={() => addWorkflowToPage(wf)}
                                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                        <Zap className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold truncate max-w-[150px]">{wf.name}</span>
                                        <span className="text-[9px] text-muted-foreground uppercase font-medium">{wf.groups?.length || 0} Groups</span>
                                    </div>
                                </div>
                                <Plus className="w-4 h-4 text-muted-foreground" />
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Canvas */}
                <div className="flex-1 bg-background/50 overflow-y-auto p-12">
                    <div className="max-w-4xl mx-auto">
                        {activeTab === 'design' ? (
                            <div className="space-y-12">
                                <div className="text-center space-y-2">
                                    <h2 className="text-4xl font-black tracking-tighter text-foreground">{title || 'Your Dashboard'}</h2>
                                    <p className="text-muted-foreground font-medium">{description || 'Add workflows to start building your interactive page.'}</p>
                                </div>

                                <DragDropContext onDragEnd={handleDragEnd}>
                                    <Droppable droppableId="workflows" direction="vertical">
                                        {(provided) => (
                                            <div
                                                {...provided.droppableProps}
                                                ref={provided.innerRef}
                                                className="grid grid-cols-1 md:grid-cols-2 gap-6"
                                            >
                                                {pageWorkflows.map((pw, idx) => (
                                                    <Draggable key={pw.workflow_id || idx} draggableId={pw.workflow_id || `${idx}`} index={idx}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                className={cn(
                                                                    "group bg-card border rounded-2xl p-6 relative transition-all duration-300",
                                                                    snapshot.isDragging ? "shadow-2xl scale-105 border-primary z-50" : "border-border hover:border-primary/50 shadow-sm"
                                                                )}
                                                            >
                                                                <div className="flex items-start justify-between gap-4 mb-4">
                                                                    <div {...provided.dragHandleProps} className="p-2 -m-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                                                                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <Input
                                                                            value={pw.label}
                                                                            onChange={(e) => updatePWField(idx, 'label', e.target.value)}
                                                                            className="bg-transparent border-transparent hover:border-border h-8 font-black text-lg p-1 -ml-1 transition-all"
                                                                        />
                                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                                                                            Workflow: {pw.workflow?.name}
                                                                        </p>
                                                                    </div>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeWorkflow(idx)}>
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>

                                                                <div className={cn("h-14 w-full rounded-xl flex items-center justify-center text-white font-black uppercase tracking-widest text-[11px] shadow-premium", pw.style)}>
                                                                    Execute Pipeline
                                                                </div>

                                                                <div className="mt-4 grid grid-cols-2 gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <div className="space-y-1">
                                                                        <label className="text-[8px] font-black uppercase text-muted-foreground">Button Style</label>
                                                                        <select
                                                                            value={pw.style}
                                                                            onChange={(e) => updatePWField(idx, 'style', e.target.value)}
                                                                            className="w-full h-8 bg-background border border-border rounded-lg text-[10px] px-2 outline-none font-bold"
                                                                        >
                                                                            <option value="premium-gradient">Premium Blue</option>
                                                                            <option value="bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]">Neon Emerald</option>
                                                                            <option value="bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]">Cyber Rose</option>
                                                                            <option value="bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.3)]">Deep Indigo</option>
                                                                            <option value="bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]">Atomic Amber</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <label className="text-[8px] font-black uppercase text-muted-foreground">Execution Visibility</label>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            onClick={() => updatePWField(idx, 'show_log', !pw.show_log)}
                                                                            className={cn(
                                                                                "w-full h-8 text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 rounded-lg border-2 transition-all",
                                                                                pw.show_log
                                                                                    ? "bg-primary/10 border-primary text-primary shadow-[0_0_10px_rgba(var(--primary),0.2)]"
                                                                                    : "bg-muted/50 border-border text-muted-foreground"
                                                                            )}
                                                                        >
                                                                            {pw.show_log ? (
                                                                                <><Eye className="w-3 h-3" /> Show Logs</>
                                                                            ) : (
                                                                                <><EyeOff className="w-3 h-3" /> Hidden Logs</>
                                                                            )}
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>

                                {pageWorkflows.length === 0 && (
                                    <div className="h-64 flex flex-col items-center justify-center gap-4 opacity-50 border-2 border-dashed border-border rounded-3xl bg-card">
                                        <Monitor className="w-12 h-12 text-muted-foreground" />
                                        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Canvas is currently empty</p>
                                        <p className="text-xs text-muted-foreground font-medium italic">Drag or click workflows from the sidebar to add them as buttons.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="grid grid-cols-12 gap-6">
                                    <div className="col-span-12 space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                                <SettingsIcon className="w-4 h-4" />
                                            </div>
                                            <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">General Configuration</h2>
                                        </div>
                                        <div className="grid gap-6 bg-card p-8 rounded-2xl border border-border shadow-sm">
                                            <div className="grid grid-cols-2 gap-6">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Page Title</label>
                                                    <Input
                                                        value={title}
                                                        onChange={(e) => setTitle(e.target.value)}
                                                        placeholder="e.g. Production Operations"
                                                        className="h-11 bg-background border-border rounded-xl font-bold"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Unique Slug</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-xs font-mono">/public/pages/</span>
                                                        <Input
                                                            value={slug}
                                                            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                            placeholder="my-cool-page"
                                                            className="h-11 bg-background border-border rounded-xl pl-[105px] font-mono text-xs"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</label>
                                                <Input
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    placeholder="Describe the purpose of this interface..."
                                                    className="h-11 bg-background border-border rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="col-span-12 space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                                <Globe className="w-4 h-4" />
                                            </div>
                                            <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Public Visibility</h2>
                                        </div>
                                        <div className="bg-card p-8 rounded-2xl border border-border shadow-sm">
                                            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background mb-6">
                                                <div className="flex items-center gap-4">
                                                    <div className={cn("p-3 rounded-full", isPublic ? "bg-emerald-500/10 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "bg-muted text-muted-foreground")}>
                                                        {isPublic ? <Globe className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-sm uppercase">Anyone with the link can view</h4>
                                                        <p className="text-xs text-muted-foreground font-medium">Toggle to make this page accessible outside the dashboard.</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setIsPublic(!isPublic)}
                                                    className={cn("w-14 h-7 rounded-full transition-all relative", isPublic ? "bg-emerald-500" : "bg-muted")}
                                                >
                                                    <div className={cn("absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md", isPublic ? "right-1" : "left-1")} />
                                                </button>
                                            </div>

                                            {isPublic && (
                                                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Public Access Link</label>
                                                        <div className="flex gap-2">
                                                            <div className="flex-1 h-11 bg-background border border-border rounded-xl px-4 flex items-center overflow-hidden">
                                                                <span className="text-xs font-mono text-muted-foreground truncate">
                                                                    {window.location.origin}/public/pages/{slug}
                                                                </span>
                                                            </div>
                                                            <Button variant="outline" className="h-11 px-4 rounded-xl" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/public/pages/${slug}`)}>
                                                                <Copy className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-amber-500 flex items-center gap-2">
                                                            <Lock className="w-3 h-3" /> Password Protection (Optional)
                                                        </label>
                                                        <Input
                                                            type="password"
                                                            value={password}
                                                            onChange={(e) => setPassword(e.target.value)}
                                                            placeholder="Enter access password..."
                                                            className="h-11 bg-background border-border rounded-xl focus:ring-amber-500/20"
                                                        />
                                                        <p className="text-[10px] font-medium text-muted-foreground">Leaving this blank will allow immediate public access.</p>
                                                    </div>

                                                    <div className="space-y-4 pt-4 border-t border-border">
                                                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                                            <Clock className="w-3 h-3" /> Expiration Link
                                                        </label>
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {[
                                                                { id: 'none', label: 'Forever' },
                                                                { id: '1h', label: '1 Hour' },
                                                                { id: '1d', label: '1 Day' },
                                                                { id: '1w', label: '1 Week' },
                                                            ].map((opt) => (
                                                                <button
                                                                    key={opt.id}
                                                                    onClick={() => setExpirationOption(opt.id as any)}
                                                                    className={cn(
                                                                        "h-9 rounded-lg text-[10px] font-bold transition-all border",
                                                                        expirationOption === opt.id
                                                                            ? "bg-primary text-white border-primary shadow-sm"
                                                                            : "bg-background text-muted-foreground border-border hover:border-primary/50"
                                                                    )}
                                                                >
                                                                    {opt.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground font-medium italic">
                                                            {expirationOption === 'none'
                                                                ? "Link will never expire unless manually disabled."
                                                                : `Link will automatically expire in ${expirationOption === '1h' ? '1 hour' : expirationOption === '1d' ? '24 hours' : '7 days'}.`}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PageDesignerPage;
