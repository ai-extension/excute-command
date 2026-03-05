import React from 'react';
import { Terminal, Plus, Trash2, Database, Check, Copy, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { WorkflowInput, WorkflowVariable } from '../../types';

interface VariablesTabProps {
    inputs: Partial<WorkflowInput>[];
    setInputs: (inputs: Partial<WorkflowInput>[]) => void;
    variables: Partial<WorkflowVariable>[];
    setVariables: (variables: Partial<WorkflowVariable>[]) => void;
    copyToClipboard: (text: string, key: string) => void;
    copiedKey: string | null;
}

export const VariablesTab: React.FC<VariablesTabProps> = ({
    inputs, setInputs, variables, setVariables, copyToClipboard, copiedKey
}) => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
            {/* Runtime Inputs Section */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
                            <Terminal className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Runtime Variable Definitions (Inputs)</h2>
                    </div>
                    <Button
                        onClick={() => setInputs([...inputs, { key: '', label: '', type: 'input', default_value: '', required: true }])}
                        className="h-8 text-[9px] font-bold uppercase tracking-widest px-4"
                        variant="outline"
                    >
                        <Plus className="w-3 h-3 mr-2" /> Add Input
                    </Button>
                </div>

                <div className="bg-card rounded-xl border border-border p-6 shadow-sm overflow-hidden">
                    {inputs.length === 0 ? (
                        <div className="py-6 text-center opacity-40 select-none">
                            <Terminal className="w-8 h-8 mx-auto mb-3" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">No runtime variables defined</p>
                            <p className="text-[9px] mt-1 font-medium italic">Use runtime variables in your steps via {"{{input.key}}"}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {inputs.map((input, idx) => (
                                <div key={idx} className="flex flex-col gap-1 p-5 bg-background/50 rounded-xl border border-border/50 animate-in fade-in slide-in-from-bottom-1 duration-300">
                                    <div className="grid grid-cols-12 gap-5 items-start">
                                        {/* Left side: Label & Key */}

                                        <div className="col-span-5">

                                            <div className="space-y-0">
                                                <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Display Label</label>
                                                <Input
                                                    value={input.label}
                                                    onChange={(e) => {
                                                        const ni = [...inputs];
                                                        ni[idx].label = e.target.value;
                                                        setInputs(ni);
                                                    }}
                                                    placeholder="What should the user see?"
                                                    className="h-8 text-[11px] border-border bg-background"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[8px] font-black uppercase tracking-widest text-primary">Variable Key</label>

                                                <div className="relative">
                                                    <Input
                                                        value={input.key}
                                                        onChange={(e) => {
                                                            const ni = [...inputs];
                                                            ni[idx].key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                            setInputs(ni);
                                                        }}
                                                        placeholder="e.g. app_node_version"
                                                        className="h-8 text-[11px] font-mono border-border bg-background pr-8"
                                                    />
                                                    {input.key && (
                                                        <button
                                                            onClick={() => copyToClipboard(`{{input.${input.key}}}`, `input-${idx}`)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-primary transition-colors"
                                                            title="Copy as {{input.key}}"
                                                        >
                                                            {copiedKey === `input-${idx}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    )}


                                                </div>
                                            </div>
                                        </div>

                                        {/* Right side: Type & Default Value */}
                                        <div className="col-span-6">
                                            <div className="space-y-1.5">
                                                <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Type</label>
                                                <select
                                                    value={input.type || 'input'}
                                                    onChange={(e) => { const ni = [...inputs]; ni[idx].type = e.target.value as WorkflowInput['type']; setInputs(ni); }}
                                                    className="h-8 px-2 w-full text-[11px] font-semibold border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
                                                >
                                                    <option value="input">Input</option>
                                                    <option value="number">Number</option>
                                                    <option value="select">Select</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                                                    {input.type === 'select' ? 'Options (comma-separated)' : 'Default Value'}
                                                </label>
                                                {input.type === 'input' ? (
                                                    <Textarea
                                                        value={input.default_value}
                                                        onChange={(e) => {
                                                            const ni = [...inputs];
                                                            ni[idx].default_value = e.target.value;
                                                            setInputs(ni);
                                                        }}
                                                        placeholder="Default text... supports multi-line"
                                                        className="min-h-[60px] text-[11px] border-border bg-background resize-y"
                                                    />
                                                ) : (
                                                    <Input
                                                        type={input.type === 'number' ? 'number' : 'text'}
                                                        value={input.default_value}
                                                        onChange={(e) => {
                                                            const ni = [...inputs];
                                                            ni[idx].default_value = e.target.value;
                                                            setInputs(ni);
                                                        }}
                                                        placeholder={
                                                            input.type === 'number' ? '0'
                                                                : 'option1, option2, option3'
                                                        }
                                                        className="h-8 text-[11px] border-border bg-background"
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        {/* Delete Button */}
                                        <div className="col-span-1 flex justify-end items-center h-[120px]">

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                                onClick={() => {
                                                    const ni = inputs.filter((_, i) => i !== idx);
                                                    setInputs(ni);
                                                }}
                                                title="Delete input"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Static Variables Section */}
            <div className="space-y-6 pt-6 border-t border-border/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                            <Database className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Static Variables</h2>
                    </div>
                    <Button
                        onClick={() => setVariables([...variables, { key: '', value: '' }])}
                        className="h-8 text-[9px] font-bold uppercase tracking-widest px-4"
                        variant="outline"
                    >
                        <Plus className="w-3 h-3 mr-2" /> Add Variable
                    </Button>
                </div>

                <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                    {variables.length === 0 ? (
                        <div className="py-6 text-center opacity-40 select-none">
                            <Database className="w-8 h-8 mx-auto mb-3" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">No static variables defined</p>
                            <p className="text-[9px] mt-1 font-medium italic">Reference via {'{{'}{"variable.key"}{'}}'} in steps</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {variables.map((variable, idx) => (
                                <div key={idx} className="p-4 bg-background/50 rounded-xl border border-border/50 animate-in fade-in slide-in-from-bottom-1 duration-300">
                                    <div className="grid grid-cols-12 gap-4 items-start">
                                        <div className="col-span-4 space-y-1.5">
                                            <label className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Variable Key</label>
                                            <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/60 font-mono select-none">$</span>
                                                <Input
                                                    value={variable.key}
                                                    onChange={(e) => {
                                                        const nv = [...variables];
                                                        nv[idx].key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                        setVariables(nv);
                                                    }}
                                                    placeholder="e.g. host"
                                                    className="h-8 text-[11px] font-mono border-border bg-background pl-5 pr-8"
                                                />
                                                {variable.key && (
                                                    <button
                                                        onClick={() => copyToClipboard(`{{variable.${variable.key}}}`, `var-${idx}`)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-emerald-500 transition-colors"
                                                        title="Copy as {{variable.key}}"
                                                    >
                                                        {copiedKey === `var-${idx}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="col-span-7 space-y-1.5">
                                            <label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Value</label>
                                            <Textarea
                                                value={variable.value}
                                                onChange={(e) => {
                                                    const nv = [...variables];
                                                    nv[idx].value = e.target.value;
                                                    setVariables(nv);
                                                }}
                                                placeholder="Static value..."
                                                className="min-h-[32px] h-8 text-[11px] border-border bg-background font-mono resize-y py-1"
                                            />
                                        </div>
                                        <div className="col-span-1 flex justify-end items-start pt-5">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                                onClick={() => {
                                                    const nv = variables.filter((_, i) => i !== idx);
                                                    setVariables(nv);
                                                }}
                                                title="Delete variable"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-4 flex items-start gap-3">
                    <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-500 shrink-0 mt-0.5">
                        <Zap className="w-3 h-3" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight">Static Variables vs Runtime Inputs</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                            <strong>Static Variables</strong> are saved with the workflow and automatically injected at runtime using <code className="bg-emerald-500/10 px-1 rounded text-emerald-600">{"{{variable.key}}"}</code>.<br />
                            <strong>Runtime Inputs</strong> prompt the user for values on each run and are used via <code className="bg-primary/10 px-1 rounded text-primary">{"{{input.key}}"}</code>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
