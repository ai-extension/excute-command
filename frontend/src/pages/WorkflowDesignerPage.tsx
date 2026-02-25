import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Zap, Save, ChevronLeft, Layout,
    Settings as SettingsIcon, Layers, Server,
    Plus, Terminal, Trash2, Clock, History
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { Workflow, WorkflowGroup, WorkflowStep, WorkflowInput, Server as ServerType } from '../types';
import WorkflowHistory from '../components/WorkflowHistory';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';

const WorkflowDesignerPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeNamespace } = useNamespace();
    const { token } = useAuth();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [inputs, setInputs] = useState<Partial<WorkflowInput>[]>([]);
    const [groups, setGroups] = useState<Partial<WorkflowGroup>[]>([]);
    const [availableServers, setAvailableServers] = useState<ServerType[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'inputs' | 'blueprint' | 'history'>('general');
    const [defaultServerId, setDefaultServerId] = useState<string | undefined>(undefined);

    useEffect(() => {
        const fetchServers = async () => {
            if (!token) return;
            try {
                const response = await fetch(`${API_BASE_URL}/servers`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                setAvailableServers(data || []);
            } catch (error) {
                console.error('Failed to fetch servers:', error);
            }
        };

        const fetchWorkflow = async () => {
            if (!token || !id) return;
            try {
                const response = await fetch(`${API_BASE_URL}/workflows/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                setName(data.name);
                setDescription(data.description);
                setDefaultServerId(data.default_server_id);
                setGroups(data.groups || []);
                setInputs(data.inputs || []);
            } catch (error) {
                console.error('Failed to fetch workflow:', error);
            }
        };

        fetchServers();
        if (id) fetchWorkflow();
    }, [token, id]);

    const handleSave = async () => {
        if (!token) return;
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
                default_server_id: defaultServerId,
                namespace_id: activeNamespace.id,
                inputs: inputs.filter(i => i.key?.trim()),
                groups: groups.map((g, gIdx) => ({
                    ...g,
                    order: gIdx,
                    steps: g.steps?.map((s, sIdx) => ({
                        ...s,
                        order: sIdx,
                        server_id: s.server_id || undefined
                    }))
                }))
            };

            const method = id ? 'PUT' : 'POST';
            const url = id
                ? `${API_BASE_URL}/workflows/${id}`
                : `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows`;

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
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
        setGroups([...groups, {
            name: `Group ${groups.length + 1}`,
            order: groups.length,
            is_parallel: false,
            steps: []
        }]);
        setActiveTab('blueprint');
    };

    return (
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
                            onClick={() => setActiveTab('inputs')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                activeTab === 'inputs' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Terminal className="w-3 h-3" /> Inputs
                        </button>
                        <button
                            onClick={() => setActiveTab('blueprint')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                activeTab === 'blueprint' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Layout className="w-3 h-3" /> Blueprint
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
                    ) : activeTab === 'inputs' ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
                                        <Terminal className="w-4 h-4" />
                                    </div>
                                    <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Runtime Variable Definitions</h2>
                                </div>
                                <Button
                                    onClick={() => setInputs([...inputs, { key: '', label: '', default_value: '' }])}
                                    className="h-8 text-[9px] font-bold uppercase tracking-widest px-4"
                                    variant="outline"
                                >
                                    <Plus className="w-3 h-3 mr-2" /> Add Variable
                                </Button>
                            </div>

                            <div className="bg-card rounded-xl border border-border p-6 shadow-sm overflow-hidden">
                                {inputs.length === 0 ? (
                                    <div className="py-12 text-center opacity-30 select-none">
                                        <Terminal className="w-12 h-12 mx-auto mb-4" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest">No runtime variables defined</p>
                                        <p className="text-[9px] mt-1 font-medium italic">Use variables in your commands via {"{{variable_name}}"}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {inputs.map((input, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-4 p-4 bg-background/50 rounded-lg border border-border/50 animate-in fade-in slide-in-from-bottom-1 duration-300">
                                                <div className="col-span-3 space-y-1.5">
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
                                                <div className="col-span-4 space-y-1.5">
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
                                                <div className="col-span-4 space-y-1.5">
                                                    <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Default Value</label>
                                                    <Input
                                                        value={input.default_value}
                                                        onChange={(e) => {
                                                            const ni = [...inputs];
                                                            ni[idx].default_value = e.target.value;
                                                            setInputs(ni);
                                                        }}
                                                        placeholder="v20.10.0"
                                                        className="h-8 text-[11px] border-border bg-background"
                                                    />
                                                </div>
                                                <div className="col-span-1 flex items-end justify-end pb-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                                                        onClick={() => {
                                                            const ni = inputs.filter((_, i) => i !== idx);
                                                            setInputs(ni);
                                                        }}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 flex items-start gap-3">
                                <div className="p-1 rounded-full bg-primary/20 text-primary shrink-0 mt-0.5">
                                    <Zap className="w-3 h-3" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-bold text-primary uppercase tracking-tight">Pro-tip: Dynamic Orchestration</p>
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Define variables here to reuse them in your commands using the <code className="bg-primary/10 px-1 rounded text-primary">{"{{key}}"}</code> syntax.
                                        When this workflow runs, a prompt will appear for values.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'blueprint' ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                            {groups.length === 0 ? (
                                <div className="h-64 flex flex-col items-center justify-center gap-4 opacity-50 border-2 border-dashed border-border rounded-2xl bg-card">
                                    <Layers className="w-12 h-12 text-muted-foreground" />
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Blueprint is currently empty</p>
                                    <Button onClick={handleAddGroup} variant="outline" className="rounded-full px-6">Initialize Architecture</Button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {groups.map((group, gIdx) => (
                                        <div key={gIdx} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                                            <div className="px-6 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                                                        <Layers className="w-4 h-4 text-primary" />
                                                    </div>
                                                    <Input
                                                        value={group.name}
                                                        onChange={(e) => {
                                                            const ng = [...groups];
                                                            ng[gIdx].name = e.target.value;
                                                            setGroups(ng);
                                                        }}
                                                        className="bg-transparent border-0 h-6 p-0 text-sm font-bold tracking-tight focus-visible:ring-0 min-w-[200px]"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
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

                                            <div className="p-4 md:p-6 space-y-3">
                                                {group.steps?.map((step, sIdx) => (
                                                    <div key={sIdx} className="flex items-center gap-4 p-4 bg-background/50 rounded-lg border border-border/50 group/step transition-all hover:bg-background">
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
                                                ))}

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
                                        </div>
                                    ))}

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
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                            <WorkflowHistory workflowId={id as string} token={token} />
                        </div>
                    )}
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
    );
};

export default WorkflowDesignerPage;
