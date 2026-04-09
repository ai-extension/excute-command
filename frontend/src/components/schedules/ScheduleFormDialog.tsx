import React, { useState } from 'react';
import { Clock, Zap, Plus, AlertCircle, Trash2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../ui/dialog";
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from "../ui/label";
import { Switch } from '../ui/switch';
import { CalendarDays } from 'lucide-react';
import { cn } from '../../lib/utils';
import { TagSelector } from '../TagSelector';
import HookManager from '../HookManager';
import { Tag, Workflow, WorkflowHook } from '../../types';

interface ScheduleFormDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    isEditing: boolean;
    isSubmitting: boolean;
    formData: any;
    setFormData: (data: any) => void;
    onSubmit: (e: React.FormEvent) => void;
    setIsPickerOpen: (open: boolean) => void;
}

export const ScheduleFormDialog: React.FC<ScheduleFormDialogProps> = ({
    isOpen,
    onOpenChange,
    isEditing,
    isSubmitting,
    formData,
    setFormData,
    onSubmit,
    setIsPickerOpen,
}) => {
    const [activeDialogTab, setActiveDialogTab] = useState<'config' | 'hooks'>('config');

    const removeWorkflowFromForm = (index: number) => {
        setFormData((prev: any) => ({
            ...prev,
            workflows: prev.workflows.filter((_: any, i: number) => i !== index)
        }));
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <span className="hidden" />
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] flex flex-col max-h-[90vh] overflow-hidden p-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-2xl font-black tracking-tight">
                        {isEditing ? 'Edit Automation' : 'Create Automation'}
                    </DialogTitle>
                    <div className="flex p-0.5 bg-muted/50 rounded-lg border border-border mt-4">
                        <button
                            type="button"
                            onClick={() => setActiveDialogTab('config')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                activeDialogTab === 'config' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Clock className="w-3 h-3" /> Configuration
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveDialogTab('hooks')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                activeDialogTab === 'hooks' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Zap className="w-3 h-3" /> Hooks
                        </button>
                    </div>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        {activeDialogTab === 'config' ? (
                            <>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Plan Name</Label>
                                    <Input
                                        placeholder="e.g. Daily Database Backup"
                                        className="h-10 bg-muted/30 border-border rounded-xl font-bold tracking-tight focus:bg-background transition-all"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Type</Label>
                                        <select
                                            className="w-full h-10 bg-muted/30 border border-border rounded-xl font-bold px-3 text-xs outline-none focus:bg-background transition-all"
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        >
                                            <option value="ONE_TIME">ONE-TIME</option>
                                            <option value="RECURRING">RECURRING</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        {formData.type === 'RECURRING' ? (
                                            <>
                                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Cron Expression</Label>
                                                <Input
                                                    placeholder="* * * * * *"
                                                    className="h-10 bg-muted/30 border-border rounded-xl font-bold font-mono text-xs"
                                                    value={formData.cron_expression}
                                                    onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                                                    required
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Next Run (ISO)</Label>
                                                <div className="relative group/datetime">
                                                    <style dangerouslySetInnerHTML={{
                                                        __html: `
                                                        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
                                                            position: absolute;
                                                            left: 0;
                                                            top: 0;
                                                            width: 100%;
                                                            height: 100%;
                                                            margin: 0;
                                                            padding: 0;
                                                            cursor: pointer;
                                                            opacity: 0;
                                                        }
                                                    `}} />
                                                    <Input
                                                        type="datetime-local"
                                                        className="h-12 bg-muted/30 border-border rounded-xl font-bold text-sm pl-10 pr-4 transition-all focus:bg-background cursor-pointer [color-scheme:dark]"
                                                        value={formData.next_run_at}
                                                        onChange={(e) => setFormData({ ...formData, next_run_at: e.target.value })}
                                                        required
                                                    />
                                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-primary/60 group-hover/datetime:text-primary group-focus-within/datetime:text-primary transition-colors">
                                                        <CalendarDays className="w-5 h-5 transition-transform group-hover/datetime:scale-110" />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Max Retries</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="5"
                                            className="h-10 bg-muted/30 border-border rounded-xl font-bold text-xs transition-all"
                                            value={formData.retries}
                                            onChange={(e) => setFormData({ ...formData, retries: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Initial Status</Label>
                                        <select
                                            className="w-full h-10 bg-muted/30 border border-border rounded-xl font-bold px-3 text-xs outline-none focus:bg-background transition-all"
                                            value={formData.status}
                                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        >
                                            <option value="ACTIVE">ACTIVE</option>
                                            <option value="PAUSED">PAUSED</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-xl">
                                    <div className="space-y-0.5">
                                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Catch-up</Label>
                                        <p className="text-[9px] text-muted-foreground font-medium ml-1">Run missed jobs if server was offline.</p>
                                    </div>
                                    <Switch
                                        checked={formData.catch_up}
                                        onCheckedChange={(checked) => setFormData({ ...formData, catch_up: checked })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Tags</Label>
                                    <TagSelector
                                        selectedTags={formData.tags}
                                        onChange={(tags) => setFormData({ ...formData, tags })}
                                    />
                                </div>
                                <p className="text-[9px] text-muted-foreground font-medium px-1 italic">Retries occur every 10 seconds upon workflow failure.</p>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Workflows to Execute</Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setIsPickerOpen(true)}
                                            className="h-8 text-[9px] font-black uppercase tracking-widest rounded-lg border-primary/20 bg-primary/5 text-primary"
                                        >
                                            <Plus className="w-3 h-3 mr-1" /> Add Workflow
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        {formData.workflows.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-8 bg-muted/20 border border-dashed border-border rounded-xl">
                                                <AlertCircle className="w-6 h-6 text-muted-foreground/20 mb-2" />
                                                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">No workflows selected</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 text-slate-200">
                                                {formData.workflows.map((wf: any, idx: number) => (
                                                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-xl group transition-all">
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2">
                                                                <Zap className="w-3 h-3 text-primary" />
                                                                <span className="text-[11px] font-black uppercase tracking-tight">{wf.name}</span>
                                                            </div>
                                                            {wf.inputs !== "{}" && (
                                                                <p className="text-[9px] font-medium text-muted-foreground truncate max-w-[200px]">
                                                                    Inputs: {wf.inputs}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            type="button"
                                                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => removeWorkflowFromForm(idx)}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-8">
                                <HookManager
                                    hooks={formData.hooks}
                                    hookType="BEFORE"
                                    onChange={(hooks) => setFormData({ ...formData, hooks })}
                                />
                                <div className="h-px bg-border/40 w-full" />
                                <HookManager
                                    hooks={formData.hooks}
                                    hookType="AFTER_SUCCESS"
                                    onChange={(hooks) => setFormData({ ...formData, hooks })}
                                />
                                <div className="h-px bg-border/40 w-full" />
                                <HookManager
                                    hooks={formData.hooks}
                                    hookType="AFTER_FAILED"
                                    onChange={(hooks) => setFormData({ ...formData, hooks })}
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter className="p-6 pt-2 border-t bg-muted/20">
                        <Button
                            type="submit"
                            disabled={isSubmitting || formData.workflows.length === 0}
                            className="premium-gradient font-black uppercase tracking-widest text-[10px] w-full shadow-premium rounded-xl"
                        >
                            {isSubmitting ? "Syncing..." : isEditing ? "Save Changes" : "Schedule Automation"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog >
    );
};
