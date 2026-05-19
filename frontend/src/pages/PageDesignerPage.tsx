import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Save, ChevronLeft, Plus, Trash2, GripVertical,
    Settings as SettingsIcon, Globe, Lock, Copy,
    Terminal, Zap, Monitor, RefreshCw, X, Palette, Clock, ServerIcon, Link2, Type,
    FileText, ImageIcon, Frame, Activity, Table2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn, copyToClipboard as clipboardCopy } from '../lib/utils';
import { PageWidget, PageLayout, Server, Workflow, Tag } from '../types';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { SearchableSelect } from '../components/SearchableSelect';
import { TagSelector } from '../components/TagSelector';
import { ButtonStylePicker, resolveButtonStyle } from '../components/ButtonStylePicker';


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
    const { apiFetch, hasPermission } = useAuth();

    // Page meta
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [slug, setSlug] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [password, setPassword] = useState('');
    const [tokenTTL, setTokenTTL] = useState<number>(15);
    const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
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
                setSelectedTags(data.tags || []);
                if (data.password) {
                    setPassword('********');
                } else {
                    setPassword('');
                }

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
                password: password === '********' ? undefined : (password || '__CLEAR_PASSWORD__'),
                token_ttl_minutes: tokenTTL,
                expires_at: calculateExpiration(expirationOption),
                layout: JSON.stringify(layout),
                namespace_id: activeNamespace.id,
                workflows: pageWorkflows,
                tags: selectedTags,
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

    const addLinkWidget = () => {
        const w: PageWidget = {
            id: generateId(), type: 'LINK',
            title: 'External Link', size: 'third',
            url: 'https://',
            label: 'Open Link',
            new_tab: true,
            style: 'bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.3)]',
            description: '',
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const addSectionWidget = () => {
        const w: PageWidget = {
            id: generateId(), type: 'SECTION',
            title: 'New Section', size: 'full',
            description: 'Group your widgets here...',
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const addTextWidget = () => {
        const w: PageWidget = {
            id: generateId(), type: 'TEXT',
            title: 'Text Block', size: 'full',
            content: 'Enter your text here...',
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const addImageWidget = () => {
        const w: PageWidget = {
            id: generateId(), type: 'IMAGE',
            title: 'Image', size: 'half',
            image_url: '', alt_text: '',
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const addIframeWidget = () => {
        const w: PageWidget = {
            id: generateId(), type: 'IFRAME',
            title: 'Embedded Content', size: 'full',
            iframe_url: '', iframe_height: 400,
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const addStatusWidget = () => {
        const w: PageWidget = {
            id: generateId(), type: 'STATUS',
            title: 'Status', size: 'third',
            status_label: 'Service', status_value: 'ok',
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const addTableWidget = () => {
        const w: PageWidget = {
            id: generateId(), type: 'TABLE',
            title: 'Data Table', size: 'full',
            table_headers: ['Column 1', 'Column 2', 'Column 3'],
            table_rows: [['Row 1', 'Data', 'Data'], ['Row 2', 'Data', 'Data']],
        };
        setWidgets(prev => [...prev, w]);
        setEditingWidgetId(w.id);
    };

    const canUseTerminal = hasPermission('servers', 'READ');

    const removeWidget = (wid: string) => {
        setWidgets(prev => prev.filter(w => w.id !== wid));
        if (editingWidgetId === wid) setEditingWidgetId(null);
    };

    const updateWidget = (wid: string, updates: Partial<PageWidget>) =>
        setWidgets(prev => prev.map(w => w.id === wid ? { ...w, ...updates } : w));

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const srcId = result.source.droppableId;
        const dstId = result.destination.droppableId;
        const srcIdx = result.source.index;
        const dstIdx = result.destination.index;

        const isSectionDroppable = (id: string) => id.startsWith('section-');
        const getParentIdFromDroppable = (id: string) => isSectionDroppable(id) ? id.slice('section-'.length) : null;

        const srcParent = getParentIdFromDroppable(srcId);
        const dstParent = getParentIdFromDroppable(dstId);

        const sourceList = widgets.filter(w => (w.parent_id || null) === srcParent);
        const moved = sourceList[srcIdx];
        if (!moved) return;

        // Disallow section inside section
        if (moved.type === 'SECTION' && dstParent) return;

        const sameList = srcParent === dstParent;

        // Build new flat array
        const updated = widgets.map(w => w.id === moved.id ? { ...w, parent_id: dstParent || undefined } : w);

        // Compute final orders per parent
        const buildOrdered = () => {
            const topLevel = updated.filter(w => !w.parent_id);
            const childrenByParent: Record<string, typeof updated> = {};
            updated.forEach(w => {
                if (w.parent_id) {
                    if (!childrenByParent[w.parent_id]) childrenByParent[w.parent_id] = [];
                    childrenByParent[w.parent_id].push(w);
                }
            });

            // Apply DnD reordering to the affected lists
            const reorder = (list: typeof updated, parent: string | null) => {
                const filtered = list.filter(w => w.id !== moved.id);
                if (sameList) {
                    if ((parent || null) === srcParent) {
                        filtered.splice(dstIdx, 0, updated.find(w => w.id === moved.id)!);
                    }
                } else {
                    if ((parent || null) === dstParent) {
                        filtered.splice(dstIdx, 0, updated.find(w => w.id === moved.id)!);
                    }
                }
                return filtered;
            };

            const finalTop = reorder(topLevel, null);
            const finalChildren: Record<string, typeof updated> = {};
            Object.keys(childrenByParent).forEach(pid => {
                finalChildren[pid] = reorder(childrenByParent[pid], pid);
            });
            // Ensure dst section list exists when moving into empty section
            if (dstParent && !finalChildren[dstParent]) {
                finalChildren[dstParent] = reorder([], dstParent);
            }

            // Flatten: each top-level, followed by its children if section
            const flat: typeof updated = [];
            finalTop.forEach(w => {
                flat.push(w);
                if (w.type === 'SECTION' && finalChildren[w.id]) {
                    flat.push(...finalChildren[w.id]);
                }
            });
            return flat;
        };

        setWidgets(buildOrdered());
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

                        {canUseTerminal && (
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
                        )}

                        <button onClick={addLinkWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500/20 transition-colors">
                                    <Link2 className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">External Link</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Quick link button</span>
                                </div>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                        </button>

                        <button onClick={addSectionWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20 transition-colors">
                                    <Type className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">Section Header</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Title and description</span>
                                </div>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                        </button>

                        <div className="pt-3 mt-1 border-t border-border/50">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-2 px-3">Content Widgets</p>
                        </div>

                        <button onClick={addTextWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 group-hover:bg-sky-500/20 transition-colors">
                                    <FileText className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">Text Block</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Rich text content</span>
                                </div>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                        </button>

                        <button onClick={addImageWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-500 group-hover:bg-pink-500/20 transition-colors">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">Image</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Display an image</span>
                                </div>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                        </button>

                        <button onClick={addIframeWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500 group-hover:bg-violet-500/20 transition-colors">
                                    <Frame className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">Iframe Embed</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Embed external content</span>
                                </div>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                        </button>

                        <button onClick={addStatusWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-500 group-hover:bg-teal-500/20 transition-colors">
                                    <Activity className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">Status Indicator</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Show service status</span>
                                </div>
                            </div>
                            <Plus className="w-4 h-4 text-muted-foreground" />
                        </button>

                        <button onClick={addTableWidget}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted text-left transition-all border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20 transition-colors">
                                    <Table2 className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold block">Data Table</span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-medium">Display tabular data</span>
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
                                                    {widgets.filter(w => !w.parent_id).map((widget, idx) => (
                                                        <Draggable key={widget.id} draggableId={widget.id} index={idx}>
                                                            {(provided, snapshot) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    className={cn(
                                                                        "transition-all duration-200",
                                                                        widget.type === 'SECTION' ? "w-full" :
                                                                            widget.size === 'half' ? "w-[calc(50%-10px)]" : widget.size === 'third' ? "w-[calc((100%-40px)/3)]" : "w-full",
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
                                                                    ) : widget.type === 'TERMINAL' ? (
                                                                        <TerminalWidgetCard
                                                                            widget={widget}
                                                                            onEdit={() => setEditingWidgetId(widget.id)}
                                                                            onRemove={() => removeWidget(widget.id)}
                                                                            dragHandleProps={provided.dragHandleProps}
                                                                        />
                                                                    ) : widget.type === 'LINK' ? (
                                                                        <LinkWidgetCard
                                                                            widget={widget}
                                                                            onEdit={() => setEditingWidgetId(widget.id)}
                                                                            onRemove={() => removeWidget(widget.id)}
                                                                            dragHandleProps={provided.dragHandleProps}
                                                                        />
                                                                    ) : widget.type === 'TEXT' || widget.type === 'IMAGE' || widget.type === 'IFRAME' || widget.type === 'STATUS' || widget.type === 'TABLE' ? (
                                                                        <ContentWidgetCard
                                                                            widget={widget}
                                                                            onEdit={() => setEditingWidgetId(widget.id)}
                                                                            onRemove={() => removeWidget(widget.id)}
                                                                            dragHandleProps={provided.dragHandleProps}
                                                                        />
                                                                    ) : (
                                                                        <SectionWidgetCard
                                                                            widget={widget}
                                                                            onEdit={() => setEditingWidgetId(widget.id)}
                                                                            onRemove={() => removeWidget(widget.id)}
                                                                            dragHandleProps={provided.dragHandleProps}
                                                                        >
                                                                            <Droppable droppableId={`section-${widget.id}`} type="DEFAULT">
                                                                                {(innerProvided, innerSnapshot) => (
                                                                                    <div
                                                                                        ref={innerProvided.innerRef}
                                                                                        {...innerProvided.droppableProps}
                                                                                        className={cn(
                                                                                            "flex flex-wrap gap-5 items-start p-6 rounded-2xl border-2 border-dashed transition-colors",
                                                                                            widgets.filter(w => w.parent_id === widget.id).length === 0 ? "min-h-[160px]" : "min-h-[120px]",
                                                                                            innerSnapshot.isDraggingOver ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border/40 bg-muted/10"
                                                                                        )}
                                                                                    >
                                                                                        {widgets.filter(w => w.parent_id === widget.id).map((child, cIdx) => (
                                                                                            <Draggable key={child.id} draggableId={child.id} index={cIdx}>
                                                                                                {(childProvided, childSnapshot) => (
                                                                                                    <div
                                                                                                        ref={childProvided.innerRef}
                                                                                                        {...childProvided.draggableProps}
                                                                                                        className={cn(
                                                                                                            "transition-all duration-200",
                                                                                                            child.size === 'half' ? "w-[calc(50%-10px)]" : child.size === 'third' ? "w-[calc((100%-40px)/3)]" : "w-full",
                                                                                                            childSnapshot.isDragging && "opacity-80 scale-[1.02] z-50"
                                                                                                        )}
                                                                                                    >
                                                                                                        {child.type === 'ENDPOINT' ? (
                                                                                                            <EndpointWidgetCard
                                                                                                                widget={child}
                                                                                                                workflows={availableWorkflows}
                                                                                                                onEdit={() => setEditingWidgetId(child.id)}
                                                                                                                onRemove={() => removeWidget(child.id)}
                                                                                                                dragHandleProps={childProvided.dragHandleProps}
                                                                                                            />
                                                                                                        ) : child.type === 'TERMINAL' ? (
                                                                                                            <TerminalWidgetCard
                                                                                                                widget={child}
                                                                                                                onEdit={() => setEditingWidgetId(child.id)}
                                                                                                                onRemove={() => removeWidget(child.id)}
                                                                                                                dragHandleProps={childProvided.dragHandleProps}
                                                                                                            />
                                                                                                        ) : child.type === 'LINK' ? (
                                                                                                            <LinkWidgetCard
                                                                                                                widget={child}
                                                                                                                onEdit={() => setEditingWidgetId(child.id)}
                                                                                                                onRemove={() => removeWidget(child.id)}
                                                                                                                dragHandleProps={childProvided.dragHandleProps}
                                                                                                            />
                                                                                                        ) : child.type === 'TEXT' || child.type === 'IMAGE' || child.type === 'IFRAME' || child.type === 'STATUS' || child.type === 'TABLE' ? (
                                                                                                            <ContentWidgetCard
                                                                                                                widget={child}
                                                                                                                onEdit={() => setEditingWidgetId(child.id)}
                                                                                                                onRemove={() => removeWidget(child.id)}
                                                                                                                dragHandleProps={childProvided.dragHandleProps}
                                                                                                            />
                                                                                                        ) : null}
                                                                                                    </div>
                                                                                                )}
                                                                                            </Draggable>
                                                                                        ))}
                                                                                        {innerProvided.placeholder}
                                                                                        {widgets.filter(w => w.parent_id === widget.id).length === 0 && (
                                                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 w-full text-center py-4">
                                                                                                Drop widgets here
                                                                                            </p>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </Droppable>
                                                                        </SectionWidgetCard>
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
                                    <div className="space-y-1.5 pt-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tags</label>
                                        <TagSelector selectedTags={selectedTags} onChange={setSelectedTags} />
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
                                                        onClick={() => clipboardCopy(`${window.location.origin}/public/pages/${slug}`)}>
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
                                        <option value="third" className="bg-popover text-foreground">1/3 Width</option>
                                        <option value="half" className="bg-popover text-foreground">Half Width</option>
                                        <option value="full" className="bg-popover text-foreground">Full Width</option>
                                    </select>
                                </div>
                            </div>
                            
                            {activeWidget.type === 'SECTION' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Description / Subtitle</label>
                                        <textarea
                                            value={activeWidget.description || ''}
                                            onChange={e => updateWidget(activeWidget.id, { description: e.target.value })}
                                            className="w-full min-h-[80px] p-4 text-[11px] bg-muted/30 border border-border/50 rounded-2xl focus:ring-2 ring-primary/10 outline-none resize-none transition-all"
                                            placeholder="Add context or instructions for this section..."
                                        />
                                    </div>
                                </div>
                            )}

                            {activeWidget.type === 'LINK' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1 flex items-center gap-2">
                                            <Link2 className="w-3 h-3 text-indigo-500" /> Target URL
                                        </label>
                                        <Input value={activeWidget.url || ''} onChange={e => updateWidget(activeWidget.id, { url: e.target.value })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl font-mono text-indigo-400" placeholder="https://" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Button Label</label>
                                            <Input value={activeWidget.label || ''} onChange={e => updateWidget(activeWidget.id, { label: e.target.value })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl" placeholder="e.g. Open Link" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Style</label>
                                            <ButtonStylePicker
                                                presets={BUTTON_STYLES}
                                                value={activeWidget.style || ''}
                                                onChange={(val) => updateWidget(activeWidget.id, { style: val })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Description</label>
                                        <textarea
                                            value={activeWidget.description || ''}
                                            onChange={e => updateWidget(activeWidget.id, { description: e.target.value })}
                                            className="w-full min-h-[80px] p-4 text-[11px] bg-muted/30 border border-border/50 rounded-2xl focus:ring-2 ring-primary/10 outline-none resize-none transition-all"
                                            placeholder="Add a short description for this link..."
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-5 bg-muted/20 rounded-[1.5rem] border border-border/40">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Open in new tab</p>
                                            <p className="text-[11px] font-medium text-muted-foreground leading-none">Launch link in a separate window</p>
                                        </div>
                                        <button onClick={() => updateWidget(activeWidget.id, { new_tab: !activeWidget.new_tab })}
                                            className={cn("w-12 h-6 rounded-full transition-all relative shrink-0 shadow-inner", activeWidget.new_tab ? "bg-primary" : "bg-muted-foreground/20")}>
                                            <div className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-200", activeWidget.new_tab ? "right-0.5" : "left-0.5")} />
                                        </button>
                                    </div>
                                </div>
                            )}

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
                                            <ButtonStylePicker
                                                presets={BUTTON_STYLES}
                                                value={activeWidget.style || 'premium-gradient'}
                                                onChange={(val) => updateWidget(activeWidget.id, { style: val })}
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
                                        <textarea
                                            value={activeWidget.command || ''}
                                            onChange={e => updateWidget(activeWidget.id, { command: e.target.value })}
                                            placeholder="e.g. top -b -n 1"
                                            className="w-full min-h-[80px] p-4 text-xs font-mono bg-muted/30 border border-border/50 rounded-2xl focus:ring-2 ring-primary/10 outline-none resize-y transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Run Interval</label>
                                        <div className="flex gap-2 flex-wrap items-center">
                                            {[{ label: 'Once', value: undefined }, { label: '5s', value: 5 }, { label: '10s', value: 10 }, { label: '30s', value: 30 }, { label: '1m', value: 60 }].map(opt => (
                                                <button key={opt.label} onClick={() => updateWidget(activeWidget.id, { run_interval: opt.value })}
                                                    className={cn("h-9 px-4 rounded-xl text-[10px] font-black transition-all border shrink-0",
                                                        activeWidget.run_interval === opt.value
                                                            ? "bg-emerald-500/10 border-emerald-500 text-emerald-500"
                                                            : "bg-muted/30 border-transparent text-muted-foreground hover:border-emerald-500/50")}>
                                                    {opt.label}
                                                </button>
                                            ))}
                                            <div className="relative flex-1 min-w-[100px]">
                                                <Input
                                                    type="number"
                                                    value={activeWidget.run_interval || ''}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value, 10);
                                                        updateWidget(activeWidget.id, { run_interval: isNaN(val) ? undefined : val });
                                                    }}
                                                    min="1"
                                                    placeholder="Custom..."
                                                    className="h-9 text-xs font-bold bg-muted/30 border border-border/50 rounded-xl pl-3 pr-8 focus:border-emerald-500/50 focus:ring-emerald-500/20 transition-all shadow-sm"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground">s</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeWidget.type === 'TEXT' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1 flex items-center gap-2">
                                            <FileText className="w-3 h-3 text-sky-500" /> Content
                                        </label>
                                        <textarea
                                            value={activeWidget.content || ''}
                                            onChange={e => updateWidget(activeWidget.id, { content: e.target.value })}
                                            className="w-full min-h-[160px] p-4 text-[11px] bg-muted/30 border border-border/50 rounded-2xl focus:ring-2 ring-primary/10 outline-none resize-y transition-all font-mono"
                                            placeholder="Enter text or markdown content..."
                                        />
                                    </div>
                                </div>
                            )}

                            {activeWidget.type === 'IMAGE' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1 flex items-center gap-2">
                                            <ImageIcon className="w-3 h-3 text-pink-500" /> Image URL
                                        </label>
                                        <Input value={activeWidget.image_url || ''} onChange={e => updateWidget(activeWidget.id, { image_url: e.target.value })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl font-mono text-pink-400" placeholder="https://example.com/image.png" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Alt Text</label>
                                        <Input value={activeWidget.alt_text || ''} onChange={e => updateWidget(activeWidget.id, { alt_text: e.target.value })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl" placeholder="Describe the image..." />
                                    </div>
                                    {activeWidget.image_url && (
                                        <div className="rounded-2xl overflow-hidden border border-border/50 bg-muted/20">
                                            <img src={activeWidget.image_url} alt={activeWidget.alt_text || ''} className="w-full h-auto max-h-48 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeWidget.type === 'IFRAME' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1 flex items-center gap-2">
                                            <Frame className="w-3 h-3 text-violet-500" /> Embed URL
                                        </label>
                                        <Input value={activeWidget.iframe_url || ''} onChange={e => updateWidget(activeWidget.id, { iframe_url: e.target.value })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl font-mono text-violet-400" placeholder="https://grafana.example.com/d/..." />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Height (px)</label>
                                        <Input type="number" value={activeWidget.iframe_height || 400} onChange={e => updateWidget(activeWidget.id, { iframe_height: parseInt(e.target.value) || 400 })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl" min={100} max={2000} />
                                    </div>
                                </div>
                            )}

                            {activeWidget.type === 'STATUS' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1 flex items-center gap-2">
                                                <Activity className="w-3 h-3 text-teal-500" /> Label
                                            </label>
                                            <Input value={activeWidget.status_label || ''} onChange={e => updateWidget(activeWidget.id, { status_label: e.target.value })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl" placeholder="e.g. API Server" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Status</label>
                                            <select value={activeWidget.status_value || 'ok'} onChange={e => updateWidget(activeWidget.id, { status_value: e.target.value as any })}
                                                className="w-full h-11 bg-muted/30 border border-border/50 rounded-2xl text-[11px] px-4 outline-none font-bold appearance-none cursor-pointer">
                                                <option value="ok" className="bg-popover text-foreground">OK</option>
                                                <option value="warning" className="bg-popover text-foreground">Warning</option>
                                                <option value="error" className="bg-popover text-foreground">Error</option>
                                                <option value="info" className="bg-popover text-foreground">Info</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Description</label>
                                        <Input value={activeWidget.description || ''} onChange={e => updateWidget(activeWidget.id, { description: e.target.value })} className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl" placeholder="Optional status description..." />
                                    </div>
                                </div>
                            )}

                            {activeWidget.type === 'TABLE' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1 flex items-center gap-2">
                                            <Table2 className="w-3 h-3 text-orange-500" /> Column Headers
                                        </label>
                                        <Input
                                            value={(activeWidget.table_headers || []).join(', ')}
                                            onChange={e => updateWidget(activeWidget.id, { table_headers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            className="h-11 text-sm bg-muted/30 border border-border/50 rounded-2xl"
                                            placeholder="Column 1, Column 2, Column 3"
                                        />
                                        <p className="text-[9px] text-muted-foreground px-1">Separate column names with commas</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Data Rows</label>
                                        <textarea
                                            value={(activeWidget.table_rows || []).map(row => row.join(', ')).join('\n')}
                                            onChange={e => updateWidget(activeWidget.id, {
                                                table_rows: e.target.value.split('\n').map(line => line.split(',').map(s => s.trim())).filter(row => row.some(cell => cell))
                                            })}
                                            className="w-full min-h-[120px] p-4 text-[11px] bg-muted/30 border border-border/50 rounded-2xl focus:ring-2 ring-primary/10 outline-none resize-y transition-all font-mono"
                                            placeholder="Row 1 Col 1, Row 1 Col 2, Row 1 Col 3&#10;Row 2 Col 1, Row 2 Col 2, Row 2 Col 3"
                                        />
                                        <p className="text-[9px] text-muted-foreground px-1">One row per line, separate cells with commas</p>
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
                {(() => {
                    const r = resolveButtonStyle(widget.style, 'premium-gradient');
                    return (
                        <div
                            className={cn("h-14 w-full rounded-2xl flex items-center justify-center text-white font-black tracking-[0.15em] text-[10px] shadow-sm", r.className)}
                            style={r.style}
                        >
                            <Zap className="w-4 h-4 mr-2" />
                            {widget.label || 'Execute'}
                        </div>
                    );
                })()}
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

interface LinkWidgetCardProps {
    widget: PageWidget;
    onEdit: () => void;
    onRemove: () => void;
    dragHandleProps: any;
}

const LinkWidgetCard: React.FC<LinkWidgetCardProps> = ({ widget, onEdit, onRemove, dragHandleProps }) => (
    <div className="group bg-card border border-border rounded-[2rem] overflow-hidden hover:border-indigo-500/40 transition-all shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-3">
                <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                    <GripVertical className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-black uppercase tracking-tight truncate max-w-[120px]">{widget.title || 'Link'}</span>
                    <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[120px]">{widget.url || '---'}</span>
                </div>
            </div>
            <div className="flex gap-2 shrink-0">
                <button onClick={onEdit} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <SettingsIcon className="w-3 h-3" />
                </button>
                <button onClick={onRemove} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
        <div className="p-4">
            {widget.description && (
                <p className="text-[10px] text-muted-foreground mb-3 px-2 line-clamp-2">{widget.description}</p>
            )}
            {(() => {
                const r = resolveButtonStyle(widget.style, 'bg-indigo-600');
                return (
                    <div
                        className={cn("h-12 w-full rounded-[1rem] flex items-center justify-center text-white font-black tracking-[0.1em] text-[10px] shadow-sm cursor-pointer", r.className)}
                        style={r.style}
                    >
                        <Link2 className="w-3.5 h-3.5 mr-2" />
                        {widget.label || 'Open Link'}
                    </div>
                );
            })()}
        </div>
    </div>
);

interface SectionWidgetCardProps {
    widget: PageWidget;
    onEdit: () => void;
    onRemove: () => void;
    dragHandleProps: any;
    children?: React.ReactNode;
}

const SectionWidgetCard: React.FC<SectionWidgetCardProps> = ({ widget, onEdit, onRemove, dragHandleProps, children }) => (
    <div className="group border border-border/40 rounded-3xl p-4 bg-card/30 relative">
        <div className="absolute right-3 top-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button onClick={onEdit} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <SettingsIcon className="w-3 h-3" />
            </button>
            <button onClick={onRemove} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3 h-3" />
            </button>
        </div>
        <div className="flex items-center gap-2 mb-3 pb-3 border-b-2 border-border/40">
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors mr-1">
                <GripVertical className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-black tracking-tight">{widget.title || 'Section Header'}</h3>
        </div>
        {widget.description && (
            <p className="text-xs text-muted-foreground mb-3 ml-7">{widget.description}</p>
        )}
        {children}
    </div>
);

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    ok: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: 'bg-emerald-500' },
    warning: { bg: 'bg-amber-500/10', text: 'text-amber-500', dot: 'bg-amber-500' },
    error: { bg: 'bg-rose-500/10', text: 'text-rose-500', dot: 'bg-rose-500' },
    info: { bg: 'bg-sky-500/10', text: 'text-sky-500', dot: 'bg-sky-500' },
};

const WIDGET_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    TEXT: { icon: <FileText className="w-3.5 h-3.5" />, color: 'sky', label: 'Text Block' },
    IMAGE: { icon: <ImageIcon className="w-3.5 h-3.5" />, color: 'pink', label: 'Image' },
    IFRAME: { icon: <Frame className="w-3.5 h-3.5" />, color: 'violet', label: 'Iframe' },
    STATUS: { icon: <Activity className="w-3.5 h-3.5" />, color: 'teal', label: 'Status' },
    TABLE: { icon: <Table2 className="w-3.5 h-3.5" />, color: 'orange', label: 'Table' },
};

interface ContentWidgetCardProps {
    widget: PageWidget;
    onEdit: () => void;
    onRemove: () => void;
    dragHandleProps: any;
}

const ContentWidgetCard: React.FC<ContentWidgetCardProps> = ({ widget, onEdit, onRemove, dragHandleProps }) => {
    const meta = WIDGET_META[widget.type] || WIDGET_META.TEXT;
    const colorClasses = `bg-${meta.color}-500/10 text-${meta.color}-500 group-hover:bg-${meta.color}-500/20`;

    return (
        <div className="group bg-card border border-border rounded-[2rem] overflow-hidden hover:border-primary/40 transition-all shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-card">
                <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                    <GripVertical className="w-4 h-4" />
                </div>
                <div className={cn("p-1.5 rounded-lg transition-colors", colorClasses)}>
                    {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-tight truncate">{widget.title || meta.label}</p>
                    <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-widest">{meta.label}</p>
                </div>
                <button onClick={onEdit} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-transparent hover:border-border">
                    <SettingsIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={onRemove} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-transparent hover:border-border">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="p-5">
                {widget.type === 'TEXT' && (
                    <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{widget.content || 'No content yet...'}</p>
                )}
                {widget.type === 'IMAGE' && (
                    widget.image_url ? (
                        <img src={widget.image_url} alt={widget.alt_text || ''} className="w-full h-32 object-contain rounded-xl bg-muted/20" onError={e => { e.currentTarget.src = ''; e.currentTarget.alt = 'Image failed to load'; }} />
                    ) : (
                        <div className="h-24 flex items-center justify-center rounded-xl bg-muted/20 text-muted-foreground">
                            <ImageIcon className="w-8 h-8 opacity-30" />
                        </div>
                    )
                )}
                {widget.type === 'IFRAME' && (
                    <div className="h-20 flex items-center justify-center rounded-xl bg-violet-500/5 border border-violet-500/20 text-violet-400">
                        <Frame className="w-5 h-5 mr-2 opacity-50" />
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{widget.iframe_url ? 'Embedded Content' : 'No URL set'}</span>
                    </div>
                )}
                {widget.type === 'STATUS' && (() => {
                    const sc = STATUS_COLORS[widget.status_value || 'ok'];
                    return (
                        <div className={cn("flex items-center gap-3 p-4 rounded-xl", sc.bg)}>
                            <div className={cn("w-3 h-3 rounded-full animate-pulse", sc.dot)} />
                            <span className={cn("text-sm font-black uppercase", sc.text)}>{widget.status_label || 'Status'}</span>
                        </div>
                    );
                })()}
                {widget.type === 'TABLE' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                            <thead>
                                <tr className="border-b border-border">
                                    {(widget.table_headers || []).map((h, i) => (
                                        <th key={i} className="px-3 py-2 text-left font-black uppercase tracking-widest text-muted-foreground">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(widget.table_rows || []).slice(0, 2).map((row, ri) => (
                                    <tr key={ri} className="border-b border-border/30">
                                        {row.map((cell, ci) => (
                                            <td key={ci} className="px-3 py-1.5 text-muted-foreground">{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {(widget.table_rows || []).length > 2 && (
                            <p className="text-[9px] text-muted-foreground/50 mt-1 px-3">+{(widget.table_rows || []).length - 2} more rows</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PageDesignerPage;
