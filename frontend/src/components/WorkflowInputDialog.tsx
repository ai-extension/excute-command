import React, { useState } from 'react';
import { WorkflowInput } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Zap, Terminal, Command } from 'lucide-react';

interface WorkflowInputDialogProps {
    inputs: WorkflowInput[];
    onConfirm: (values: Record<string, string>) => void;
    onCancel: () => void;
    isStarting?: boolean;
}

const WorkflowInputDialog: React.FC<WorkflowInputDialogProps> = ({
    inputs,
    onConfirm,
    onCancel,
    isStarting = false
}) => {
    const [values, setValues] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        inputs.forEach(input => {
            initial[input.key] = input.default_value || '';
        });
        return initial;
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(values);
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0b0e] text-slate-200">
            <DialogHeader className="p-6 border-b border-border/10 bg-gradient-to-r from-indigo-500/10 to-transparent">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
                        <Command className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">Runtime Parameters</DialogTitle>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">Define variable values for this execution session</p>
                    </div>
                </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                {inputs.map((input) => (
                    <div key={input.id} className="space-y-2 group">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 group-hover:text-indigo-300 transition-colors">
                                {input.label || input.key}
                            </label>
                            <span className="text-[8px] font-mono text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50">
                                {"{{"}{input.key}{"}}"}
                            </span>
                        </div>
                        <div className="relative">
                            <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <Input
                                value={values[input.key]}
                                onChange={(e) => setValues({ ...values, [input.key]: e.target.value })}
                                className="h-11 pl-10 bg-[#161821] border-slate-800 focus:border-indigo-500/50 focus:ring-indigo-500/20 text-xs font-semibold rounded-xl"
                                placeholder={`Enter value for ${input.label || input.key}...`}
                                autoFocus
                            />
                        </div>
                    </div>
                ))}
            </form>

            <DialogFooter className="p-6 border-t border-border/10 bg-[#0c0e14]">
                <div className="flex w-full gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onCancel}
                        className="flex-1 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-900/50 hover:bg-slate-800"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isStarting}
                        onClick={handleSubmit}
                        className="flex-[2] h-11 rounded-xl premium-gradient text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-premium hover:shadow-indigo-500/25 transition-all gap-2"
                    >
                        {isStarting ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        ) : (
                            <Zap className="w-3.5 h-3.5" />
                        )}
                        Initialize Pipeline
                    </Button>
                </div>
            </DialogFooter>
        </div>
    );
};

export default WorkflowInputDialog;
