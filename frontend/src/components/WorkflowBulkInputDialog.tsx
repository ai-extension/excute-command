import React, { useState, useEffect } from 'react';
import { WorkflowInput } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Zap, Plus, Trash2, Layers, Repeat } from 'lucide-react';
import { cn } from '../lib/utils';

interface WorkflowBulkInputDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    inputs: WorkflowInput[];
    onConfirm: (rows: Record<string, string>[], mode: 'PARALLEL' | 'SEQUENTIAL') => void;
    onCancel: () => void;
    isStarting?: boolean;
    confirmLabel?: string;
}

interface RunRow {
    id: string;
    values: Record<string, string>;
}

const WorkflowBulkInputDialog: React.FC<WorkflowBulkInputDialogProps> = ({
    isOpen,
    onOpenChange,
    inputs,
    onConfirm,
    onCancel,
    isStarting = false,
    confirmLabel = "Execute Batch"
}) => {
    const [rows, setRows] = useState<RunRow[]>([]);
    const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
    const [executionMode, setExecutionMode] = useState<'PARALLEL' | 'SEQUENTIAL'>('PARALLEL');

    const createInitialValues = () => {
        const initial: Record<string, string> = {};
        inputs.forEach(input => {
            if (input.type === 'select' || input.type === 'multi-select') {
                initial[input.key] = '';
            } else {
                initial[input.key] = input.default_value !== undefined ? String(input.default_value) : '';
            }
        });
        return initial;
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
            setRows([{ id: Math.random().toString(36).substr(2, 9), values: createInitialValues() }]);
            setErrors({});
            setExecutionMode('PARALLEL');
        }
    }, [isOpen, inputs]);

    const addRow = () => {
        setRows([...rows, { id: Math.random().toString(36).substr(2, 9), values: createInitialValues() }]);
    };

    const removeRow = (id: string) => {
        if (rows.length > 1) {
            setRows(rows.filter(row => row.id !== id));
            const newErrors = { ...errors };
            delete newErrors[id];
            setErrors(newErrors);
        }
    };

    const updateRowValue = (rowId: string, key: string, value: string) => {
        setRows(rows.map(row =>
            row.id === rowId ? { ...row, values: { ...row.values, [key]: value } } : row
        ));

        if (errors[rowId]?.[key]) {
            setErrors({
                ...errors,
                [rowId]: { ...errors[rowId], [key]: '' }
            });
        }
    };

    const validate = () => {
        const newErrors: Record<string, Record<string, string>> = {};
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

        rows.forEach(row => {
            const rowErrors: Record<string, string> = {};
            inputs.forEach(input => {
                const err = validateField(input, row.values[input.key]);
                if (err) {
                    rowErrors[input.key] = err;
                    hasErrors = true;
                }
            });
            if (Object.keys(rowErrors).length > 0) {
                newErrors[row.id] = rowErrors;
            }
        });

        setErrors(newErrors);
        return !hasErrors;
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (validate()) {
            onConfirm(rows.map(r => r.values), executionMode);
        }
    };

    if (inputs.length === 0) {
        return (
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent hideClose className="max-w-md bg-popover border-border border-2 rounded-2xl p-6 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            <Zap className="w-5 h-5 fill-current" /> Confirm Execution
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">This workflow has no inputs. Are you sure you want to initialize the execution?</p>
                    </div>
                    <DialogFooter className="gap-3 sm:gap-0">
                        <Button variant="ghost" onClick={onCancel} className="flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancel</Button>
                        <Button onClick={() => onConfirm([{}], 'PARALLEL')} disabled={isStarting} className="flex-[2] rounded-xl premium-gradient text-white text-[10px] font-black uppercase tracking-widest shadow-premium">
                            {isStarting ? <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-2" />}
                            Run Workflow
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="max-w-4xl w-[95vw] bg-popover border-border border-2 rounded-2xl p-0 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            <Layers className="w-4 h-4" /> Multi-Run Configuration
                        </h2>
                        <p className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-wider">Configure multiple execution rows for batch processing</p>
                    </div>

                    <div className="flex bg-muted/50 p-1 rounded-xl border border-border/50">
                        <button
                            onClick={() => setExecutionMode('PARALLEL')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                executionMode === 'PARALLEL' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:bg-muted"
                            )}
                        >
                            <Repeat className="w-3 h-3" /> Parallel
                        </button>
                        <button
                            onClick={() => setExecutionMode('SEQUENTIAL')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                executionMode === 'SEQUENTIAL' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:bg-muted"
                            )}
                        >
                            <Zap className="w-3 h-3" /> Sequential
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {rows.map((row, rowIndex) => (
                        <div key={row.id} className="relative group/row animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-black text-primary">
                                        {rowIndex + 1}
                                    </div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Execution Row</h3>
                                </div>
                                {rows.length > 1 && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeRow(row.id)}
                                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/row:opacity-100 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-5 bg-muted/30 rounded-2xl border border-border/50 hover:border-primary/30 transition-colors">
                                {inputs.map((input) => (
                                    <div key={input.id} className="space-y-2 group">
                                        <div className="flex items-center justify-between">
                                            <label className={cn(
                                                "text-[9px] font-black uppercase tracking-[0.15em] transition-colors",
                                                errors[row.id]?.[input.key] ? 'text-destructive' : 'text-muted-foreground group-hover:text-primary'
                                            )}>
                                                {input.label || input.key}
                                                {input.required && <span className="text-destructive ml-1">*</span>}
                                            </label>
                                            {errors[row.id]?.[input.key] && (
                                                <span className="text-[8px] font-bold text-destructive animate-pulse">{errors[row.id][input.key]}</span>
                                            )}
                                        </div>
                                        <div className="relative">
                                            {input.type === 'select' ? (
                                                <div className="relative">
                                                    <select
                                                        value={row.values[input.key] || ''}
                                                        onChange={(e) => updateRowValue(row.id, input.key, e.target.value)}
                                                        className={cn(
                                                            "h-10 w-full pl-4 pr-10 bg-background/50 border focus:border-primary/50 text-xs font-semibold rounded-xl text-foreground appearance-none outline-none cursor-pointer transition-all",
                                                            errors[row.id]?.[input.key] ? 'border-destructive' : 'border-border'
                                                        )}
                                                    >
                                                        <option value="" disabled className="text-muted-foreground">Select...</option>
                                                        {(input.default_value || '').split(',').map((opt) => opt.trim()).filter(Boolean).map((opt) => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                                                            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            ) : input.type === 'multi-select' ? (
                                                <div className="flex flex-wrap gap-1.5 p-2 bg-background/30 border border-border rounded-xl min-h-[40px]">
                                                    {(input.default_value || '').split(',').map((opt) => opt.trim()).filter(Boolean).map((opt) => {
                                                        const selectedStr = row.values[input.key] || '[]';
                                                        let selected: string[] = [];
                                                        try { selected = JSON.parse(selectedStr); } catch (e) { selected = selectedStr.split(',').map(s => s.trim()).filter(Boolean); }
                                                        const isSelected = selected.includes(opt);
                                                        return (
                                                            <button
                                                                key={opt}
                                                                type="button"
                                                                onClick={() => updateRowValue(row.id, input.key, toggleMultiSelectValue(row.values[input.key], opt))}
                                                                className={cn(
                                                                    "px-2 py-1 rounded-lg text-[9px] font-bold transition-all border",
                                                                    isSelected
                                                                        ? "bg-primary text-white border-primary"
                                                                        : "bg-background text-muted-foreground border-border hover:border-primary/50"
                                                                )}
                                                            >
                                                                {opt}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : input.type === 'multi-input' ? (
                                                <div className="space-y-3 p-3 bg-background/20 border border-border rounded-xl">
                                                    {(() => {
                                                        const keys = (input.default_value || '').split(',').map(k => k.trim()).filter(Boolean);
                                                        const currentStr = row.values[input.key] || '[]';
                                                        let mRows: any[] = [];
                                                        try { mRows = JSON.parse(currentStr); if (!Array.isArray(mRows)) mRows = [{}]; } catch (e) { mRows = [{}]; }
                                                        if (mRows.length === 0) mRows = [{}];

                                                        return (
                                                            <div className="space-y-3">
                                                                {mRows.map((mRow, mRowIndex) => (
                                                                    <div key={mRowIndex} className="flex flex-col gap-2 p-2 bg-background/50 rounded-lg border border-border/50 relative group/multi">
                                                                        <div className="grid grid-cols-1 gap-2">
                                                                            {keys.map(key => (
                                                                                <div key={key} className="space-y-1">
                                                                                    <label className="text-[7px] font-black uppercase tracking-widest text-muted-foreground/70">{key}</label>
                                                                                    <Input
                                                                                        value={mRow[key] || ''}
                                                                                        onChange={(e) => updateRowValue(row.id, input.key, updateMultiInputValue(currentStr, mRowIndex, key, e.target.value))}
                                                                                        placeholder={key}
                                                                                        className="h-7 text-[9px] bg-background border-border"
                                                                                    />
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        {mRows.length > 1 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => updateRowValue(row.id, input.key, removeMultiInputRow(currentStr, mRowIndex))}
                                                                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover/multi:opacity-100 transition-opacity shadow-lg"
                                                                            >
                                                                                <Trash2 className="w-2.5 h-2.5" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => updateRowValue(row.id, input.key, addMultiInputRow(currentStr))}
                                                                    className="w-full h-7 border-dashed border text-[8px] font-black uppercase tracking-widest gap-2 bg-background"
                                                                >
                                                                    <Plus className="w-2.5 h-2.5" /> Add Row
                                                                </Button>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <Input
                                                        type={input.type === 'number' ? 'number' : 'text'}
                                                        value={row.values[input.key] || ''}
                                                        onChange={(e) => updateRowValue(row.id, input.key, e.target.value)}
                                                        className={cn(
                                                            "h-10 px-4 bg-background/50 focus:border-primary/50 text-xs font-semibold rounded-xl transition-all",
                                                            errors[row.id]?.[input.key] ? 'border-destructive' : 'border-border'
                                                        )}
                                                        placeholder={input.label || input.key}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    <Button
                        type="button"
                        variant="outline"
                        onClick={addRow}
                        className="w-full h-12 border-dashed border-2 bg-primary/5 hover:bg-primary/10 border-primary/20 hover:border-primary/40 rounded-2xl flex items-center justify-center gap-2 text-primary group transition-all"
                    >
                        <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Add Another Run Row</span>
                    </Button>
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
                            onClick={() => handleSubmit()}
                            className="flex-[2] h-12 rounded-xl premium-gradient text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-premium hover:opacity-90 transition-all gap-3"
                        >
                            {isStarting ? (
                                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            ) : (
                                <Zap className="w-4 h-4 fill-current" />
                            )}
                            {confirmLabel} ({rows.length} {rows.length === 1 ? 'Run' : 'Runs'})
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default WorkflowBulkInputDialog;
