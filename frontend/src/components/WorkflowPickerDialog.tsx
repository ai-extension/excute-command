import React from 'react';
import { Search, Zap, Plus } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Workflow } from '../types';

interface WorkflowPickerDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    workflows: Workflow[];
    onSelect: (workflowId: string, inputs: string) => void;
}

export const WorkflowPickerDialog: React.FC<WorkflowPickerDialogProps> = ({
    isOpen,
    onOpenChange,
    workflows,
    onSelect
}) => {
    const [search, setSearch] = React.useState('');

    const filteredWorkflows = workflows.filter(w =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.description?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] bg-card border-border rounded-2xl shadow-premium p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b border-border/50">
                    <DialogTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        Select Workflow to Schedule
                    </DialogTitle>
                </DialogHeader>
                <div className="p-4 border-b border-border/30 bg-muted/20">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <Input
                            placeholder="Search workflows..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10 h-10 rounded-xl bg-background border-border/50 text-xs font-bold"
                        />
                    </div>
                </div>
                <div className="h-[350px] overflow-y-auto custom-scrollbar">
                    <div className="p-2 space-y-1">
                        {filteredWorkflows.map((workflow) => (
                            <div
                                key={workflow.id}
                                className="group flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 cursor-pointer transition-all border border-transparent hover:border-border/50"
                                onClick={() => onSelect(workflow.id, typeof workflow.inputs === 'string' ? workflow.inputs : JSON.stringify(workflow.inputs || []))}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-transform">
                                        <Zap className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-tight">{workflow.name}</p>
                                        <p className="text-[10px] text-muted-foreground font-medium line-clamp-1">
                                            {workflow.description || 'No description provided'}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="p-4 bg-muted/10 border-t border-border/50 text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">
                        Select a template to initialize scheduling
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
};
