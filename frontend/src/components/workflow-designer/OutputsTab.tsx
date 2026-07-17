import React from 'react';
import { Plus, Trash2, FileOutput, Check, Copy, Zap } from 'lucide-react';
import { cn, generateUUID } from '../../lib/utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { WorkflowOutput } from '../../types';

interface OutputsTabProps {
    outputs: Partial<WorkflowOutput>[];
    setOutputs: (outputs: Partial<WorkflowOutput>[]) => void;
    copyToClipboard: (text: string, key: string) => void;
    copiedKey: string | null;
}

// Declares the workflow's Result contract. Each row maps a public `key` to a `source`
// template rendered at the end of a run. The produced envelope is
// { status, result: { <key>: <value> } } — consumed by parent WORKFLOW steps (via
// {{ flow.groupKey.step.actionKey.result.<key> }}) and, later, result widgets.
export const OutputsTab: React.FC<OutputsTabProps> = ({ outputs, setOutputs, copyToClipboard, copiedKey }) => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500">
                        <FileOutput className="w-4 h-4" />
                    </div>
                    <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Result Fields</h2>
                </div>
                <Button
                    onClick={() => setOutputs([...outputs, { id: generateUUID(), key: '', source: '', description: '' }])}
                    className="h-8 text-[10px] font-bold uppercase tracking-widest px-4"
                    variant="outline"
                >
                    <Plus className="w-3 h-3 mr-2" /> Add Field
                </Button>
            </div>

            <div className="bg-card rounded-md border border-border p-6 shadow-sm">
                {outputs.length === 0 ? (
                    <div className="py-6 text-center opacity-40 select-none">
                        <FileOutput className="w-8 h-8 mx-auto mb-3" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">No result fields defined</p>
                        <p className="text-[10px] mt-1 font-medium italic">This workflow returns no data. Add a field to expose values from your steps.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {outputs.map((output, idx) => (
                            <div
                                key={output.id || `output-${idx}`}
                                className="p-5 rounded-md border border-border/50 bg-background/50 relative group"
                            >
                                <div className="grid grid-cols-12 gap-5 items-start">
                                    {/* Key + description */}
                                    <div className="col-span-4 space-y-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-amber-500">Result Key</label>
                                            <div className="relative">
                                                <Input
                                                    value={output.key}
                                                    onChange={(e) => {
                                                        const no = [...outputs];
                                                        no[idx].key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                        setOutputs(no);
                                                    }}
                                                    placeholder="e.g. order_id"
                                                    className="h-8 text-xs font-mono border-border bg-background pr-8"
                                                />
                                                {output.key && (
                                                    <button
                                                        onClick={() => copyToClipboard(output.key!, `output-${idx}`)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-amber-500 transition-colors"
                                                        title="Copy result key"
                                                    >
                                                        {copiedKey === `output-${idx}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</label>
                                            <Input
                                                value={output.description || ''}
                                                onChange={(e) => {
                                                    const no = [...outputs];
                                                    no[idx].description = e.target.value;
                                                    setOutputs(no);
                                                }}
                                                placeholder="Optional"
                                                className="h-8 text-xs border-border bg-background"
                                            />
                                        </div>
                                    </div>

                                    {/* Source template */}
                                    <div className="col-span-7 space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Source Template</label>
                                        <Textarea
                                            value={output.source}
                                            onChange={(e) => {
                                                const no = [...outputs];
                                                no[idx].source = e.target.value;
                                                setOutputs(no);
                                            }}
                                            placeholder="{{ flow.groupKey.step.actionKey.field }}"
                                            className="min-h-[60px] text-xs border-border bg-background font-mono resize-y"
                                        />
                                        <p className="text-[9px] text-muted-foreground/50 font-mono">
                                            References step outputs via <code className="text-amber-600">{'{{ flow.groupKey.step.actionKey }}'}</code>. Scalars come back typed. For an object/array append{' '}
                                            <code className="text-amber-600">| json</code> (e.g. <code className="text-amber-600">{'{{ flow.g1.step.k | json }}'}</code>), else it renders as a plain string.
                                        </p>
                                    </div>

                                    {/* Delete */}
                                    <div className="col-span-1 flex justify-end items-start pt-5">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                            onClick={() => setOutputs(outputs.filter((_, i) => i !== idx))}
                                            title="Delete result field"
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

            <div className="bg-amber-500/5 border border-amber-500/10 rounded-md p-4 flex items-start gap-3">
                <div className="p-1 rounded-full bg-amber-500/20 text-amber-500 shrink-0 mt-0.5">
                    <Zap className="w-3 h-3" />
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">Workflow Result</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                        When this workflow finishes, these fields are assembled into{' '}
                        <code className="bg-amber-500/10 px-1 rounded text-amber-600">{'{ status, result: { key: value } }'}</code>.
                        A parent workflow that runs this as a step (with an Output Key on that step) reuses it via{' '}
                        <code className="bg-amber-500/10 px-1 rounded text-amber-600">{'{{ flow.groupKey.step.actionKey.result.key }}'}</code> and{' '}
                        <code className="bg-amber-500/10 px-1 rounded text-amber-600">{'{{ flow.groupKey.step.actionKey.status }}'}</code>.
                        A workflow with no result fields returns nothing.
                    </p>
                </div>
            </div>
        </div>
    );
};
