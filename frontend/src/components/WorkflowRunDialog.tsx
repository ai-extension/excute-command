import React, { useState, useEffect } from 'react';
import { WorkflowInput } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Zap, Plus, Trash2, Layers, Repeat, User } from 'lucide-react';
import { cn } from '../lib/utils';

interface WorkflowRunDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    inputs: WorkflowInput[];
    onConfirm: (inputs: Record<string, string>, openMonitor: boolean) => void;
    onCancel: () => void;
    isStarting?: boolean;
}

const WorkflowRunDialog: React.FC<WorkflowRunDialogProps> = ({
    isOpen,
    onOpenChange,
    inputs,
    onConfirm,
    onCancel,
    isStarting = false,
}) => {
    // Single row values
    const [values, setValues] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    const createInitialValues = () => {
        const initial: Record<string, string> = {};
        inputs.forEach(input => {
            if (input.type === 'select' || input.type === 'multi-select') {
                initial[input.key] = '';
            } else if (input.type === 'multi-input') {
                initial[input.key] = '[{}]';
            } else {
                initial[input.key] = input.default_value !== undefined ? String(input.default_value) : '';
            }
        });
        return initial;
    };

    useEffect(() => {
        if (isOpen) {
            const initial = createInitialValues();
            setValues(initial);
            setErrors({});
        }
    }, [isOpen, inputs]);

    const updateValue = (key: string, value: string) => {
        setValues(prev => ({ ...prev, [key]: value }));
        if (errors[key]) {
            setErrors(prev => ({ ...prev, [key]: '' }));
        }
    };

    const toggleMultiSelectValue = (currentValue: string, option: string) => {
        let selected: string[] = [];
        try {
            selected = JSON.parse(currentValue || '[]');
        } catch (e) {
            selected = (currentValue || '').split(',').map(s => s.trim()).filter(Boolean);
        }

        if (selected.includes(option)) {
            selected = selected.filter(s => s !== option);
        } else {
            selected = [...selected, option];
        }
        return JSON.stringify(selected);
    };

    const updateMultiInputValue = (currentValue: string, rowIndex: number, key: string, value: string) => {
        let rows: any[] = [];
        try {
            rows = JSON.parse(currentValue || '[]');
        } catch (e) { rows = [{}]; }

        if (!rows[rowIndex]) rows[rowIndex] = {};
        rows[rowIndex][key] = value;
        return JSON.stringify(rows);
    };

    const addMultiInputRow = (currentValue: string) => {
        let rows: any[] = [];
        try {
            rows = JSON.parse(currentValue || '[]');
            if (!Array.isArray(rows)) rows = [];
        } catch (e) { rows = []; }

        // If the current "rendered" state already has a row (even if '[]' in state),
        // we should ensure we are adding a SECOND row if the first one is expected to be there.
        // Actually, if we initialize as '[]', and the UI renders '[]' as one row, 
        // then addMultiInputRow should probably push {} once if empty, and twice if we want a new one?
        // No, let's just make the state consistent: start with '[{}]'
        rows.push({});
        return JSON.stringify(rows);
    };

    const removeMultiInputRow = (currentValue: string, rowIndex: number) => {
        let rows: any[] = [];
        try {
            rows = JSON.parse(currentValue || '[]');
        } catch (e) { rows = []; }
        rows.splice(rowIndex, 1);
        return JSON.stringify(rows);
    };

    const validate = () => {
        const safeRegex = /^[a-zA-Z0-9_\-\.\ \/\{\},]*$/;
        let hasErrors = false;

        const validateField = (input: WorkflowInput, val: any): string | null => {
            const isValueEmpty = val === undefined || val === null || (typeof val === 'string' && val.trim() === '') || (Array.isArray(val) && val.length === 0);

            if (input.required && isValueEmpty) {
                return 'Required';
            }

            if (!isValueEmpty) {
                if (input.type === 'number') {
                    if (isNaN(Number(val))) return 'Must be a number';
                } else if (input.type === 'multi-select') {
                    const options = (input.default_value || '').split(',').map(o => o.trim()).filter(Boolean);
                    let selected: string[] = [];
                    try {
                        selected = typeof val === 'string' ? JSON.parse(val) : val;
                    } catch (e) {
                        selected = String(val).split(',').map(s => s.trim()).filter(Boolean);
                    }
                    const invalid = selected.filter(s => !options.includes(s));
                    if (invalid.length > 0) return 'Invalid options';
                } else if (input.type === 'multi-input') {
                    let rows: any[] = [];
                    try {
                        rows = typeof val === 'string' ? JSON.parse(val) : val;
                    } catch (e) { return 'Invalid format'; }

                    if (!Array.isArray(rows)) return 'Must be an array of objects';

                    for (const row of rows) {
                        for (const k in row) {
                            if (!safeRegex.test(String(row[k]))) return `Invalid chars in ${k}`;
                        }
                    }
                } else {
                    if (!safeRegex.test(String(val))) return 'Invalid characters';
                }
            }
            return null;
        };

        const newErrors: Record<string, string> = {};
        inputs.forEach(input => {
            const err = validateField(input, values[input.key]);
            if (err) {
                newErrors[input.key] = err;
                hasErrors = true;
            }
        });
        setErrors(newErrors);

        return !hasErrors;
    };

    const handleSubmit = () => {
        if (validate()) {
            onConfirm(values, true);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="max-w-lg w-[95vw] bg-popover border-border border-2 rounded-2xl p-0 overflow-hidden shadow-2xl flex flex-col transition-all duration-300">
                {/* Header */}
                <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Workflow Execution
                        </h2>
                        <p className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-wider">
                            Configure workflow inputs and start execution
                        </p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                    {inputs.map((input) => (
                        <div key={input.id} className="space-y-2 group">
                            <div className="flex items-center justify-between">
                                <label className={cn(
                                    "text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
                                    errors[input.key] ? 'text-destructive' : 'text-primary/70 group-hover:text-primary'
                                )}>
                                    {input.label || input.key}
                                    {input.required && <span className="text-destructive ml-1">*</span>}
                                </label>
                                {errors[input.key] && (
                                    <span className="text-[9px] font-bold text-destructive animate-pulse">{errors[input.key]}</span>
                                )}
                            </div>
                            <div className="relative">
                                {input.type === 'select' ? (
                                    <div className="relative">
                                        <select
                                            value={values[input.key] || ''}
                                            onChange={(e) => updateValue(input.key, e.target.value)}
                                            className={cn(
                                                "h-11 w-full pl-4 pr-10 bg-muted/50 border focus:border-primary/50 text-xs font-semibold rounded-xl text-foreground appearance-none outline-none cursor-pointer hover:border-border transition-colors",
                                                errors[input.key] ? 'border-destructive' : 'border-border'
                                            )}
                                        >
                                            <option value="" disabled className="text-muted-foreground">Select an option...</option>
                                            {(input.default_value || '').split(',').map((opt) => opt.trim()).filter(Boolean).map((opt) => (
                                                <option key={opt} value={opt} className="bg-popover text-foreground">{opt}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 text-foreground">
                                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                ) : input.type === 'multi-select' ? (
                                    <div className="flex flex-wrap gap-2 p-3 bg-muted/30 border border-border rounded-xl min-h-[44px]">
                                        {(input.default_value || '').split(',').map((opt) => opt.trim()).filter(Boolean).map((opt) => {
                                            const selectedStr = values[input.key] || '[]';
                                            let selected: string[] = [];
                                            try { selected = JSON.parse(selectedStr); } catch (e) { selected = selectedStr.split(',').map(s => s.trim()).filter(Boolean); }
                                            const isSelected = selected.includes(opt);
                                            return (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    onClick={() => updateValue(input.key, toggleMultiSelectValue(values[input.key], opt))}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                                                        isSelected
                                                            ? "bg-primary text-white border-primary shadow-sm"
                                                            : "bg-background text-muted-foreground border-border hover:border-primary/50"
                                                    )}
                                                >
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : input.type === 'multi-input' ? (
                                    <div className="space-y-3 p-4 bg-muted/30 border border-border rounded-2xl">
                                        {(() => {
                                            const keys = (input.default_value || '').split(',').map(k => k.trim()).filter(Boolean);
                                            const currentStr = values[input.key] || '[]';
                                            let rows: any[] = [];
                                            try { rows = JSON.parse(currentStr); if (!Array.isArray(rows)) rows = [{}]; } catch (e) { rows = [{}]; }
                                            if (rows.length === 0) rows = [{}];

                                            return (
                                                <div className="space-y-4">
                                                    {rows.map((row, rowIndex) => (
                                                        <div key={rowIndex} className="flex flex-col gap-3 p-3 bg-background/50 rounded-xl border border-border/50 relative group">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                {keys.map(key => (
                                                                    <div key={key} className="space-y-1">
                                                                        <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/70">{key}</label>
                                                                        <Input
                                                                            value={row[key] || ''}
                                                                            onChange={(e) => updateValue(input.key, updateMultiInputValue(currentStr, rowIndex, key, e.target.value))}
                                                                            placeholder={key}
                                                                            className="h-8 text-[10px] bg-background border-border"
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {rows.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateValue(input.key, removeMultiInputRow(currentStr, rowIndex))}
                                                                    className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => updateValue(input.key, addMultiInputRow(currentStr))}
                                                        className="w-full h-8 border-dashed border-2 text-[9px] font-black uppercase tracking-widest gap-2 bg-background hover:bg-muted"
                                                    >
                                                        <Plus className="w-3 h-3" /> Add Row
                                                    </Button>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Input
                                            type={input.type === 'number' ? 'number' : 'text'}
                                            value={values[input.key] || ''}
                                            onChange={(e) => updateValue(input.key, e.target.value)}
                                            className={cn(
                                                "h-11 px-4 bg-muted/50 focus:border-primary/50 focus:ring-primary/20 text-xs font-semibold rounded-xl transition-all",
                                                errors[input.key] ? 'border-destructive' : 'border-border'
                                            )}
                                            placeholder={`Enter ${input.label || input.key}...`}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <DialogFooter className="p-6 border-t border-border bg-muted/20 shrink-0">
                    <div className="flex w-full gap-4">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCancel}
                            className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isStarting}
                            onClick={handleSubmit}
                            className="flex-[2] h-12 rounded-xl premium-gradient text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-premium hover:opacity-90 transition-all gap-3"
                        >
                            {isStarting ? (
                                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            ) : (
                                <Zap className="w-4 h-4 fill-current" />
                            )}
                            Run Workflow
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default WorkflowRunDialog;
