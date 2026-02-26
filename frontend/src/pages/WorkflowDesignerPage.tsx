import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Zap, Save, ChevronLeft, Layout,
    Settings as SettingsIcon, Layers, Server,
    Plus, Terminal, Trash2, Clock, History, Database, SlidersHorizontal, ChevronDown, Play, GripVertical, File
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { Workflow, WorkflowGroup, WorkflowStep, WorkflowInput, WorkflowVariable, Server as ServerType, Tag } from '../types';
import WorkflowHistory from '../components/WorkflowHistory';
import WorkflowRunner from '../components/WorkflowRunner';
import { TagSelector } from '../components/TagSelector';
import { WorkflowFilesTab } from '../components/WorkflowFilesTab';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import HookManager from '../components/HookManager';
import { WorkflowHook } from '../types';

const WorkflowDesignerPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeNamespace } = useNamespace();
    const { apiFetch } = useAuth();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState<Tag[]>([]);
    const [inputs, setInputs] = useState<Partial<WorkflowInput>[]>([]);
    const [variables, setVariables] = useState<Partial<WorkflowVariable>[]>([]);
    const [groups, setGroups] = useState<Partial<WorkflowGroup>[]>([]);
    const [availableServers, setAvailableServers] = useState<ServerType[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'steps' | 'variables' | 'files' | 'hooks' | 'history'>('general');
    const [hooks, setHooks] = useState<WorkflowHook[]>([]);
    const [allWorkflows, setAllWorkflows] = useState<Workflow[]>([]);
    const [defaultServerId, setDefaultServerId] = useState<string | undefined>(undefined);
    const [targetFolder, setTargetFolder] = useState<string>('');
    const [cleanupFiles, setCleanupFiles] = useState<boolean>(false);
    const [openSettingsGroupIdx, setOpenSettingsGroupIdx] = useState<number | null>(null);

    useEffect(() => {
        const fetchServers = async () => {
            try {
                const response = await apiFetch(`${API_BASE_URL}/servers`);
                const data = await response.json();
                setAvailableServers(data || []);
            } catch (error) {
                console.error('Failed to fetch servers:', error);
            }
        };

        const fetchAllWorkflows = async () => {
            if (!activeNamespace) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows`);
                const data = await response.json();
                setAllWorkflows(data || []);
            } catch (error) {
                console.error('Failed to fetch all workflows:', error);
            }
        };

        const fetchWorkflow = async () => {
            if (!id) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}/workflows/${id}`);
                const data = await response.json();
                setName(data.name);
                setDescription(data.description);
                const defaultServerIdVal = data.default_server_id === '00000000-0000-0000-0000-000000000000' ? '' : (data.default_server_id || '');
                setDefaultServerId(defaultServerIdVal);
                setTargetFolder(data.target_folder || '');
                setCleanupFiles(!!data.cleanup_files);
                setTags(data.tags || []);

                const cleanGroups = (data.groups || []).map((g: any) => {
                    const cleanedGroup = { ...g };
                    if (cleanedGroup.default_server_id === '00000000-0000-0000-0000-000000000000') {
                        cleanedGroup.default_server_id = undefined;
                    }
                    if (cleanedGroup.steps) {
                        cleanedGroup.steps = cleanedGroup.steps.map((s: any) => {
                            const cleanedStep = { ...s };
                            if (cleanedStep.server_id === '00000000-0000-0000-0000-000000000000') {
                                cleanedStep.server_id = undefined;
                            }
                            return cleanedStep;
                        });
                    }
                    return cleanedGroup;
                });

                setGroups(cleanGroups.sort((a: any, b: any) => a.order - b.order));
                setInputs((data.inputs || []).map((inp: WorkflowInput) => ({
                    ...inp,
                    type: inp.type || 'input',
                })));
                setVariables(data.variables || []);
                setHooks(data.hooks || []);
            } catch (error) {
                console.error('Failed to fetch workflow:', error);
            }
        };

        fetchServers();
        fetchAllWorkflows();
        if (id) fetchWorkflow();
    }, [id, activeNamespace]);

    const handleSave = async () => {
        if (!activeNamespace) {
            console.error('No active namespace');
            return;
        }
        if (!name.trim()) return;

        setIsSaving(true);
        try {
            const wfData = {
                name,
                description,
                status: 'active',
                default_server_id: defaultServerId || undefined,
                target_folder: targetFolder,
                cleanup_files: cleanupFiles,
                namespace_id: activeNamespace.id,
                tags,
                inputs: inputs.filter(i => i.key?.trim()),
                variables: variables.filter(v => v.key?.trim()),
                groups: groups.map((g, gIdx) => ({
                    ...g,
                    default_server_id: g.default_server_id || undefined,
                    order: gIdx,
                    steps: g.steps?.map((s, sIdx) => ({
                        ...s,
                        order: sIdx,
                        server_id: s.server_id || undefined
                    }))
                })),
                hooks: hooks.map((h, hIdx) => ({
                    ...h,
                    order: hIdx,
                    target_workflow: undefined // Don't send cyclic data
                }))
            };

            const method = id ? 'PUT' : 'POST';
            const url = id
                ? `${API_BASE_URL}/workflows/${id}`
                : `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows`;

            const response = await apiFetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(wfData)
            });

            if (response.ok) {
                navigate('/workflows');
            }
        } catch (error) {
            console.error('Failed to save workflow:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddGroup = () => {
        let maxNum = 0;
        groups.forEach(g => {
            const match = g.key?.match(/group_(\d+)/);
            if (match && match[1]) {
                const num = parseInt(match[1]);
                if (num > maxNum) maxNum = num;
            }
        });
        const nextNum = maxNum + 1;

        setGroups([...groups, {
            name: `Group ${nextNum}`,
            key: `group_${nextNum}`,
            order: groups.length,
            is_parallel: false,
            steps: []
        }]);
        setActiveTab('steps');
    };

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;

        const { source, destination, type } = result;

        if (type === 'GROUP') {
            const newGroups = Array.from(groups);
            const [movedGroup] = newGroups.splice(source.index, 1);
            newGroups.splice(destination.index, 0, movedGroup);

            // Reassign orders
            newGroups.forEach((g, idx) => { g.order = idx; });
            setGroups(newGroups);
        } else if (type === 'STEP') {
            const sourceGroupIdx = groups.findIndex(g => g.key === source.droppableId);
            const destGroupIdx = groups.findIndex(g => g.key === destination.droppableId);

            if (sourceGroupIdx === -1 || destGroupIdx === -1) return;

            const newGroups = [...groups];
            const sourceSteps = [...(newGroups[sourceGroupIdx].steps || [])];
            const destSteps = sourceGroupIdx === destGroupIdx ? sourceSteps : [...(newGroups[destGroupIdx].steps || [])];

            const [movedStep] = sourceSteps.splice(source.index, 1);
            destSteps.splice(destination.index, 0, movedStep);

            newGroups[sourceGroupIdx].steps = sourceSteps;
            newGroups[destGroupIdx].steps = destSteps;

            // Reassign orders for both affected groups
            newGroups[sourceGroupIdx].steps.forEach((s, idx) => { s.order = idx; });
            if (sourceGroupIdx !== destGroupIdx) {
                newGroups[destGroupIdx].steps.forEach((s, idx) => { s.order = idx; });
            }

            setGroups(newGroups);
        }
    };

    return (
        <WorkflowRunner>
            {(runWorkflow) => (
                <div className="flex flex-col h-[calc(100vh-2rem)] bg-background rounded-xl border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
                    {/* Page Header */}
                    <div className="flex items-center justify-between px-6 py-3 bg-card border-b border-border shadow-sm">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate('/workflows')}
                                className="h-9 w-9 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </Button>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-sm font-bold tracking-tight text-foreground uppercase">
                                        {id ? 'Modify Automation' : 'New Orchestration'}
                                    </h1>
                                    <Badge variant="outline" className="text-[9px] font-bold px-1.5 h-4 bg-primary/10 border-primary/20 text-primary">
                                        {id ? 'v4' : 'Draft'}
                                    </Badge>
                                </div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest leading-none">
                                    {name || 'Untitled Pipeline'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex p-0.5 bg-muted/50 rounded-lg border border-border mr-2">
                                <button
                                    onClick={() => setActiveTab('general')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        activeTab === 'general' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <SettingsIcon className="w-3 h-3" /> General
                                </button>
                                <button
                                    onClick={() => setActiveTab('steps')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        activeTab === 'steps' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Layout className="w-3 h-3" /> Steps
                                </button>
                                <button
                                    onClick={() => setActiveTab('variables')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        activeTab === 'variables' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Database className="w-3 h-3" /> Variables
                                </button>
                                <button
                                    onClick={() => setActiveTab('files')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        activeTab === 'files' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <File className="w-3 h-3" /> Files
                                </button>
                                <button
                                    onClick={() => setActiveTab('hooks')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                        activeTab === 'hooks' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Zap className="w-3 h-3" /> Hooks
                                </button>
                                {id && (
                                    <button
                                        onClick={() => setActiveTab('history')}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                            activeTab === 'history' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <History className="w-3 h-3 text-emerald-500" /> History
                                    </button>
                                )}
                            </div>
                            {id && (
                                <Button
                                    onClick={() => runWorkflow({ id: id as string, name, description, inputs: inputs as any, groups: groups as any })}
                                    variant="outline"
                                    className="h-9 px-4 rounded-lg border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400 text-[10px] font-bold uppercase tracking-widest transition-all"
                                >
                                    <Play className="w-3.5 h-3.5 mr-2" />
                                    Run
                                </Button>
                            )}
                            <Button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="premium-gradient text-white text-[10px] font-bold uppercase tracking-widest h-9 px-6 rounded-lg shadow-premium"
                            >
                                <Save className="w-3.5 h-3.5 mr-2" />
                                {isSaving ? 'Saving...' : 'Save Pipeline'}
                            </Button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-background/50">
                        <div className="max-w-4xl mx-auto">
                            {activeTab === 'general' ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                                    <div className="grid grid-cols-12 gap-6">
                                        <div className="col-span-12 space-y-4">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                                                    <Zap className="w-4 h-4" />
                                                </div>
                                                <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Vitals</h2>
                                            </div>
                                            <div className="grid gap-4 bg-card p-6 rounded-xl border border-border">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Pipeline Identification</label>
                                                    <Input
                                                        value={name}
                                                        onChange={(e) => setName(e.target.value)}
                                                        placeholder="e.g. Master Production Deployment"
                                                        className="bg-background border-border h-10 text-sm font-medium focus:ring-1 focus:ring-primary/30"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Operational Description</label>
                                                    <Input
                                                        value={description}
                                                        onChange={(e) => setDescription(e.target.value)}
                                                        placeholder="What is the objective of this automation?"
                                                        className="bg-background border-border h-10 text-sm font-medium"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Organize Tags</label>
                                                    <TagSelector selectedTags={tags} onChange={setTags} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-span-12 space-y-4">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                                                    <Server className="w-4 h-4" />
                                                </div>
                                                <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Execution Context</h2>
                                            </div>
                                            <div className="bg-card p-6 rounded-xl border border-border">
                                                <div className="max-w-md space-y-1.5">
                                                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Default Target Resource</label>
                                                    <select
                                                        value={defaultServerId || ''}
                                                        onChange={(e) => setDefaultServerId(e.target.value || undefined)}
                                                        className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                                                    >
                                                        <option value="">Local Engine Orchestrator</option>
                                                        {availableServers.map(s => (
                                                            <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                                                        ))}
                                                    </select>
                                                    <p className="text-[9px] font-medium text-muted-foreground mt-2">
                                                        Individual steps can still override this setting in the Blueprint tab.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : activeTab === 'variables' ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
                                    {/* Runtime Inputs Section */}
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
                                                    <Terminal className="w-4 h-4" />
                                                </div>
                                                <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Runtime Variable Definitions (Inputs)</h2>
                                            </div>
                                            <Button
                                                onClick={() => setInputs([...inputs, { key: '', label: '', type: 'input', default_value: '' }])}
                                                className="h-8 text-[9px] font-bold uppercase tracking-widest px-4"
                                                variant="outline"
                                            >
                                                <Plus className="w-3 h-3 mr-2" /> Add Input
                                            </Button>
                                        </div>

                                        <div className="bg-card rounded-xl border border-border p-6 shadow-sm overflow-hidden">
                                            {inputs.length === 0 ? (
                                                <div className="py-6 text-center opacity-40 select-none">
                                                    <Terminal className="w-8 h-8 mx-auto mb-3" />
                                                    <p className="text-[10px] font-bold uppercase tracking-widest">No runtime variables defined</p>
                                                    <p className="text-[9px] mt-1 font-medium italic">Use runtime variables in your commands via {"{{key}}"}</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {inputs.map((input, idx) => (
                                                        <div key={idx} className="flex flex-col gap-4 p-5 bg-background/50 rounded-xl border border-border/50 animate-in fade-in slide-in-from-bottom-1 duration-300">
                                                            <div className="grid grid-cols-12 gap-5 items-start">
                                                                {/* Left side: Label & Key */}
                                                                <div className="col-span-5 space-y-4">
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Display Label</label>
                                                                        <Input
                                                                            value={input.label}
                                                                            onChange={(e) => {
                                                                                const ni = [...inputs];
                                                                                ni[idx].label = e.target.value;
                                                                                setInputs(ni);
                                                                            }}
                                                                            placeholder="What should the user see?"
                                                                            className="h-8 text-[11px] border-border bg-background"
                                                                        />
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[8px] font-black uppercase tracking-widest text-primary">Variable Key</label>
                                                                        <Input
                                                                            value={input.key}
                                                                            onChange={(e) => {
                                                                                const ni = [...inputs];
                                                                                ni[idx].key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                                                setInputs(ni);
                                                                            }}
                                                                            placeholder="e.g. app_node_version"
                                                                            className="h-8 text-[11px] font-mono border-border bg-background"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Right side: Type & Default Value */}
                                                                <div className="col-span-6 space-y-4">
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Type</label>
                                                                        <select
                                                                            value={input.type || 'input'}
                                                                            onChange={(e) => { const ni = [...inputs]; ni[idx].type = e.target.value as WorkflowInput['type']; setInputs(ni); }}
                                                                            className="h-8 px-2 w-full text-[11px] font-semibold border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
                                                                        >
                                                                            <option value="input">Input</option>
                                                                            <option value="number">Number</option>
                                                                            <option value="select">Select</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                                                                            {input.type === 'select' ? 'Options (comma-separated)' : 'Default Value'}
                                                                        </label>
                                                                        <Input
                                                                            type={input.type === 'number' ? 'number' : 'text'}
                                                                            value={input.default_value}
                                                                            onChange={(e) => {
                                                                                const ni = [...inputs];
                                                                                ni[idx].default_value = e.target.value;
                                                                                setInputs(ni);
                                                                            }}
                                                                            placeholder={
                                                                                input.type === 'number' ? '0'
                                                                                    : input.type === 'select' ? 'option1, option2, option3'
                                                                                        : 'default text...'
                                                                            }
                                                                            className="h-8 text-[11px] border-border bg-background"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Delete Button */}
                                                                <div className="col-span-1 flex justify-end items-center h-[120px]">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                                        onClick={() => {
                                                                            const ni = inputs.filter((_, i) => i !== idx);
                                                                            setInputs(ni);
                                                                        }}
                                                                        title="Delete input"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Static Variables Section */}
                                    <div className="space-y-6 pt-6 border-t border-border/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                                                    <Database className="w-4 h-4" />
                                                </div>
                                                <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Static Variables</h2>
                                            </div>
                                            <Button
                                                onClick={() => setVariables([...variables, { key: '', value: '' }])}
                                                className="h-8 text-[9px] font-bold uppercase tracking-widest px-4"
                                                variant="outline"
                                            >
                                                <Plus className="w-3 h-3 mr-2" /> Add Variable
                                            </Button>
                                        </div>

                                        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                                            {variables.length === 0 ? (
                                                <div className="py-6 text-center opacity-40 select-none">
                                                    <Database className="w-8 h-8 mx-auto mb-3" />
                                                    <p className="text-[10px] font-bold uppercase tracking-widest">No static variables defined</p>
                                                    <p className="text-[9px] mt-1 font-medium italic">Reference via {'{{'}{"variable.key"}{'}}'} in commands</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {variables.map((variable, idx) => (
                                                        <div key={idx} className="flex items-end gap-3 p-4 bg-background/50 rounded-lg border border-border/50 animate-in fade-in slide-in-from-bottom-1 duration-300">
                                                            <div className="flex-1 space-y-1.5">
                                                                <label className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Variable Key</label>
                                                                <div className="relative">
                                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/60 font-mono select-none">$</span>
                                                                    <Input
                                                                        value={variable.key}
                                                                        onChange={(e) => {
                                                                            const nv = [...variables];
                                                                            nv[idx].key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                                            setVariables(nv);
                                                                        }}
                                                                        placeholder="e.g. db_host"
                                                                        className="h-8 text-[11px] font-mono border-border bg-background pl-5"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex-[2] space-y-1.5">
                                                                <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Value</label>
                                                                <Input
                                                                    value={variable.value}
                                                                    onChange={(e) => {
                                                                        const nv = [...variables];
                                                                        nv[idx].value = e.target.value;
                                                                        setVariables(nv);
                                                                    }}
                                                                    placeholder="Static value..."
                                                                    className="h-8 text-[11px] border-border bg-background font-mono"
                                                                />
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors shrink-0 mb-0.5"
                                                                onClick={() => setVariables(variables.filter((_, i) => i !== idx))}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-4 flex items-start gap-3">
                                            <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-500 shrink-0 mt-0.5">
                                                <Zap className="w-3 h-3" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">Static Variables vs Runtime Inputs</p>
                                                <p className="text-[10px] text-muted-foreground leading-relaxed">
                                                    <strong>Static Variables</strong> are saved with the workflow and automatically injected at runtime using <code className="bg-emerald-500/10 px-1 rounded text-emerald-600">{"{{variable.key}}"}</code>.<br />
                                                    <strong>Runtime Inputs</strong> prompt the user for values on each run and are used via <code className="bg-primary/10 px-1 rounded text-primary">{"{{key}}"}</code>.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : activeTab === 'steps' ? (
                                <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                                    {groups.length === 0 ? (
                                        <div className="h-64 flex flex-col items-center justify-center gap-4 opacity-50 border-2 border-dashed border-border rounded-2xl bg-card">
                                            <Layers className="w-12 h-12 text-muted-foreground" />
                                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Blueprint is currently empty</p>
                                            <Button onClick={handleAddGroup} variant="outline" className="rounded-full px-6">Initialize Architecture</Button>
                                        </div>
                                    ) : (
                                        <DragDropContext onDragEnd={handleDragEnd}>
                                            <Droppable droppableId="groups" type="GROUP">
                                                {(provided) => (
                                                    <div
                                                        className="space-y-6"
                                                        {...provided.droppableProps}
                                                        ref={provided.innerRef}
                                                    >
                                                        {groups.map((group, gIdx) => (
                                                            <Draggable key={group.key || `temp_group_${gIdx}`} draggableId={group.key || `temp_group_${gIdx}`} index={gIdx}>
                                                                {(provided, snapshot) => (
                                                                    <div
                                                                        ref={provided.innerRef}
                                                                        {...provided.draggableProps}
                                                                        className={cn(
                                                                            "bg-card border rounded-xl overflow-hidden transition-all",
                                                                            snapshot.isDragging ? "border-primary/50 shadow-xl shadow-black/20" : "border-border shadow-sm"
                                                                        )}
                                                                    >
                                                                        <div className="px-6 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                                                                            <div className="flex items-center gap-3">
                                                                                <div
                                                                                    {...provided.dragHandleProps}
                                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing transition-colors"
                                                                                >
                                                                                    <GripVertical className="w-4 h-4" />
                                                                                </div>
                                                                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                                                                                    <Layers className="w-4 h-4 text-primary" />
                                                                                </div>
                                                                                <div className="flex flex-col">
                                                                                    <Input
                                                                                        value={group.name}
                                                                                        onChange={(e) => {
                                                                                            const ng = [...groups];
                                                                                            ng[gIdx].name = e.target.value;
                                                                                            setGroups(ng);
                                                                                        }}
                                                                                        className="bg-transparent border border-transparent hover:border-border/50 focus:border-primary/30 focus:bg-background h-7 px-2 -ml-2 rounded-md text-sm font-bold tracking-tight focus-visible:ring-1 focus-visible:ring-primary/20 min-w-[200px] transition-all"
                                                                                        placeholder="Group Name"
                                                                                    />
                                                                                    <div className="flex items-center gap-1 pl-0.5">
                                                                                        <span className="text-[10px] font-mono text-muted-foreground/50">ID:</span>
                                                                                        <Input
                                                                                            value={group.key || ''}
                                                                                            onChange={(e) => {
                                                                                                const ng = [...groups];
                                                                                                ng[gIdx].key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                                                                setGroups(ng);
                                                                                            }}
                                                                                            className="bg-transparent border border-transparent hover:border-border/50 focus:border-primary/30 focus:bg-background h-6 px-1.5 -ml-1.5 rounded-md text-[10px] font-mono text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/20 w-[150px] transition-all"
                                                                                            placeholder="group_key"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                {/* Active config badges moved here */}
                                                                                {(group.condition || group.default_server_id) && (
                                                                                    <div className="flex items-center gap-2 mr-2 pr-4 border-r border-border/50">
                                                                                        {group.condition && (
                                                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] font-bold text-amber-500 max-w-[160px] truncate">
                                                                                                if {group.condition}
                                                                                            </span>
                                                                                        )}
                                                                                        {group.default_server_id && (
                                                                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-500">
                                                                                                <Server className="w-3 h-3" />
                                                                                                {availableServers.find(s => s.id === group.default_server_id)?.name || 'Server'}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                                <button
                                                                                    onClick={() => {
                                                                                        const ng = [...groups];
                                                                                        ng[gIdx].is_parallel = !ng[gIdx].is_parallel;
                                                                                        setGroups(ng);
                                                                                    }}
                                                                                    className={cn(
                                                                                        "px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all border",
                                                                                        group.is_parallel
                                                                                            ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                                                                                            : "bg-background border-border text-muted-foreground"
                                                                                    )}
                                                                                >
                                                                                    {group.is_parallel ? 'Parallel' : 'Sequence'}
                                                                                </button>
                                                                                <div className="relative">
                                                                                    <button
                                                                                        onClick={() => setOpenSettingsGroupIdx(openSettingsGroupIdx === gIdx ? null : gIdx)}
                                                                                        className={cn(
                                                                                            "h-8 w-8 flex items-center justify-center rounded-md border transition-all",
                                                                                            openSettingsGroupIdx === gIdx
                                                                                                ? "bg-primary/10 border-primary/30 text-primary"
                                                                                                : (group.default_server_id || group.condition)
                                                                                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                                                                                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                                                                                        )}
                                                                                        title="Group settings"
                                                                                    >
                                                                                        <SlidersHorizontal className="w-3.5 h-3.5" />
                                                                                    </button>
                                                                                    {/* Floating popup */}
                                                                                    {openSettingsGroupIdx === gIdx && (
                                                                                        <>
                                                                                            {/* Backdrop */}
                                                                                            <div
                                                                                                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                                                                                                onClick={() => setOpenSettingsGroupIdx(null)}
                                                                                            />
                                                                                            {/* Popup card — fixed modal, above all content */}
                                                                                            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[520px] bg-card border border-primary/20 rounded-xl shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-150">
                                                                                                <div className="px-5 pt-4 pb-2 flex items-center justify-between border-b border-border/50">
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                                                                                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Group Configuration</span>
                                                                                                    </div>
                                                                                                    <span className="text-[9px] text-muted-foreground font-mono opacity-50">{group.name}</span>
                                                                                                </div>
                                                                                                <div className="p-5 grid grid-cols-1 gap-5">
                                                                                                    {/* Condition */}
                                                                                                    <div className="space-y-2">
                                                                                                        <label className="text-[8px] font-black uppercase tracking-widest text-amber-500">Condition <span className="text-muted-foreground/50 normal-case font-medium">— skip this group unless condition is true</span></label>
                                                                                                        <input
                                                                                                            type="text"
                                                                                                            value={group.condition || ''}
                                                                                                            onChange={(e) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx].condition = e.target.value;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            placeholder={`{{step.${group.key || 'group_1'}.status}} == "SUCCESS"  &&  {{variable.env}} != "staging"`}
                                                                                                            className="w-full h-9 px-3 text-[11px] font-mono rounded-lg border border-border bg-background text-amber-500 placeholder:text-muted-foreground/25 outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30"
                                                                                                            autoFocus
                                                                                                        />
                                                                                                        <p className="text-[9px] text-muted-foreground leading-relaxed">Operators: <code className="bg-muted px-1 rounded">==</code> <code className="bg-muted px-1 rounded">!=</code> <code className="bg-muted px-1 rounded">&amp;&amp;</code> <code className="bg-muted px-1 rounded">||</code> &nbsp; References: <code className="bg-muted px-1 rounded">{"{{step.key.status}}"}</code> <code className="bg-muted px-1 rounded">{"{{variable.key}}"}</code> <code className="bg-muted px-1 rounded">{"{{input.key}}"}</code></p>
                                                                                                    </div>
                                                                                                    {/* Server override */}
                                                                                                    <div className="space-y-2">
                                                                                                        <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Server Override <span className="text-muted-foreground/50 normal-case font-medium">— run all steps on this server</span></label>
                                                                                                        <select
                                                                                                            value={group.default_server_id || ''}
                                                                                                            onChange={(e) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx].default_server_id = e.target.value || undefined;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            className="flex h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                                                                                                        >
                                                                                                            <option value="">— Use workflow default —</option>
                                                                                                            {availableServers.map(s => (
                                                                                                                <option key={s.id} value={s.id}>{s.name} ({s.host})</option>
                                                                                                            ))}
                                                                                                        </select>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div className="px-5 pb-4 flex justify-end">
                                                                                                    <Button
                                                                                                        onClick={() => setOpenSettingsGroupIdx(null)}
                                                                                                        className="h-8 text-[10px] font-bold uppercase tracking-widest px-6 premium-gradient text-white shadow-premium"
                                                                                                    >
                                                                                                        Confirm
                                                                                                    </Button>
                                                                                                </div>
                                                                                            </div>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                                                    onClick={() => {
                                                                                        const ng = groups.filter((_, i) => i !== gIdx);
                                                                                        setGroups(ng);
                                                                                    }}
                                                                                >
                                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>

                                                                        <Droppable droppableId={group.key || `temp_group_${gIdx}`} type="STEP">
                                                                            {(provided) => (
                                                                                <div
                                                                                    className="p-4 md:p-6 space-y-3"
                                                                                    {...provided.droppableProps}
                                                                                    ref={provided.innerRef}
                                                                                >
                                                                                    {group.steps?.map((step, sIdx) => (
                                                                                        <Draggable key={step.id || `temp_step_${gIdx}_${sIdx}`} draggableId={step.id?.toString() || `temp_step_${gIdx}_${sIdx}`} index={sIdx}>
                                                                                            {(provided, snapshot) => (
                                                                                                <div
                                                                                                    ref={provided.innerRef}
                                                                                                    {...provided.draggableProps}
                                                                                                    className={cn(
                                                                                                        "flex items-center gap-4 p-4 rounded-lg border transition-all group/step",
                                                                                                        snapshot.isDragging ? "bg-card border-primary/40 shadow-lg" : "bg-background/50 border-border/50 hover:bg-background"
                                                                                                    )}
                                                                                                >
                                                                                                    <div
                                                                                                        {...provided.dragHandleProps}
                                                                                                        className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-foreground transition-colors p-1 -ml-2"
                                                                                                    >
                                                                                                        <GripVertical className="w-4 h-4" />
                                                                                                    </div>
                                                                                                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground font-bold text-[10px] shrink-0 border border-border text-xs">
                                                                                                        {sIdx + 1}
                                                                                                    </div>
                                                                                                    <div className="flex-1 grid grid-cols-12 gap-4">
                                                                                                        <div className="col-span-4 space-y-1">
                                                                                                            <label className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Action Label</label>
                                                                                                            <Input
                                                                                                                value={step.name}
                                                                                                                onChange={(e) => {
                                                                                                                    const ng = [...groups];
                                                                                                                    ng[gIdx]!.steps![sIdx].name = e.target.value;
                                                                                                                    setGroups(ng);
                                                                                                                }}
                                                                                                                className="bg-muted/50 border-border h-8 text-[11px] font-medium rounded-md px-2"
                                                                                                            />
                                                                                                        </div>
                                                                                                        <div className="col-span-8 space-y-1">
                                                                                                            <label className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Command Sequence</label>
                                                                                                            <div className="relative">
                                                                                                                <Terminal className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                                                                                                <Input
                                                                                                                    value={step.command_text}
                                                                                                                    onChange={(e) => {
                                                                                                                        const ng = [...groups];
                                                                                                                        ng[gIdx]!.steps![sIdx].command_text = e.target.value;
                                                                                                                        setGroups(ng);
                                                                                                                    }}
                                                                                                                    className="bg-muted/50 border-border h-8 pl-8 text-[11px] font-mono rounded-md px-2"
                                                                                                                />
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <Button
                                                                                                        variant="ghost"
                                                                                                        size="icon"
                                                                                                        className="h-8 w-8 text-muted-foreground/30 hover:text-destructive transition-all"
                                                                                                        onClick={() => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx].steps = ng[gIdx].steps?.filter((_, i) => i !== sIdx);
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                    >
                                                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                                                    </Button>
                                                                                                </div>
                                                                                            )}
                                                                                        </Draggable>
                                                                                    ))}
                                                                                    {provided.placeholder}

                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        onClick={() => {
                                                                                            const ng = [...groups];
                                                                                            if (!ng[gIdx].steps) ng[gIdx].steps = [];
                                                                                            ng[gIdx].steps!.push({
                                                                                                name: `Action ${ng[gIdx].steps!.length + 1}`,
                                                                                                command_text: '',
                                                                                                order: ng[gIdx].steps!.length
                                                                                            } as WorkflowStep);
                                                                                            setGroups(ng);
                                                                                        }}
                                                                                        className="w-full h-10 border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 rounded-lg transition-all group"
                                                                                    >
                                                                                        <Plus className="w-3.5 h-3.5 mr-2 text-muted-foreground group-hover:text-primary" />
                                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary">Append Execution Step</span>
                                                                                    </Button>
                                                                                </div>
                                                                            )}
                                                                        </Droppable>
                                                                    </div>
                                                                )}
                                                            </Draggable>
                                                        ))}
                                                        {provided.placeholder}
                                                        <div className="justify-center pt-4 flex">
                                                            <Button
                                                                onClick={handleAddGroup}
                                                                variant="outline"
                                                                className="h-12 px-8 rounded-xl bg-primary/5 hover:bg-primary/10 text-primary border-primary/20 font-bold uppercase tracking-widest text-[10px] transition-all"
                                                            >
                                                                <Plus className="w-4 h-4 mr-2" />
                                                                Extend Module Chain
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </Droppable>
                                        </DragDropContext>
                                    )}
                                </div>
                            ) : activeTab === 'files' ? (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                                    <WorkflowFilesTab
                                        workflowId={id as string}
                                        targetFolder={targetFolder}
                                        setTargetFolder={setTargetFolder}
                                        cleanupFiles={cleanupFiles}
                                        setCleanupFiles={setCleanupFiles}
                                    />
                                </div>
                            ) : activeTab === 'hooks' ? (
                                <div className="flex-1 overflow-y-auto p-8 bg-[#0a0b0e] animate-in fade-in slide-in-from-right-2 duration-300">
                                    <div className="max-w-4xl mx-auto space-y-12 pb-20">
                                        <div className="flex flex-col gap-2 border-b border-white/5 pb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                                    <Zap className="w-5 h-5 text-primary" />
                                                </div>
                                                <h2 className="text-2xl font-black tracking-tight text-white uppercase italic">Execution Hooks</h2>
                                            </div>
                                            <p className="text-xs font-medium text-muted-foreground opacity-60">Configure secondary workflows to trigger automatically during this pipeline's lifecycle.</p>
                                        </div>

                                        <div className="space-y-12">
                                            <HookManager
                                                hooks={hooks}
                                                workflows={allWorkflows}
                                                hookType="BEFORE"
                                                onChange={setHooks}
                                            />

                                            <div className="h-px bg-white/5 w-full" />

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                                <HookManager
                                                    hooks={hooks}
                                                    workflows={allWorkflows}
                                                    hookType="AFTER_SUCCESS"
                                                    onChange={setHooks}
                                                />
                                                <HookManager
                                                    hooks={hooks}
                                                    workflows={allWorkflows}
                                                    hookType="AFTER_FAILED"
                                                    onChange={setHooks}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : activeTab === 'history' ? (
                                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                                    <WorkflowHistory
                                        workflowId={id as string}
                                        onReRun={(wf, inputs) => runWorkflow({ ...wf, id: id as string }, inputs)}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Global Footer */}
                    <div className="px-6 py-3 bg-card border-t border-border flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Draft Phase: Local Persistence Active</span>
                            </div>
                        </div>
                        <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.2em]">
                            ANTIGRAVITY DESIGNER V2.1
                        </p>
                    </div>
                </div>
            )}
        </WorkflowRunner>
    );
};

export default WorkflowDesignerPage;
