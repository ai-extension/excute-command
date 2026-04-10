import React, { useState, useEffect } from 'react';
import { Workflow, WorkflowHook, HookType, WorkflowInput } from '../types';
import { Button } from './ui/button';
import { Plus, Trash2, Zap, Search, Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Input } from './ui/input';
import WorkflowInputDialog from './WorkflowInputDialog';
import { generateUUID } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';

interface HookManagerProps {
    hooks: WorkflowHook[];
    workflows?: Workflow[];
    hookType: HookType;
    onChange: (hooks: WorkflowHook[]) => void;
}

const HookManager: React.FC<HookManagerProps> = ({ hooks, workflows, hookType, onChange }) => {
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isInputDialogOpen, setIsInputDialogOpen] = useState(false);
    const [pendingWorkflow, setPendingWorkflow] = useState<Workflow | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [fetchedWorkflows, setFetchedWorkflows] = useState<Workflow[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const activeWorkflows = workflows || fetchedWorkflows;

    useEffect(() => {
        if (workflows) return; // parent provided it
        if (!isPickerOpen || !activeNamespace) return;

        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=15&search=${encodeURIComponent(searchTerm)}`);
                const data = await response.json();
                setFetchedWorkflows(data.items || []);
            } catch (err) {
                console.error('Failed to fetch workflows:', err);
                setFetchedWorkflows([]);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, isPickerOpen, activeNamespace, apiFetch, workflows]);

    const filteredHooks = (hooks || []).filter(h => h.hook_type === hookType);

    const handleAddHook = (wf: Workflow) => {
        if (wf.inputs && wf.inputs.length > 0) {
            setPendingWorkflow(wf);
            setIsInputDialogOpen(true);
        } else {
            const newHook: WorkflowHook = {
                id: generateUUID(),
                target_workflow_id: wf.id,
                hook_type: hookType,
                inputs: '{}',
                order: filteredHooks.length,
                target_workflow: wf
            };
            onChange([...(hooks || []), newHook]);
            setIsPickerOpen(false);
        }
    };

    const handleConfirmInputs = (values: Record<string, string>) => {
        if (pendingWorkflow) {
            const newHook: WorkflowHook = {
                id: generateUUID(),
                target_workflow_id: pendingWorkflow.id,
                hook_type: hookType,
                inputs: JSON.stringify(values),
                order: filteredHooks.length,
                target_workflow: pendingWorkflow
            };
            onChange([...(hooks || []), newHook]);
            setPendingWorkflow(null);
            setIsInputDialogOpen(false);
            setIsPickerOpen(false);
        }
    };

    const handleRemoveHook = (id: string) => {
        onChange((hooks || []).filter(h => h.id !== id));
    };

    const getDisplayName = (hook: WorkflowHook) => {
        if (hook.target_workflow) return hook.target_workflow.name;
        if (workflows) {
            const wf = workflows.find(w => w.id === hook.target_workflow_id);
            if (wf) return wf.name;
        }
        return 'Unknown Workflow';
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                    {hookType.replace(/_/g, ' ')} HOOKS
                </h3>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setSearchTerm('');
                        setIsPickerOpen(true);
                    }}
                    className="h-8 text-[9px] font-black uppercase tracking-widest rounded-lg border-primary/20 bg-primary/5 text-primary"
                >
                    <Plus className="w-3 h-3 mr-1" /> Add Hook
                </Button>
            </div>

            <div className="space-y-2">
                {filteredHooks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 bg-muted/10 border border-dashed border-border rounded-xl">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">No {hookType.toLowerCase().replace(/_/g, ' ')} hooks configured</p>
                    </div>
                ) : (
                    filteredHooks.sort((a, b) => a.order - b.order).map((hook) => (
                        <div key={hook.id} className="flex items-center justify-between p-3 bg-muted/20 border border-border rounded-xl group transition-all">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-3 h-3 text-primary" />
                                    <span className="text-[11px] font-black uppercase tracking-tight text-foreground">{getDisplayName(hook)}</span>
                                </div>
                                {hook.inputs !== "{}" && (
                                    <p className="text-[9px] font-medium text-muted-foreground truncate max-w-[250px]">
                                        Inputs: {hook.inputs}
                                    </p>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveHook(hook.id)}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    ))
                )}
            </div>

            <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">Select Hook Workflow</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search workflows..."
                                className="pl-10 h-10 rounded-xl bg-muted/30"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                            {isLoading && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {activeWorkflows.length === 0 && !isLoading ? (
                                <div className="text-center py-4">
                                    <p className="text-xs font-bold text-muted-foreground uppercase opacity-60 tracking-widest">No workflows found</p>
                                </div>
                            ) : (
                                activeWorkflows
                                    .filter(wf => workflows ? wf.name.toLowerCase().includes(searchTerm.toLowerCase()) : true) // only local filter if parent provided
                                    .map(wf => (
                                        <div
                                            key={wf.id}
                                            className="flex items-center justify-between p-4 bg-muted/20 hover:bg-muted/40 border border-border rounded-2xl cursor-pointer transition-all group"
                                            onClick={() => handleAddHook(wf)}
                                        >
                                            <div className="flex flex-col gap-1">
                                                <span className="font-bold text-sm tracking-tight text-foreground">{wf.name}</span>
                                                <span className="text-[9px] text-muted-foreground/60 uppercase font-black tracking-widest">{wf.inputs?.length || 0} inputs required</span>
                                            </div>
                                            <Plus className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    ))
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <WorkflowInputDialog
                isOpen={isInputDialogOpen}
                onOpenChange={(open) => {
                    setIsInputDialogOpen(open);
                    if (!open) setPendingWorkflow(null);
                }}
                inputs={pendingWorkflow?.inputs as WorkflowInput[] || []}
                onConfirm={handleConfirmInputs}
                onCancel={() => {
                    setIsInputDialogOpen(false);
                    setPendingWorkflow(null);
                }}
            />
        </div>
    );
};

export default HookManager;
