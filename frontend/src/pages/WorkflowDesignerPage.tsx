import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Zap,
    File,
    ChevronLeft,
    Layout,
    Database,
    History,
    Play,
    Save,
    Clock,
    Settings as SettingsIcon
} from 'lucide-react';
import { DropResult } from '@hello-pangea/dnd';

import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { APP_VERSION } from '../config/version';

import {
    Workflow,
    Tag,
    Server as ServerType,
    WorkflowInput,
    WorkflowVariable,
    WorkflowGroup,
    WorkflowHook
} from '../types';

import { WorkflowRunner } from '../components/WorkflowRunner';
import { WorkflowFilesTab } from '../components/WorkflowFilesTab';
import HookManager from '../components/HookManager';
import WorkflowHistory from '../components/WorkflowHistory';
import { GeneralSettingsTab } from '../components/workflow-designer/GeneralSettingsTab';
import { VariablesTab } from '../components/workflow-designer/VariablesTab';
import { StepsBuilderTab } from '../components/workflow-designer/StepsBuilderTab';

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
    const [timeoutMinutes, setTimeoutMinutes] = useState<number>(15);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openSettingsGroupIdx, setOpenSettingsGroupIdx] = useState<number | null>(null);
    const [isTemplate, setIsTemplate] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const copyToClipboard = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const handleSearchWorkflows = async (query: string) => {
        if (!activeNamespace) return;
        try {
            const url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=50&search=${encodeURIComponent(query)}`;
            const response = await apiFetch(url);
            if (!response.ok) throw new Error(`Search failed: ${response.status}`);
            const data = await response.json();
            const items = data.items || (Array.isArray(data) ? data : []);

            setAllWorkflows(prev => {
                const existing = new Map(prev.map(w => [w.id, w]));
                items.forEach((w: Workflow) => {
                    if (w.id !== id) { // Don't include the current workflow
                        existing.set(w.id, w);
                    }
                });
                return Array.from(existing.values());
            });
        } catch (error) {
            console.error('Failed to search workflows:', error);
        }
    };

    const handleSearchServers = async (query: string) => {
        try {
            const url = `${API_BASE_URL}/servers?limit=50&search=${encodeURIComponent(query)}`;
            const response = await apiFetch(url);
            if (!response.ok) throw new Error(`Search failed: ${response.status}`);
            const data = await response.json();
            const items = data.items || (Array.isArray(data) ? data : []);

            setAvailableServers(prev => {
                // Preserve all current servers that are already in the list
                // This ensures that selected items' labels don't flicker or disappear
                const existing = new Map(prev.map(s => [s.id, s]));
                items.forEach((s: ServerType) => existing.set(s.id, s));
                return Array.from(existing.values());
            });
        } catch (error) {
            console.error('Failed to search servers:', error);
        }
    };

    useEffect(() => {
        const fetchServers = async (query?: string) => {
            try {
                let url = `${API_BASE_URL}/servers?limit=20`;
                if (query) url += `&search=${encodeURIComponent(query)}`;
                const response = await apiFetch(url);
                if (!response.ok) throw new Error(`Servers fetch failed: ${response.status}`);
                const data = await response.json();
                const items = data.items || (Array.isArray(data) ? data : []);

                setAvailableServers(prev => {
                    const existing = new Map(prev.map(s => [s.id, s]));
                    items.forEach((s: ServerType) => existing.set(s.id, s));
                    return Array.from(existing.values());
                });
            } catch (error) {
                console.error('Failed to fetch servers:', error);
            }
        };

        const fetchAllWorkflows = async () => {
            if (!activeNamespace) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=20`);
                if (!response.ok) throw new Error(`Workflows fetch failed: ${response.status}`);
                const data = await response.json();
                setAllWorkflows(data.items || (Array.isArray(data) ? data : []));
            } catch (error) {
                console.error('Failed to fetch all workflows:', error);
            }
        };

        const fetchWorkflow = async () => {
            if (!id) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError(null);
            try {
                const response = await apiFetch(`${API_BASE_URL}/workflows/${id}`);
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || `Workflow fetch failed: ${response.status}`);
                }
                const data = await response.json();
                setName(data.name);
                setDescription(data.description);
                const defaultServerIdVal = data.default_server_id || '';
                setDefaultServerId(defaultServerIdVal || undefined);
                setTargetFolder(data.target_folder || '');
                setCleanupFiles(!!data.cleanup_files);
                setTimeoutMinutes(data.timeout_minutes || 15);
                setTags(data.tags || []);
                setIsTemplate(!!data.is_template);

                const cleanGroups = (data.groups || []).map((g: any) => {
                    const cleanedGroup = { ...g };
                    if (cleanedGroup.steps) {
                        cleanedGroup.steps = cleanedGroup.steps.map((s: any) => {
                            const cleanedStep = { ...s };
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
                setError(error instanceof Error ? error.message : 'Failed to retrieve blueprint data');
            } finally {
                setIsLoading(false);
            }
        };

        fetchServers();
        fetchAllWorkflows();
        if (id) fetchWorkflow();
        else setIsLoading(false);
    }, [id, activeNamespace, apiFetch]);

    const handleSave = async () => {
        if (!activeNamespace) {
            console.error('No active namespace');
            return;
        }
        if (!name.trim()) return;

        if (!defaultServerId) {
            setError('Please select a default target resource for the workflow.');
            setActiveTab('general');
            return;
        }

        setIsSaving(true);
        try {
            const wfData = {
                name,
                description,
                status: 'PENDING',
                default_server_id: defaultServerId || undefined,
                target_folder: targetFolder,
                cleanup_files: cleanupFiles,
                timeout_minutes: timeoutMinutes,
                is_template: isTemplate,
                namespace_id: activeNamespace.id,
                tags,
                inputs: inputs.filter(i => i.key?.trim()),
                variables: variables.filter(v => v.key?.trim()),
                groups: groups.map((g, gIdx) => ({
                    ...g,
                    default_server_id: g.default_server_id || undefined,
                    copy_target_server_id: g.copy_target_server_id || undefined,
                    order: gIdx,
                    steps: g.steps?.map((s, sIdx) => {
                        const cleanedStep = {
                            ...s,
                            order: sIdx,
                            server_id: s.server_id || undefined
                        };
                        if (cleanedStep.action_type === 'WORKFLOW' && typeof cleanedStep.target_workflow_inputs === 'object' && cleanedStep.target_workflow_inputs) {
                            cleanedStep.target_workflow_inputs = JSON.stringify(cleanedStep.target_workflow_inputs);
                        }
                        return cleanedStep;
                    })
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

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Save failed: ${response.status}`);
            }

            navigate('/workflows');
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
            continue_on_failure: false,
            steps: []
        } as any]);
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
            newGroups.forEach((g, idx) => { (g as any).order = idx; });
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
                    {/* Loading/Error States */}
                    {isLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-background">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
                                <Zap className="w-6 h-6 text-primary" />
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground animate-pulse">Syncing Blueprint Architect...</p>
                        </div>
                    ) : error ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-background p-8 text-center">
                            <div className="w-16 h-16 rounded-3xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                                <File className="w-8 h-8 text-destructive" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-sm font-black uppercase tracking-widest text-destructive">Blueprint Access Denied</h3>
                                <p className="text-[11px] font-medium text-muted-foreground max-w-sm mx-auto uppercase tracking-tighter opacity-70">
                                    {error}
                                </p>
                            </div>
                            <Button
                                onClick={() => window.location.reload()}
                                variant="outline"
                                className="px-8 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-black uppercase tracking-widest text-[9px]"
                            >
                                Retry Handshake
                            </Button>
                        </div>
                    ) : (
                        <>
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
                                        <GeneralSettingsTab
                                            name={name}
                                            setName={setName}
                                            description={description}
                                            setDescription={setDescription}
                                            timeoutMinutes={timeoutMinutes}
                                            setTimeoutMinutes={setTimeoutMinutes}
                                            tags={tags}
                                            setTags={setTags}
                                            availableServers={availableServers}
                                            defaultServerId={defaultServerId}
                                            setDefaultServerId={setDefaultServerId}
                                            handleSearchServers={handleSearchServers}
                                            isTemplate={isTemplate}
                                            setIsTemplate={setIsTemplate}
                                        />
                                    ) : activeTab === 'variables' ? (
                                        <VariablesTab
                                            inputs={inputs}
                                            setInputs={setInputs}
                                            variables={variables}
                                            setVariables={setVariables}
                                            copyToClipboard={copyToClipboard}
                                            copiedKey={copiedKey}
                                        />
                                    ) : activeTab === 'steps' ? (
                                        <StepsBuilderTab
                                            groups={groups}
                                            setGroups={setGroups}
                                            availableServers={availableServers}
                                            allWorkflows={allWorkflows}
                                            handleDragEnd={handleDragEnd}
                                            handleAddGroup={handleAddGroup}
                                            handleSearchServers={handleSearchServers}
                                            handleSearchWorkflows={handleSearchWorkflows}
                                            id={id}
                                        />
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
                                        <div className="flex-1 overflow-y-auto p-8 bg-background animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="max-w-4xl mx-auto space-y-12 pb-20">
                                                <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                                            <Zap className="w-5 h-5 text-primary" />
                                                        </div>
                                                        <h2 className="text-2xl font-black tracking-tight text-foreground uppercase italic">Execution Hooks</h2>
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
                                                onReRun={(wf, inputs, gId, sId, execId) => runWorkflow({ ...wf, id: id as string }, inputs, gId, sId, execId)}
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
                                    CSM APP DESIGNER {APP_VERSION.split('-')[0]}
                                </p>
                            </div>
                        </>
                    )
                    }
                </div >
            )
            }
        </WorkflowRunner >
    );
};

export default WorkflowDesignerPage;
