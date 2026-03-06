import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Save, ChevronLeft, Plus, Trash2, GripVertical,
    Settings as SettingsIcon, Globe, Lock, Copy,
    Terminal, Zap, Monitor, RefreshCw, X, Palette, Clock, ServerIcon
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { PageWidget, PageLayout, Server, Workflow } from '../types';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { SearchableSelect } from '../components/SearchableSelect';


const generateId = () => Math.random().toString(36).slice(2, 10);

const BUTTON_STYLES = [
    { label: 'Premium Blue', value: 'premium-gradient' },
    { label: 'Neon Emerald', value: 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' },
    { label: 'Cyber Rose', value: 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]' },
    { label: 'Deep Indigo', value: 'bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.3)]' },
    { label: 'Atomic Amber', value: 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]' },
];

const RELOAD_OPTIONS = [
    { value: 'realtime', label: 'Realtime' },
    { value: '5', label: 'Every 5s' },
    { value: '10', label: 'Every 10s' },
    { value: '30', label: 'Every 30s' },
    { value: '60', label: 'Every 1m' },
];

const PageDesignerPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeNamespace } = useNamespace();
    const { apiFetch } = useAuth();

    // Page meta
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [slug, setSlug] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [password, setPassword] = useState('');
    const [tokenTTL, setTokenTTL] = useState<number>(15);
    const [expirationOption, setExpirationOption] = useState<'none' | '1h' | '1d' | '1w'>('none');

    // Widgets
    const [widgets, setWidgets] = useState<PageWidget[]>([]);
    const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);

    // Available data
    const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>([]);
    const [servers, setServers] = useState<Server[]>([]);

    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'design' | 'settings'>('design');

    const activeWidget = widgets.find(w => w.id === editingWidgetId);

    useEffect(() => {
        const fetchPage = async () => {
            if (!id) return;
            try {
                const r = await apiFetch(`${API_BASE_URL}/pages/${id}`);
                const data = await r.json();
                setTitle(data.title);
                setDescription(data.description);
                setSlug(data.slug);
                setIsPublic(data.is_public);
                setTokenTTL(data.token_ttl_minutes ?? 15);

                let layoutWidgets: PageWidget[] = [];
                if (data.layout) {
                    try {
                        const layout: PageLayout = JSON.parse(data.layout);
                        layoutWidgets = layout.widgets || [];
                    } catch { /* ignore */ }
                }

                setWidgets(layoutWidgets);
            } catch { /* ignore */ }
        };

        if (id) fetchPage();
    }, [id, activeNamespace, apiFetch]);

    const fetchWorkflows = async (search = '') => {
        if (!activeNamespace) return;
        try {
            const query = search ? `&search=${encodeURIComponent(search)}` : '';
            const r = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=100${query}`);
            const data = await r.json();
            setAvailableWorkflows(data.items || (Array.isArray(data) ? data : []));
        } catch { /* ignore */ }
    };

    const fetchServers = async (search = '') => {
        try {
            const query = search ? `?search=${encodeURIComponent(search)}` : '';
            const r = await apiFetch(`${API_BASE_URL}/servers${query}`);
            const data = await r.json();
            setServers(data.items || (Array.isArray(data) ? data : []));
        } catch { /* ignore */ }
    };

    useEffect(() => {
        if (!editingWidgetId) return;
        const widget = widgets.find(w => w.id === editingWidgetId);
        if (!widget) return;

        if (widget.type === 'ENDPOINT') fetchWorkflows();
        if (widget.type === 'TERMINAL') fetchServers();
    }, [editingWidgetId]);

    const calculateExpiration = (option: string) => {
        if (option === 'none') return undefined;
        const d = new Date();
        if (option === '1h') d.setHours(d.getHours() + 1);
        else if (option === '1d') d.setDate(d.getDate() + 1);
        else if (option === '1w') d.setDate(d.getDate() + 7);
        return d.toISOString();
    };

    const handleSave = async () => {
        if (!activeNamespace || !title.trim() || !slug.trim()) return;
        setIsSaving(true);
        try {
            const layout: PageLayout = { widgets };
            const pageWorkflows = widgets
                .filter(w => w.type === 'ENDPOINT' && w.workflow_id)
                .map((w, idx) => ({
                    workflow_id: w.workflow_id,
                    label: w.label || w.title,
                    style: w.style || 'premium-gradient',
                    show_log: w.show_log ?? false,
                    order: idx,
                }));

            const body = {
                title,
                description,
                slug,
                is_public: isPublic,
                password: password || undefined,
                token_ttl_minutes: tokenTTL,
                expires_at: calculateExpiration(expirationOption),
                layout: JSON.stringify(layout),
                namespace_id: activeNamespace.id,
                workflows: pageWorkflows,
            };

            const r = await apiFetch(`${API_BASE_URL}/pages/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (r.ok) navigate('/pages');
        } catch { /* ignore */ } finally {
            setIsSaving(false);
        }
    };

    const addEndpointWidget = () => {
        const w: PageWidget = {
            id: generateId(), type: 'ENDPOINT',
            title: 'New Endpoint', size: 'half',
            workflow_id: availableWorkflows[0]?.id || '',
            workflow_name: availableWorkflows[0]?.name || '',
            label: availableWorkflows[0]?.name || 'Run',
            style: 'premium-gradient', show_log: false,
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const addTerminalWidget = () => {
        const defaultServer = servers.find(s => s.connection_type === 'LOCAL') || servers[0];
        const w: PageWidget = {
            id: generateId(), type: 'TERMINAL',
            title: 'Terminal', size: 'full',
            server_id: defaultServer?.id || '',
            server_name: defaultServer?.name || '',
            command: 'echo "Hello World"', reload_interval: 'realtime',
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const removeWidget = (wid: string) => {
        setWidgets(prev => prev.filter(w => w.id !== wid));
        if (editingWidgetId === wid) setEditingWidgetId(null);
    };

    const updateWidget = (wid: string, updates: Partial<PageWidget>) =>
        setWidgets(prev => prev.map(w => w.id === wid ? { ...w, ...updates } : w));

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const items = [...widgets];
        const [moved] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, moved);
        setWidgets(items);
    };


    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] bg-background rounded-xl border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-card border-b border-border shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/pages')} className="h-9 w-9 rounded-lg">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-bold tracking-tight uppercase">Page Designer</h1>
                            <Badge variant="outline" className="text-[9px] font-bold px-1.5 h-4 bg-primary/10 border-primary/20 text-primary">BETA</Badge>
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest leading-none">
                            {title || 'Untitled Page'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex p-0.5 bg-muted/50 rounded-lg border border-border mr-2">
                        {(['design', 'settings'] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all",
                                    activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}>
                                {tab === 'design' ? <Palette className="w-3 h-3" /> : <SettingsIcon className="w-3 h-3" />}
                                {tab}
                            </button>
                        ))}
                    </div>
                    <Button onClick={handleSave} disabled={isSaving}
                        className="premium-gradient text-white text-[10px] font-bold uppercase tracking-widest h-9 px-6 rounded-lg shadow-premium">
                        <Save className="w-3.5 h-3.5 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Page'}
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-72 border-r border-border bg-card flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-border">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Add Widget</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        <button onClick={addEndpointWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                                    <Zap className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">Endpoint</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Workflow trigger button</span>
                                </div>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                        </button>

                        <button onClick={addTerminalWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20 transition-colors">
                                    <Terminal className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">Terminal Screen</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Command output display</span>
                                </div>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>
                </div>

                {/* Canvas */}
                <div className="flex-1 bg-background/50 overflow-y-auto p-10">
                    <div className="max-w-4xl mx-auto">
                        {activeTab === 'design' ? (
                            <div className="space-y-8">
                                <div className="text-center space-y-1">
                                    <h2 className="text-3xl font-black tracking-tighter">{title || 'Your Page'}</h2>
                                    <p className="text-muted-foreground text-sm">{description || 'Drag widgets to reorder. Click ⚙ to configure.'}</p>
                                </div>

                                {widgets.length === 0 ? (
                                    <div className="h-64 flex flex-col items-center justify-center gap-4 opacity-40 border-2 border-dashed border-border rounded-3xl bg-card">
                                        <Monitor className="w-12 h-12 text-muted-foreground" />
                                        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Canvas is empty</p>
                                    </div>
                                ) : (
                                    <DragDropContext onDragEnd={handleDragEnd}>
                                        <Droppable droppableId="canvas">
                                            {(provided) => (
                                                <div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-wrap gap-5 items-start">
                                                    {widgets.map((widget, idx) => (
                                                        <Draggable key={widget.id} draggableId={widget.id} index={idx}>
                                                            {(provided, snapshot) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    className={cn(
                                                                        "transition-all duration-200",
                                                                        widget.size === 'half' ? "w-[calc(50%-10px)]" : "w-full",
                                                                        snapshot.isDragging && "opacity-80 scale-[1.02] z-50"
                                                                    )}
                                                                >
                                                                    {widget.type === 'ENDPOINT' ? (
                                                                        <EndpointWidgetCard
                                                                            widget={widget}
                                                                            workflows={availableWorkflows}
                                                                            onEdit={() => setEditingWidgetId(widget.id)}
                                                                            onRemove={() => removeWidget(widget.id)}
                                                                            dragHandleProps={provided.dragHandleProps}
                                                                        />
                                                                    ) : (
                                                                        <TerminalWidgetCard
                                                                            widget={widget}
                                                                            onEdit={() => setEditingWidgetId(widget.id)}
                                                                            onRemove={() => removeWidget(widget.id)}
                                                                            dragHandleProps={provided.dragHandleProps}
                                                                        />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    ))}
                                                    {provided.placeholder}
                                                </div>
                                            )}
                                        </Droppable>
                                    </DragDropContext>
                                )}
                            </div>
                        ) : (
                            /* Settings Tab */
                            <div className="space-y-8">
                                <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
                                    <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                        <SettingsIcon className="w-4 h-4 text-primary" /> General
                                    </h3>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Title</label>
                                            <Input value={title} onChange={e => setTitle(e.target.value)} className="h-11 bg-background rounded-xl font-bold" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Slug</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-xs font-mono">/pages/</span>
                                                <Input value={slug}
                                                    onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                    className="h-11 bg-background rounded-xl pl-[70px] font-mono text-xs" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</label>
                                        <Input value={description} onChange={e => setDescription(e.target.value)} className="h-11 bg-background rounded-xl" />
                                    </div>
                                </div>

                                <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
                                    <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                        <Globe className="w-4 h-4 text-emerald-500" /> Public Visibility
                                    </h3>
                                    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background">
                                        <div className="flex items-center gap-4">
                                            <div className={cn("p-3 rounded-full", isPublic ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground")}>
                                                {isPublic ? <Globe className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <p className="font-black text-sm uppercase">Anyone with the link</p>
                                                <p className="text-xs text-muted-foreground">Toggle to make this page publicly accessible</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setIsPublic(!isPublic)}
                                            className={cn("w-14 h-7 rounded-full transition-all relative", isPublic ? "bg-emerald-500" : "bg-muted")}>
                                            <div className={cn("absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md", isPublic ? "right-1" : "left-1")} />
                                        </button>
                                    </div>

                                    {isPublic && (
                                        <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Public Link</label>
                                                <div className="flex gap-2">
                                                    <div className="flex-1 h-11 bg-background border border-border rounded-xl px-4 flex items-center">
                                                        <span className="text-xs font-mono text-muted-foreground truncate">{window.location.origin}/public/pages/{slug}</span>
                                                    </div>
                                                    <Button variant="outline" className="h-11 px-4 rounded-xl"
                                                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/public/pages/${slug}`)}>
                                                        <Copy className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-amber-500 flex items-center gap-2">
                                                    <Lock className="w-3 h-3" /> Password Protection
                                                </label>
                                                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                                    placeholder="Leave blank for open access..."
                                                    className="h-11 bg-background rounded-xl" />
                                            </div>

                                            {password && (
                                                <div className="space-y-2 animate-in slide-in-from-top-1 duration-200">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                                        <RefreshCw className="w-3 h-3" /> Session Token TTL
                                                    </label>
                                                    <div className="flex gap-2 flex-wrap">
                                                        {[{ label: '5m', value: 5 }, { label: '15m', value: 15 }, { label: '30m', value: 30 }, { label: '1h', value: 60 }, { label: '8h', value: 480 }].map(opt => (
                                                            <button key={opt.value} onClick={() => setTokenTTL(opt.value)}
                                                                className={cn("h-8 px-3 rounded-lg text-[9px] font-black border transition-all",
                                                                    tokenTTL === opt.value ? "bg-primary/10 border-primary text-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50")}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="space-y-3 pt-4 border-t border-border">
                                                <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                                    <Clock className="w-3 h-3" /> Link Expiration
                                                </label>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {[{ id: 'none', label: 'Forever' }, { id: '1h', label: '1 Hour' }, { id: '1d', label: '1 Day' }, { id: '1w', label: '1 Week' }].map(opt => (
                                                        <button key={opt.id} onClick={() => setExpirationOption(opt.id as any)}
                                                            className={cn("h-9 rounded-lg text-[10px] font-bold transition-all border",
                                                                expirationOption === opt.id ? "bg-primary text-white border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50")}>
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Widget Settings Modal */}
            {activeWidget && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setEditingWidgetId(null)}
                >
                    <div
                        className="w-full max-w-lg bg-card border border-border rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-8 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Widget Title</label>
                                    <Input value={activeWidget.title} onChange={e => updateWidget(activeWidget.id, { title: e.target.value })} className="h-11 text-sm font-bold bg-muted/30 border border-border/50 rounded-2xl" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Width</label>
                                    <select value={activeWidget.size} onChange={e => updateWidget(activeWidget.id, { size: e.target.value as any })}
                                        className="w-full h-11 bg-muted/30 border border-border/50 rounded-2xl text-[11px] px-4 outline-none font-bold appearance-none cursor-pointer">
                                        <option value="half" className="bg-popover text-foreground">Half Width</option>
                                        <option value="full" className="bg-popover text-foreground">Full Width</option>
                                    </select>
                                </div>
                            </div>

                            {activeWidget.type === 'ENDPOINT' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2 px-1">
                                            <Zap className="w-3 h-3 text-primary" /> Target Workflow
                                        </label>
                                        <SearchableSelect
                                            options={[
                                                ...(activeWidget.workflow_id && activeWidget.workflow_name && !availableWorkflows.some(w => w.id === activeWidget.workflow_id)
                                                    ? [{ label: activeWidget.workflow_name, value: activeWidget.workflow_id }]
                                                    : []),
                                                ...availableWorkflows.map(wf => ({ label: wf.name, value: wf.id }))
                                            ]}
                                            value={activeWidget.workflow_id || ''}
                                            onValueChange={(val) => {
                                                const wf = availableWorkflows.find(w => w.id === val);
                                                updateWidget(activeWidget.id, {
                                                    workflow_id: val,
                                                    workflow_name: wf?.name || activeWidget.workflow_name,
                                                    label: wf?.name || activeWidget.label
                                                });
                                            }}
                                            onSearch={fetchWorkflows}
                                            placeholder="Select workflow..."
                                            isSearchable
                                            triggerClassName="h-11 text-[11px] font-bold bg-muted/30 border border-border/50 rounded-2xl"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Button Label</label>
                                            <Input value={activeWidget.label || ''} onChange={e => updateWidget(activeWidget.id, { label: e.target.value })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl" placeholder="e.g. Deploy" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Style</label>
                                            <SearchableSelect
                                                options={BUTTON_STYLES}
                                                value={activeWidget.style || 'premium-gradient'}
                                                onValueChange={(val) => updateWidget(activeWidget.id, { style: val })}
                                                placeholder="Select style..."
                                                triggerClassName="h-11 text-[11px] font-bold bg-muted/30 border border-border/50 rounded-2xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Description</label>
                                        <textarea
                                            value={activeWidget.description || ''}
                                            onChange={e => updateWidget(activeWidget.id, { description: e.target.value })}
                                            className="w-full min-h-[80px] p-4 text-[11px] bg-muted/30 border border-border/50 rounded-2xl focus:ring-2 ring-primary/10 outline-none resize-none transition-all"
                                            placeholder="Explain what this endpoint does..."
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-5 bg-muted/20 rounded-[1.5rem] border border-border/40">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Execution Trace</p>
                                            <p className="text-[11px] font-medium text-muted-foreground leading-none">Show live logs after triggering</p>
                                        </div>
                                        <button onClick={() => updateWidget(activeWidget.id, { show_log: !activeWidget.show_log })}
                                            className={cn("w-12 h-6 rounded-full transition-all relative shrink-0 shadow-inner", activeWidget.show_log ? "bg-primary" : "bg-muted-foreground/20")}>
                                            <div className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-200", activeWidget.show_log ? "right-0.5" : "left-0.5")} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {activeWidget.type === 'TERMINAL' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2 px-1">
                                            <ServerIcon className="w-3 h-3 text-emerald-500" /> Target Server
                                        </label>
                                        <SearchableSelect
                                            options={[
                                                ...(activeWidget.server_id && activeWidget.server_name && !servers.some(s => s.id === activeWidget.server_id)
                                                    ? [{ label: activeWidget.server_name, value: activeWidget.server_id }]
                                                    : []),
                                                ...servers.map(s => ({ label: `${s.name} (${s.host})`, value: s.id }))
                                            ]}
                                            value={activeWidget.server_id || ''}
                                            onValueChange={(val) => {
                                                const srv = servers.find(s => s.id === val);
                                                updateWidget(activeWidget.id, {
                                                    server_id: val,
                                                    server_name: srv?.name || activeWidget.server_name
                                                });
                                            }}
                                            onSearch={fetchServers}
                                            placeholder="Select server..."
                                            isSearchable
                                            triggerClassName="h-11 text-[11px] font-bold bg-muted/30 border border-border/50 rounded-2xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Execute Command</label>
                                        <Input value={activeWidget.command || ''} onChange={e => updateWidget(activeWidget.id, { command: e.target.value })}
                                            placeholder="e.g. top -b -n 1" className="h-11 text-xs font-mono bg-muted/30 border border-border/50 rounded-2xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Refresh Rate</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {RELOAD_OPTIONS.map(opt => (
                                                <button key={opt.value} onClick={() => updateWidget(activeWidget.id, { reload_interval: opt.value as any })}
                                                    className={cn("h-9 px-4 rounded-xl text-[10px] font-black transition-all border shrink-0",
                                                        activeWidget.reload_interval === opt.value
                                                            ? "bg-emerald-500/10 border-emerald-500 text-emerald-500"
                                                            : "bg-muted/30 border-transparent text-muted-foreground hover:border-emerald-500/50")}>
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-8 py-6 bg-muted/10 border-t border-border/40 flex flex-col gap-3">
                            <Button onClick={() => setEditingWidgetId(null)} className="premium-gradient text-white text-[10px] font-black uppercase tracking-[0.2em] h-12 rounded-2xl shadow-premium">
                                Save Configuration
                            </Button>
                            <Button variant="ghost" onClick={() => setEditingWidgetId(null)} className="h-8 text-[9px] font-black uppercase tracking-widest opacity-40 hover:opacity-100">Dismiss Settings</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

interface EndpointWidgetCardProps {
    widget: PageWidget;
    workflows: Workflow[];
    onEdit: () => void;
    onRemove: () => void;
    dragHandleProps: any;
}

const EndpointWidgetCard: React.FC<EndpointWidgetCardProps> = ({ widget, workflows, onEdit, onRemove, dragHandleProps }) => {
    const selectedWf = workflows.find(w => w.id === widget.workflow_id);
    return (
        <div className="group bg-card border border-border rounded-[2rem] overflow-hidden hover:border-primary/40 transition-all shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-card">
                <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                    <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-tight truncate">{widget.title || 'Endpoint'}</p>
                    <p className="text-[9px] text-muted-foreground font-medium truncate uppercase tracking-widest">{selectedWf?.name || 'No workflow'}</p>
                </div>
                <button onClick={onEdit} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-transparent hover:border-border">
                    <SettingsIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={onRemove} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-transparent hover:border-border">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="p-6">
                <div className={cn("h-14 w-full rounded-2xl flex items-center justify-center text-white font-black uppercase tracking-[0.15em] text-[10px] shadow-sm", widget.style || 'premium-gradient')}>
                    <Zap className="w-4 h-4 mr-2" />
                    {widget.label || 'Execute'}
                </div>
            </div>
        </div>
    );
};

interface TerminalWidgetCardProps {
    widget: PageWidget;
    onEdit: () => void;
    onRemove: () => void;
    dragHandleProps: any;
}

const TerminalWidgetCard: React.FC<TerminalWidgetCardProps> = ({ widget, onEdit, onRemove, dragHandleProps }) => (
    <div className="group bg-[#0a0b0e] border border-white/10 rounded-[2rem] overflow-hidden hover:border-emerald-500/30 transition-all shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 bg-white/5 border-b border-white/5">
            <div className="flex items-center gap-3">
                <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 transition-colors">
                    <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <Terminal className="w-3.5 h-3.5 text-emerald-400 ml-2" />
                <span className="text-[11px] font-mono font-bold text-emerald-400/80 uppercase truncate max-w-[120px]">{widget.title}</span>
            </div>
            <div className="flex gap-2">
                <button onClick={onEdit} className="h-7 w-7 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors">
                    <SettingsIcon className="w-3 h-3" />
                </button>
                <button onClick={onRemove} className="h-7 w-7 rounded-full flex items-center justify-center text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
        <div className="px-6 py-4 min-h-[80px] font-mono text-xs text-zinc-400">
            <span className="text-zinc-600">$ </span>
            <span className="text-emerald-300">{widget.command || 'echo "Hello"'}</span>
            <span className="animate-pulse ml-1 text-emerald-400">▋</span>
        </div>
    </div>
);

export default PageDesignerPage;
