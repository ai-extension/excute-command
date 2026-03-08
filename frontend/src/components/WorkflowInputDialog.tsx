import React, { useState, useEffect } from 'react';
import { WorkflowInput } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogFooter } from './ui/dialog';
import { Zap } from 'lucide-react';

interface WorkflowInputDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    inputs: WorkflowInput[];
    onConfirm: (values: Record<string, string>) => void;
    onCancel: () => void;
    isStarting?: boolean;
    confirmLabel?: string;
}

const WorkflowInputDialog: React.FC<WorkflowInputDialogProps> = ({
    isOpen,
    onOpenChange,
    inputs,
    onConfirm,
    onCancel,
    isStarting = false,
    confirmLabel = "Initialize Pipeline"
}) => {
    const [values, setValues] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen) {
            const initial: Record<string, string> = {};
            inputs.forEach(input => {
                if (input.type === 'select') {
                    initial[input.key] = '';
                } else {
                    // Ensure default value is a string, handle cases where it might be undefined
                    initial[input.key] = input.default_value !== undefined ? String(input.default_value) : '';
                }
            });
            setValues(initial);
            setErrors({});
        }
    }, [isOpen, inputs]);

    const validate = () => {
        const newErrors: Record<string, string> = {};
        const safeRegex = /^[a-zA-Z0-9_\-\.\ \/\{\}]*$/;

        inputs.forEach(input => {
            const val = values[input.key];
            const isValueEmpty = val === undefined || val === null || String(val).trim() === '';

            if (input.type === 'select') {
                const options = (input.default_value || '').split(',').map(o => o.trim()).filter(Boolean);
                if (isValueEmpty) {
                    newErrors[input.key] = 'Please select an option';
                } else if (!isValueEmpty && !options.includes(val)) {
                    newErrors[input.key] = 'Invalid option';
                }
            } else {
                if (isValueEmpty) {
                    newErrors[input.key] = 'This field is required';
                } else if (!isValueEmpty) {
                    if (input.type === 'number') {
                        if (isNaN(Number(val))) {
                            newErrors[input.key] = 'Must be a number';
                        }
                    } else {
                        if (!safeRegex.test(val)) {
                            newErrors[input.key] = 'Invalid characters. Allowed: A-Z, 0-9, _, -, ., /, {, } and Space';
                        }
                    }
                }
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (validate()) {
            onConfirm(values);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="max-w-lg w-[95vw] bg-popover border-border border-2 rounded-2xl p-0 overflow-hidden shadow-2xl flex flex-col">
                <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    {inputs.map((input) => (
                        <div key={input.id} className="space-y-2 group">
                            <div className="flex items-center justify-between">
                                <label className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${errors[input.key] ? 'text-destructive' : 'text-primary/70 group-hover:text-primary'}`}>
                                    {input.label || input.key}
                                </label>
                                <div className="flex items-center gap-2">
                                    {errors[input.key] && (
                                        <span className="text-[9px] font-bold text-destructive animate-pulse">{errors[input.key]}</span>
                                    )}
                                </div>
                            </div>
                            <div className="relative">
                                {input.type === 'select' ? (
                                    <div className="relative">
                                        <select
                                            value={values[input.key] || ''}
                                            onChange={(e) => {
                                                const nv = { ...values, [input.key]: e.target.value };
                                                setValues(nv);
                                                if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                            }}
                                            className={`h-11 w-full pl-4 pr-10 bg-muted/50 border focus:border-primary/50 text-xs font-semibold rounded-xl text-foreground appearance-none outline-none cursor-pointer hover:border-border transition-colors ${errors[input.key] ? 'border-destructive' : 'border-border'}`}
                                        >
                                            <option value="" disabled className="text-muted-foreground">Select an option...</option>
                                            {(input.default_value || '').split(',').map((opt) => opt.trim()).filter(Boolean).map((opt) => (
                                                <option key={opt} value={opt} className="bg-popover text-foreground">{opt}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 text-foreground">
                                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                ) : (
                                    <Input
                                        type={input.type === 'number' ? 'number' : 'text'}
                                        value={values[input.key] || ''}
                                        onChange={(e) => {
                                            const nv = { ...values, [input.key]: e.target.value };
                                            setValues(nv);
                                            if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                        }}
                                        className={`h-11 px-4 bg-muted/50 focus:border-primary/50 focus:ring-primary/20 text-xs font-semibold rounded-xl transition-all ${errors[input.key] ? 'border-destructive' : 'border-border'}`}
                                        placeholder={`Enter value for ${input.label || input.key}...`}
                                        autoFocus
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </form>

                <DialogFooter className="p-6 border-t border-border bg-muted/20 flex-shrink-0">
                    <div className="flex w-full gap-3">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCancel}
                            className="flex-1 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isStarting}
                            onClick={() => handleSubmit()}
                            className="flex-[2] h-11 rounded-xl premium-gradient text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-premium hover:opacity-90 transition-all gap-2"
                        >
                            {isStarting ? (
                                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            ) : (
                                <Zap className="w-3.5 h-3.5" />
                            )}
                            {confirmLabel}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default WorkflowInputDialog;
