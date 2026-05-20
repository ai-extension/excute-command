import React, { useState, useEffect, useMemo } from 'react';
import { WorkflowInput, MultiInputItem } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { generateUUID } from '../lib/utils';
import { SearchableSelect } from './SearchableSelect';

const getSelectDisplayLabel = (opt: string) => {
    const idx = opt.indexOf('::');
    return idx >= 0 ? opt.substring(0, idx).trim() : opt;
};

interface TemplateMap {
    _template_for: string;
    [optionValue: string]: string;
}

const parseTemplateMap = (defaultValue: string): TemplateMap | null => {
    if (!defaultValue) return null;
    const trimmed = defaultValue.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && typeof parsed._template_for === 'string') {
            return parsed as TemplateMap;
        }
    } catch { /* not a template map */ }
    return null;
};

interface WorkflowInputDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    inputs: WorkflowInput[];
    onConfirm: (values: Record<string, string>) => void;
    onCancel: () => void;
    isStarting?: boolean;
    confirmLabel?: string;
    uploadUrl?: string;
    headers?: Record<string, string>;
    storageKey?: string;
    title?: string;
    description?: string;
}

const DRAFT_PREFIX = 'wf_input_draft:';

const loadDraft = (key: string | undefined, inputs: WorkflowInput[]): Record<string, string> | null => {
    if (!key) return null;
    try {
        const raw = localStorage.getItem(DRAFT_PREFIX + key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const allowedKeys = new Set(inputs.filter(i => i.type !== 'file').map(i => i.key));
        const cleaned: Record<string, string> = {};
        for (const k of Object.keys(parsed)) {
            if (allowedKeys.has(k) && typeof parsed[k] === 'string') {
                cleaned[k] = parsed[k];
            }
        }
        return cleaned;
    } catch {
        return null;
    }
};

const saveDraft = (key: string | undefined, values: Record<string, string>, inputs: WorkflowInput[]) => {
    if (!key) return;
    try {
        const fileKeys = new Set(inputs.filter(i => i.type === 'file').map(i => i.key));
        const toSave: Record<string, string> = {};
        for (const k of Object.keys(values)) {
            if (!fileKeys.has(k)) toSave[k] = values[k];
        }
        localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(toSave));
    } catch {
        // ignore quota/serialize errors
    }
};

