import React, { useState } from 'react';
import { WorkflowInput } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Zap, Settings2 } from 'lucide-react';

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
            if (input.type === 'select') {
                // For select, we default to null/empty string as requested
                initial[input.key] = '';
            } else {
                initial[input.key] = input.default_value || '';
            }
        });
        return initial;
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};
        const safeRegex = /^[a-zA-Z0-9_\-\.\ \/]*$/;

        inputs.forEach(input => {
            const val = values[input.key];

            if (input.type === 'select') {
                const options = (input.default_value || '').split(',').map(o => o.trim()).filter(Boolean);
                if (!val) {
                    newErrors[input.key] = 'Please select an option';
                } else if (!options.includes(val)) {
                    newErrors[input.key] = 'Invalid option';
                }
            } else if (val) {
                if (input.type === 'number') {
                    if (isNaN(Number(val))) {
                        newErrors[input.key] = 'Must be a number';
                    }
                } else {
                    if (!safeRegex.test(val)) {
                        newErrors[input.key] = 'Invalid characters. Allowed: A-Z, 0-9, _, -, ., / and Space';
                    }
                }
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            onConfirm(values);
        }
    };

    const hasErrors = Object.keys(errors).length > 0;

    return (
        <div className="flex flex-col bg-[#0a0b0e] text-slate-200 min-h-[400px]">
            <DialogHeader className="p-6 border-b border-border/10 bg-gradient-to-r from-indigo-500/10 to-transparent flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
                        <Settings2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">Runtime Parameters</DialogTitle>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">Define variable values for this execution session</p>
                    </div>
                </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[60vh]">
                {inputs.map((input) => (
                    <div key={input.id} className="space-y-2 group">
                        <div className="flex items-center justify-between">
                            <label className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${errors[input.key] ? 'text-destructive' : 'text-indigo-400 group-hover:text-indigo-300'}`}>
                                {input.label || input.key}
                            </label>
                            <div className="flex items-center gap-2">
                                {errors[input.key] && (
                                    <span className="text-[9px] font-bold text-destructive animate-pulse">{errors[input.key]}</span>
                                )}
                                <span className="text-[8px] font-mono text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50">
                                    {"{{"}{input.key}{"}}"}
                                </span>
                            </div>
                        </div>
                        <div className="relative">
                            {input.type === 'select' ? (
                                <div className="relative">
                                    <select
                                        value={values[input.key]}
                                        onChange={(e) => {
                                            const nv = { ...values, [input.key]: e.target.value };
                                            setValues(nv);
                                            if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                        }}
                                        className={`h-11 w-full pl-4 pr-10 bg-[#161821] border focus:border-indigo-500/50 text-xs font-semibold rounded-xl text-slate-200 appearance-none outline-none cursor-pointer hover:border-slate-700 transition-colors ${errors[input.key] ? 'border-destructive' : 'border-slate-800'}`}
                                    >
                                        <option value="" disabled className="text-slate-500">Select an option...</option>
                                        {(input.default_value || '').split(',').map((opt) => opt.trim()).filter(Boolean).map((opt) => (
                                            <option key={opt} value={opt} className="bg-[#161821] text-white">{opt}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                </div>
                            ) : (
                                <Input
                                    type={input.type === 'number' ? 'number' : 'text'}
                                    value={values[input.key]}
                                    onChange={(e) => {
                                        const nv = { ...values, [input.key]: e.target.value };
                                        setValues(nv);
                                        if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                    }}
                                    className={`h-11 px-4 bg-[#161821] focus:border-indigo-500/50 focus:ring-indigo-500/20 text-xs font-semibold rounded-xl ${errors[input.key] ? 'border-destructive' : 'border-slate-800'}`}
                                    placeholder={`Enter value for ${input.label || input.key}...`}
                                    autoFocus
                                />
                            )}
                        </div>
                    </div>
                ))}
            </form>

            <DialogFooter className="p-6 border-t border-border/10 bg-[#0c0e14] flex-shrink-0">
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
