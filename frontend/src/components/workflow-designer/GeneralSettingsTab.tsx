import React from 'react';
import { Zap, Server, Layers } from 'lucide-react';
import { Input } from '../ui/input';
import { TagSelector } from '../TagSelector';
import { SearchableSelect } from '../SearchableSelect';
import { Switch } from '../ui/switch';
import { Server as ServerType, Tag } from '../../types';


interface GeneralSettingsTabProps {
    name: string;
    setName: (val: string) => void;
    description: string;
    setDescription: (val: string) => void;
    timeoutMinutes: number;
    setTimeoutMinutes: (val: number) => void;
    tags: Tag[];
    setTags: (tags: Tag[]) => void;
    availableServers: ServerType[];
    defaultServerId: string | undefined;
    setDefaultServerId: (val: string | undefined) => void;
    handleSearchServers: (query: string) => void;
    isTemplate: boolean;
    setIsTemplate: (val: boolean) => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
    name, setName, description, setDescription,
    timeoutMinutes, setTimeoutMinutes, tags, setTags,
    availableServers, defaultServerId, setDefaultServerId,
    handleSearchServers, isTemplate, setIsTemplate
}) => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                            <Zap className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Vitals</h2>
                    </div>
                    <div className="grid gap-4 bg-card p-6 rounded-xl border border-border">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Pipeline Identification</label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Master Production Deployment"
                                className="bg-background border-border h-10 text-sm font-medium focus:ring-1 focus:ring-primary/30"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Operational Description</label>
                            <Input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What is the objective of this automation?"
                                className="bg-background border-border h-10 text-sm font-medium"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Execution Timeout (Minutes)</label>
                            <Input
                                type="number"
                                min="0"
                                value={timeoutMinutes}
                                onChange={(e) => setTimeoutMinutes(parseInt(e.target.value) || 0)}
                                placeholder="Default: 15 (0 for unlimited)"
                                className="bg-background border-border h-10 text-sm font-medium"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Organize Tags</label>
                            <TagSelector selectedTags={tags} onChange={setTags} />
                        </div>
                    </div>
                </div>

                <div className="col-span-12 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                            <Server className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Execution Context</h2>
                    </div>
                    <div className="bg-card p-6 rounded-xl border border-border">
                        <div className="max-w-md space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Default Target Resource</label>
                            <SearchableSelect
                                options={[
                                    { label: '— Select target resource —', value: '' },
                                    ...availableServers.map(s => ({ label: `${s.name} (${s.host})`, value: s.id }))
                                ]}
                                value={defaultServerId || ''}
                                onValueChange={(val) => setDefaultServerId(val || undefined)}
                                onSearch={handleSearchServers}
                                placeholder="— Select target resource —"
                                isSearchable={true}
                                triggerClassName="h-10 text-sm"
                            />
                            <p className="text-[9px] font-medium text-muted-foreground mt-2">
                                Individual steps can still override this setting in the Blueprint tab.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Template Section */}
                <div className="col-span-12 space-y-4 border-t border-border/50 pt-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
                            <Layers className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Template Status</h2>
                    </div>
                    <div className="bg-card p-6 rounded-xl border border-border flex items-center justify-between">
                        <div className="space-y-1 w-3/4">
                            <h3 className="text-[12px] font-black uppercase tracking-widest text-primary">Library Template</h3>
                            <p className="text-[10px] text-muted-foreground font-medium">Enable this option to publish this workflow into the Template Library. This allows other users across namespaces to clone it as a starting point for their own automations.</p>
                        </div>
                        <Switch checked={isTemplate} onCheckedChange={setIsTemplate} />
                    </div>
                </div>
            </div>
        </div>
    );
};