const WorkflowInputDialog: React.FC<WorkflowInputDialogProps> = ({
    isOpen,
    onOpenChange,
    inputs,
    onConfirm,
    onCancel,
    isStarting = false,
    confirmLabel = "Initialize Pipeline",
    uploadUrl = '/api/workflows/upload-input',
    headers = {},
    storageKey,
    title = 'Workflow Inputs',
    description = 'Provide values for this workflow run.',
}) => {
    const [values, setValues] = useState<Record<string, string>>({});
    const [files, setFiles] = useState<Record<string, File>>({});
    const [multiInputFiles, setMultiInputFiles] = useState<Record<string, Record<number, Record<string, File>>>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isUploading, setIsUploading] = useState(false);
    const isLoading = isStarting || isUploading;

    const templateMaps = useMemo(() => {
        const maps: Record<string, TemplateMap> = {};
        for (const input of inputs) {
            const tm = parseTemplateMap(input.default_value);
            if (tm) maps[input.key] = tm;
        }
        return maps;
    }, [inputs]);

    const templateTargetKeys = useMemo(() => {
        const keys = new Set<string>();
        for (const tm of Object.values(templateMaps)) {
            keys.add(tm._template_for);
        }
        return keys;
    }, [templateMaps]);

    const applyTemplates = (newValues: Record<string, string>, changedKey: string) => {
        if (!templateTargetKeys.has(changedKey)) return newValues;
        const selectedValue = newValues[changedKey] || '';
        const updated = { ...newValues };
        for (const [inputKey, tm] of Object.entries(templateMaps)) {
            if (tm._template_for !== changedKey) continue;
            const matchKey = Object.keys(tm).find(k => k !== '_template_for' && selectedValue.startsWith(k));
            if (matchKey) {
                updated[inputKey] = tm[matchKey];
            } else {
                updated[inputKey] = '';
            }
        }
        return updated;
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

    const updateMultiInputValue = (currentValue: string, rowIndex: number, field: string, value: string) => {
        let rows: any[] = [];
        try {
            rows = JSON.parse(currentValue || '[]');
        } catch (e) {
            rows = [{}];
        }
        if (!Array.isArray(rows)) rows = [{}];
        if (!rows[rowIndex]) rows[rowIndex] = {};
        rows[rowIndex][field] = value;
        return JSON.stringify(rows);
    };

    const addMultiInputRow = (currentValue: string) => {
        let rows: any[] = [];
        try {
            rows = JSON.parse(currentValue || '[]');
        } catch (e) {
            rows = [{}];
        }
        if (!Array.isArray(rows)) rows = [{}];
        rows.push({});
        return JSON.stringify(rows);
    };

    const removeMultiInputRow = (currentValue: string, rowIndex: number) => {
        let rows: any[] = [];
        try {
            rows = JSON.parse(currentValue || '[]');
        } catch (e) {
            return currentValue;
        }
        if (!Array.isArray(rows)) return currentValue;
        rows.splice(rowIndex, 1);
        return JSON.stringify(rows);
    };

    useEffect(() => {
        if (isOpen) {
            const initialValues: Record<string, string> = {};
            inputs.forEach(input => {
                if (input.type === 'multi-input' || input.type === 'multi-select') {
                    // For multi-input/multi-select, default_value is often misused as schema/options, so we start fresh
                    if (input.type === 'multi-input') {
                        initialValues[input.key] = input.collapse_initially ? '[]' : '[{}]';
                    } else {
                        initialValues[input.key] = '[]';
                    }
                } else if (input.type === 'input' || input.type === 'number' || input.type === 'textarea') {
                    const tm = parseTemplateMap(input.default_value);
                    initialValues[input.key] = tm ? '' : (input.default_value || '');
                } else {
                    initialValues[input.key] = ''; // Select/File starts empty
                }
            });

            const draft = loadDraft(storageKey, inputs);
            if (draft) {
                for (const k of Object.keys(draft)) {
                    initialValues[k] = draft[k];
                }
            }

            setValues(initialValues);
            setFiles({});
            setMultiInputFiles({});
            setErrors({});
        }
    }, [isOpen, inputs, storageKey]);

    useEffect(() => {
        if (isOpen && storageKey && inputs.length > 0) {
            saveDraft(storageKey, values, inputs);
        }
    }, [values, isOpen, storageKey, inputs]);

    const validate = () => {
        const newErrors: Record<string, string> = {};
        const safeRegex = /^[\p{L}0-9_\-\. \/\\:\[\]{}"',@#%!+=?;&|\(\)\$\n\r\*]*$/u;
        const allowedCharsDesc = 'Letters, 0-9, _, -, ., /, \\, :, [, ], {, }, ", \', @, #, %, !, +, =, ?, ;, &, |, (, ), $, *, Newline and Space';

        inputs.forEach(input => {
            const val = values[input.key];
            const isValueEmpty = val === undefined || val === null || String(val).trim() === '' || val === '[]';

            if (input.type === 'select') {
                const options = (input.default_value || '').split(',').map(o => o.trim()).filter(Boolean);
                if (isValueEmpty) {
                    if (input.required) {
                        newErrors[input.key] = 'Please select an option';
                    }
                } else if (!options.includes(val)) {
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
                const hasData = rows.some(r => r && Object.values(r).some(v => String(v ?? '').trim() !== ''));
                if (input.required && !hasData) {
                    newErrors[input.key] = 'Please add at least one row';
                    return;
                }
                for (const row of rows) {
                    for (const k in row) {
                        if (!safeRegex.test(String(row[k]))) {
                            newErrors[input.key] = `Invalid characters in ${k}. Allowed: Letters, 0-9, _, -, ., /, \, :, [, ], {, }, ", ', @, #, %, !, +, =, ?, ;, &, |, Newline and Space`;
                            return;
                        }
                    }
                }
            } else if (input.type === 'file') {
                if (input.required && !files[input.key]) {
                    newErrors[input.key] = 'This field is required';
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
                            newErrors[input.key] = `Invalid characters. Allowed: ${allowedCharsDesc}`;
                        }
                    }
                }
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (validate()) {
            setIsUploading(true);
            const finalValues = { ...values };
            const sessionId = generateUUID();
            let hasError = false;

            for (const input of inputs) {
                if (input.type === 'file' && files[input.key]) {
                    try {
                        const formData = new FormData();
                        formData.append('file', files[input.key]);
                        formData.append('session_id', sessionId);

                        let token = localStorage.getItem('token');
                        if (!token) token = sessionStorage.getItem('token');

                        const finalHeaders = { ...headers };
                        if (token && !finalHeaders['Authorization']) {
                            finalHeaders['Authorization'] = `Bearer ${token}`;
                        }

                        const res = await fetch(uploadUrl, {
                            method: 'POST',
                            headers: finalHeaders,
                            body: formData
                        });

                        if (!res.ok) throw new Error('Upload failed');
                        const data = await res.json();
                        // Store as JSON object with metadata
                        finalValues[input.key] = JSON.stringify({
                            path: data.path,
                            name: files[input.key].name,
                            size: files[input.key].size,
                            mime: files[input.key].type
                        });
                    } catch (err) {
                        setErrors(prev => ({ ...prev, [input.key]: 'Failed to upload file' }));
                        hasError = true;
                    }
                }
            }

            // Handle Multi-Input nested files
            for (const input of inputs) {
                if (input.type === 'multi-input' && multiInputFiles[input.key]) {
                    const rows = JSON.parse(finalValues[input.key] || '[]');
                    for (const rowIndex in multiInputFiles[input.key]) {
                        const idx = parseInt(rowIndex);
                        for (const fieldKey in multiInputFiles[input.key][idx]) {
                            const file = multiInputFiles[input.key][idx][fieldKey];
                            if (file) {
                                try {
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    formData.append('session_id', sessionId);

                                    let token = localStorage.getItem('token');
                                    if (!token) token = sessionStorage.getItem('token');

                                    const finalHeaders = { ...headers };
                                    if (token && !finalHeaders['Authorization']) {
                                        finalHeaders['Authorization'] = `Bearer ${token}`;
                                    }

                                    const res = await fetch(uploadUrl, {
                                        method: 'POST',
                                        headers: finalHeaders,
                                        body: formData
                                    });

                                    if (!res.ok) throw new Error('Upload failed');
                                    const data = await res.json();
                                    // Store as object (not stringified) so it stays an object in the JSON array
                                    rows[idx][fieldKey] = {
                                        path: data.path,
                                        name: file.name,
                                        size: file.size,
                                        mime: file.type
                                    };
                                } catch (err) {
                                    setErrors(prev => ({ ...prev, [input.key]: 'Failed to upload nested file' }));
                                    hasError = true;
                                }
                            }
                        }
                    }
                    finalValues[input.key] = JSON.stringify(rows);
                }
            }

            setIsUploading(false);
            if (!hasError) {
                onConfirm(finalValues);
            }
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl w-[95vw] max-h-[85vh] p-0 overflow-hidden flex flex-col">
                <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-primary" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <form
                    key={isOpen ? 'open' : 'closed'}
                    onSubmit={handleSubmit}
                    className="flex-1 px-6 py-4 space-y-4 overflow-y-auto custom-scrollbar"
                >
                    {inputs.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((input) => (
                        <div key={input.key} className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${errors[input.key] ? 'text-destructive' : (input.required ? 'text-primary' : 'text-muted-foreground')}`}>
                                    {input.label || input.key}
                                </Label>
                                {errors[input.key] && (
                                    <span className="text-[10px] font-medium text-destructive">
                                        {errors[input.key]}
                                    </span>
                                )}
                            </div>

                            <div className="relative">
                                {input.type === 'select' ? (
                                    <SearchableSelect
                                        options={(input.default_value || '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => ({ label: o, value: o }))}
                                        value={values[input.key] || ''}
                                        onValueChange={(val: string) => {
                                            const nv = { ...values, [input.key]: val };
                                            setValues(nv);
                                            if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                        }}
                                        placeholder="Select an option..."
                                        searchPlaceholder="Search options..."
                                        isSearchable
                                        triggerClassName={`h-9 rounded-md ${errors[input.key] ? 'border-destructive' : 'border-border'}`}
                                    />
                                ) : input.type === 'multi-select' ? (
                                    <div className="flex flex-wrap gap-2 p-3 bg-background border border-border rounded-md shadow-sm">
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
                                                    className={`h-7 px-3 text-[10px] font-bold rounded-md transition-all ${isSelected ? 'premium-gradient shadow-sm border-0 text-white' : 'hover:bg-indigo-500/10 hover:text-indigo-500 hover:border-indigo-500/30'}`}
                                                >
                                                    {getSelectDisplayLabel(opt)}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                ) : input.type === 'multi-input' ? (
                                    <div className="space-y-3">
                                        {(() => {
                                            let rows: any[] = [];
                                            try { rows = JSON.parse(values[input.key] || '[]'); } catch (e) { rows = []; }
                                            if (!Array.isArray(rows)) rows = [];

                                            let config: MultiInputItem[] = [];
                                            try {
                                                config = JSON.parse(input.default_value || '[]');
                                                if (!Array.isArray(config)) throw new Error();
                                            } catch (e) {
                                                config = (input.default_value || '').split(',').map(k => ({
                                                    id: generateUUID(),
                                                    key: k.trim(),
                                                    label: k.trim(),
                                                    type: 'input' as const
                                                })).filter(c => c.key);
                                            }

                                            return (
                                                <>
                                                    <div className="flex flex-col gap-2">
                                                        {rows.map((row, rowIndex) => (
                                                            <div key={rowIndex} className="group/row relative flex flex-wrap gap-3 p-3 bg-background border border-border rounded-md shadow-sm transition-all hover:border-indigo-500/30">
                                                                {config.map((field) => (
                                                                    <div key={field.key} className="flex flex-col gap-1 min-w-[200px] flex-1">
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate" title={field.label || field.key}>
                                                                            {field.label || field.key}
                                                                        </span>
                                                                        {field.type === 'select' ? (
                                                                            <SearchableSelect
                                                                                options={(field.options || '').split(',').map((o: string) => o.trim()).filter(Boolean).map((o: string) => ({ label: o, value: o }))}
                                                                                value={row[field.key] || ''}
                                                                                onValueChange={(val: string) => {
                                                                                    const newValue = updateMultiInputValue(values[input.key], rowIndex, field.key, val);
                                                                                    setValues({ ...values, [input.key]: newValue });
                                                                                }}
                                                                                placeholder="Select..."
                                                                                searchPlaceholder="Search..."
                                                                                isSearchable
                                                                                triggerClassName="h-8 rounded-md bg-muted/30"
                                                                            />
                                                                        ) : field.type === 'file' ? (
                                                                            <Input
                                                                                type="file"
                                                                                className="h-8 bg-muted/30 border-border rounded-md text-[10px] font-medium file:bg-indigo-500/10 file:text-indigo-500 file:text-[10px] file:font-bold file:h-full file:py-0 file:px-2 file:mr-2 file:border-0 file:rounded-sm cursor-pointer"
                                                                                onChange={(e) => {
                                                                                    const file = e.target.files?.[0];
                                                                                    const newMultiFiles = { ...multiInputFiles };
                                                                                    if (!newMultiFiles[input.key]) newMultiFiles[input.key] = {};
                                                                                    if (!newMultiFiles[input.key][rowIndex]) newMultiFiles[input.key][rowIndex] = {};

                                                                                    if (file) {
                                                                                        newMultiFiles[input.key][rowIndex][field.key] = file;
                                                                                    } else {
                                                                                        delete newMultiFiles[input.key][rowIndex][field.key];
                                                                                    }
                                                                                    setMultiInputFiles(newMultiFiles);
                                                                                }}
                                                                            />
                                                                        ) : (
                                                                            <Input
                                                                                type={field.type === 'number' ? 'number' : 'text'}
                                                                                className="h-8 bg-muted/30 border-border rounded-md text-xs font-medium focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
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
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => {
                                                                        const newValue = removeMultiInputRow(values[input.key], rowIndex);
                                                                        setValues({ ...values, [input.key]: newValue });
                                                                        
                                                                        // Sync multiInputFiles state to shift indices
                                                                        const newMultiFiles = { ...multiInputFiles };
                                                                        if (newMultiFiles[input.key]) {
                                                                            const oldRowFiles = { ...newMultiFiles[input.key] };
                                                                            const updatedRowFiles: Record<number, Record<string, File>> = {};
                                                                            
                                                                            Object.keys(oldRowFiles).forEach(idxKey => {
                                                                                const idx = parseInt(idxKey);
                                                                                if (idx < rowIndex) {
                                                                                    updatedRowFiles[idx] = oldRowFiles[idx];
                                                                                } else if (idx > rowIndex) {
                                                                                    updatedRowFiles[idx - 1] = oldRowFiles[idx];
                                                                                }
                                                                            });
                                                                            newMultiFiles[input.key] = updatedRowFiles;
                                                                            setMultiInputFiles(newMultiFiles);
                                                                        }
                                                                    }}
                                                                    className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity shadow-lg"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            const newValue = addMultiInputRow(values[input.key]);
                                                            setValues({ ...values, [input.key]: newValue });
                                                        }}
                                                        className="w-full h-8 border-dashed border-indigo-500/40 text-indigo-500 hover:text-indigo-600 bg-indigo-500/5 hover:bg-indigo-500/10 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all"
                                                    >
                                                        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Entry
                                                    </Button>
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : input.type === 'textarea' ? (
                                    <Textarea
                                        value={values[input.key] || ''}
                                        onChange={(e) => {
                                            const nv = { ...values, [input.key]: e.target.value };
                                            setValues(nv);
                                            if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                        }}
                                        className={`min-h-[120px] px-3 py-2 bg-background focus:border-indigo-500 text-xs font-semibold rounded-md transition-all resize-y ${errors[input.key] ? 'border-destructive' : 'border-border'}`}
                                        placeholder={`Enter value for ${input.label || input.key}...`}
                                    />
                                ) : input.type === 'file' ? (
                                    <div className="relative">
                                        <Input
                                            type="file"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    setFiles({ ...files, [input.key]: file });
                                                } else {
                                                    const nf = { ...files };
                                                    delete nf[input.key];
                                                    setFiles(nf);
                                                }
                                                if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                            }}
                                            className={`h-9 px-3 cursor-pointer file:cursor-pointer file:mr-3 file:py-0 file:h-full file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-indigo-500/10 file:text-indigo-500 hover:file:bg-indigo-500/20 bg-background focus:border-indigo-500 text-xs font-semibold rounded-md transition-all ${errors[input.key] ? 'border-destructive' : 'border-border'}`}
                                        />
                                    </div>
                                ) : templateMaps[input.key] ? (
                                    <Textarea
                                        value={values[input.key] || ''}
                                        onChange={(e) => {
                                            const nv = { ...values, [input.key]: e.target.value };
                                            setValues(nv);
                                            if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                        }}
                                        rows={5}
                                        className={`px-3 py-2 bg-background focus:border-indigo-500 text-[11px] font-semibold rounded-lg transition-all resize-y ${errors[input.key] ? 'border-destructive' : 'border-border'}`}
                                        placeholder={`Select ${templateMaps[input.key]._template_for} to auto-fill template...`}
                                    />
                                ) : (
                                    <Input
                                        type={input.type === 'number' ? 'number' : 'text'}
                                        value={values[input.key] || ''}
                                        onChange={(e) => {
                                            const nv = { ...values, [input.key]: e.target.value };
                                            setValues(nv);
                                            if (errors[input.key]) setErrors({ ...errors, [input.key]: '' });
                                        }}
                                        className={`h-9 px-3 bg-background focus:border-indigo-500 text-xs font-semibold rounded-md transition-all ${errors[input.key] ? 'border-destructive' : 'border-border'}`}
                                        placeholder={`Enter value for ${input.label || input.key}...`}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </form>

                <DialogFooter className="px-6 py-4 border-t border-border/50 flex-shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onCancel}
                        className="h-9 text-[10px] font-bold uppercase tracking-widest px-6"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isLoading}
                        onClick={() => handleSubmit()}
                        className="h-9 text-[10px] font-bold uppercase tracking-widest px-6 premium-gradient gap-2"
                    >
                        {isLoading ? (
                            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        ) : (
                            <Zap className="w-3 h-3" />
                        )}
                        {isUploading ? 'Uploading...' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default WorkflowInputDialog;
