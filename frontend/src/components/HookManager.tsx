import React, { useState } from 'react';
import { Workflow, WorkflowHook, HookType, WorkflowInput } from '../types';
import { Button } from './ui/button';
import { Plus, Trash2, Zap, Search } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Input } from './ui/input';
import WorkflowInputDialog from './WorkflowInputDialog';

interface HookManagerProps {
    hooks: WorkflowHook[];
    workflows: Workflow[];
    hookType: HookType;
    onChange: (hooks: WorkflowHook[]) => void;
}

const HookManager: React.FC<HookManagerProps> = ({ hooks, workflows, hookType, onChange }) => {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isInputDialogOpen, setIsInputDialogOpen] = useState(false);
    const [pendingWorkflow, setPendingWorkflow] = useState<Workflow | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredHooks = (hooks || []).filter(h => h.hook_type === hookType);

    const handleAddHook = (wf: Workflow) => {
        if (wf.inputs && wf.inputs.length > 0) {
            setPendingWorkflow(wf);
            setIsInputDialogOpen(true);
        } else {
            const newHook: WorkflowHook = {
                id: crypto.randomUUID(),
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
                id: crypto.randomUUID(),
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
        const wf = workflows.find(w => w.id === hook.target_workflow_id);
        return wf ? wf.name : 'Unknown Workflow';
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
                                    <span className="text-[11px] font-black uppercase tracking-tight text-white">{getDisplayName(hook)}</span>
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
                        <DialogTitle className="text-xl font-black uppercase tracking-tight text-white">Select Hook Workflow</DialogTitle>
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
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                            {workflows
                                .filter(wf => wf.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map(wf => (
                                    <div
                                        key={wf.id}
                                        className="flex items-center justify-between p-4 bg-muted/20 hover:bg-muted/40 border border-border rounded-2xl cursor-pointer transition-all group"
                                        onClick={() => handleAddHook(wf)}
                                    >
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold text-sm tracking-tight text-white">{wf.name}</span>
                                            <span className="text-[9px] opacity-40 uppercase font-black tracking-widest">{wf.inputs?.length || 0} inputs required</span>
                                        </div>
                                        <Plus className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isInputDialogOpen} onOpenChange={(open) => {
                setIsInputDialogOpen(open);
                if (!open) setPendingWorkflow(null);
            }}>
                <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-slate-950 border-white/10 rounded-2xl shadow-2xl">
                    {pendingWorkflow && (
                        <>
                            <DialogHeader className="p-6 border-b border-white/5 bg-slate-900/40">
                                <DialogTitle className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                        <Zap className="w-4 h-4 text-indigo-400" />
                                    </div>
                                    Hook Config: {pendingWorkflow.name}
                                </DialogTitle>
                            </DialogHeader>
                            <WorkflowInputDialog
                                inputs={pendingWorkflow.inputs as WorkflowInput[]}
                                onConfirm={handleConfirmInputs}
                                onCancel={() => {
                                    setIsInputDialogOpen(false);
                                    setPendingWorkflow(null);
                                }}
                            />
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default HookManager;
