import React, { useState, useEffect } from 'react';
import { WorkflowInput, MultiInputItem } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogFooter } from './ui/dialog';
import { Zap, Plus, Trash2, Search } from 'lucide-react';

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

    useEffect(() => {
        if (isOpen) {
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
            setValues(initial);
            setErrors({});
        }
    }, [isOpen, inputs]);

    const validate = () => {
        const newErrors: Record<string, string> = {};
        const safeRegex = /^[\p{L}0-9_\-\. \/:\[\]{}"',@#%!+=?]*$/u;

        inputs.forEach(input => {
            const val = values[input.key];
            const isValueEmpty = val === undefined || val === null || String(val).trim() === '' || val === '[]';

            if (input.type === 'select') {
                const options = (input.default_value || '').split(',').map(o => o.trim()).filter(Boolean);
                if (isValueEmpty) {
                    newErrors[input.key] = 'Please select an option';
                } else if (!isValueEmpty && !options.includes(val)) {
                    newErrors[input.key] = 'Invalid option';
                }
            } else if (input.type === 'multi-select') {
                if (input.required && isValueEmpty) {
                    newErrors[input.key] = 'Please select at least one option';
                }
            } else if (input.type === 'multi-input') {
                let rows: any[] = [];
                try {
                    rows = JSON.parse(val || '[]');
                } catch (e) {
                    newErrors[input.key] = 'Invalid format';
                    return;
                }
                if (!Array.isArray(rows)) {
                    newErrors[input.key] = 'Must be an array';
                    return;
                }
                for (const row of rows) {
                    for (const k in row) {
                        if (!safeRegex.test(String(row[k]))) {
                            newErrors[input.key] = `Invalid characters in ${k}. Allowed: Letters, 0-9, _, -, ., /, :, [, ], {, }, ", ', @, #, %, !, +, =, ? and Space`;
                            return;
                        }
                    }
                }
            } else {
                if (input.required && isValueEmpty) {
                    newErrors[input.key] = 'This field is required';
                } else if (!isValueEmpty) {
                    if (input.type === 'number') {
                        if (isNaN(Number(val))) {
                            newErrors[input.key] = 'Must be a number';
                        }
                    } else {
                        if (!safeRegex.test(val)) {
                            newErrors[input.key] = 'Invalid characters. Allowed: Letters, 0-9, _, -, ., /, :, [, ], {, }, ", \', @, #, %, !, +, =, ? and Space';
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
                                ) : input.type === 'multi-select' ? (
                                    <div className="flex flex-wrap gap-2 p-3 bg-muted/30 border border-border rounded-xl">
                                        {(input.default_value || '').split(',').map((opt) => opt.trim()).filter(Boolean).map((opt) => {
                                            let selected: string[] = [];
                                            try { selected = JSON.parse(values[input.key] || '[]'); } catch (e) { }
                                            const isSelected = selected.includes(opt);
                                            return (
                                                <Button
                                                    key={opt}
                                                    type="button"
                                                    variant={isSelected ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => {
                                                        const newValue = toggleMultiSelectValue(values[input.key], opt);
                                                        setValues({ ...values, [input.key]: newValue });
                                                    }}
                                                    className={`h-7 px-3 text-[10px] font-bold rounded-lg transition-all ${isSelected ? 'premium-gradient shadow-sm' : 'hover:bg-primary/10 hover:text-primary hover:border-primary/30'}`}
                                                >
                                                    {opt}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                ) : input.type === 'multi-input' ? (
                                    <div className="space-y-3 bg-indigo-500/5 p-3 border border-indigo-500/10 rounded-xl">
                                        {(() => {
                                            let rows: any[] = [];
                                            try { rows = JSON.parse(values[input.key] || '[]'); } catch (e) { rows = [{}]; }
                                            if (!Array.isArray(rows)) rows = [{}];

                                            let config: MultiInputItem[] = [];
                                            try {
                                                config = JSON.parse(input.default_value || '[]');
                                                if (!Array.isArray(config)) throw new Error();
                                            } catch (e) {
                                                // Fallback for old format
                                                config = (input.default_value || '').split(',').map(k => ({
                                                    key: k.trim(),
                                                    label: k.trim(),
                                                    type: 'input' as const
                                                })).filter(c => c.key);
                                            }

                                            return (
                                                <>
                                                    {rows.map((row, rowIndex) => (
                                                        <div key={rowIndex} className="space-y-2 p-3 bg-background border border-indigo-500/10 rounded-lg relative group/row">
                                                            {config.map((field) => (
                                                                <div key={field.key} className="flex items-center gap-2">
                                                                    <span className="text-[8px] font-black uppercase tracking-widest opacity-30 w-16 truncate shrink-0" title={field.label || field.key}>
                                                                        {field.label || field.key}
                                                                    </span>
                                                                    {field.type === 'select' ? (
                                                                        <select
                                                                            value={row[field.key] || ''}
                                                                            onChange={(e) => {
                                                                                const newValue = updateMultiInputValue(values[input.key], rowIndex, field.key, e.target.value);
                                                                                setValues({ ...values, [input.key]: newValue });
                                                                            }}
                                                                            className="h-8 w-full px-2 bg-muted/20 border border-border/50 rounded text-[11px] font-bold outline-none"
                                                                        >
                                                                            <option value="">Select...</option>
                                                                            {(field.options || '').split(',').map((o: string) => o.trim()).filter(Boolean).map((o: string) => (
                                                                                <option key={o} value={o}>{o}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <Input
                                                                            type={field.type === 'number' ? 'number' : 'text'}
                                                                            className="h-8 bg-muted/20 border-border/50 rounded text-[11px] font-bold"
                                                                            value={row[field.key] || ''}
                                                                            onChange={(e) => {
                                                                                const newValue = updateMultiInputValue(values[input.key], rowIndex, field.key, e.target.value);
                                                                                setValues({ ...values, [input.key]: newValue });
                                                                            }}
                                                                            placeholder={`Enter ${field.label || field.key}...`}
                                                                        />
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {rows.length > 1 && (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => {
                                                                        const newValue = removeMultiInputRow(values[input.key], rowIndex);
                                                                        setValues({ ...values, [input.key]: newValue });
                                                                    }}
                                                                    className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            const newValue = addMultiInputRow(values[input.key]);
                                                            setValues({ ...values, [input.key]: newValue });
                                                        }}
                                                        className="w-full h-8 border-dashed border-indigo-500/30 text-indigo-500 bg-indigo-500/5 hover:bg-indigo-500/10 text-[9px] font-black uppercase tracking-widest rounded-lg"
                                                    >
                                                        <Plus className="w-3 h-3 mr-1" /> Add Row
                                                    </Button>
                                                </>
                                            );
                                        })()}
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
