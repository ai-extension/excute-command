import React from 'react';
import {
    ChevronRight,
    Search,
    Clock,
    Layers,
    Globe,
    Lock,
    Zap,
    Server
} from 'lucide-react';
import { cn } from '../../lib/utils';
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
    aiGuide: string;
    setAiGuide: (val: string) => void;
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
    isPublic: boolean;
    setIsPublic: (val: boolean) => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
    name, setName, description, setDescription, aiGuide, setAiGuide,
    timeoutMinutes, setTimeoutMinutes, tags, setTags,
    availableServers, defaultServerId, setDefaultServerId,
    handleSearchServers, isTemplate, setIsTemplate,
    isPublic, setIsPublic
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
                            <label className="text-[10px] font-bold uppercase tracking-widest text-primary">AI Agent Guide</label>
                            <textarea
                                value={aiGuide || ''}
                                onChange={(e) => setAiGuide(e.target.value)}
                                placeholder="Instructions for AI agents (MCP) on when to use this workflow and what it does..."
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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

                {/* Template & Status Section */}
                <div className="col-span-12 space-y-4 border-t border-border/50 pt-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
                            <Layers className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">Status & Visibility</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-card p-6 rounded-xl border border-border flex items-center justify-between">
                            <div className="space-y-1 w-3/4">
                                <h3 className="text-[12px] font-black uppercase tracking-widest text-primary">Library Template</h3>
                                <p className="text-[10px] text-muted-foreground font-medium">Enable to publish this workflow into the Template Library for others to clone.</p>
                            </div>
                            <Switch checked={isTemplate} onCheckedChange={setIsTemplate} />
                        </div>
                        <div className={cn(
                            "p-6 rounded-xl border transition-all duration-300 flex items-center justify-between",
                            isPublic
                                ? "bg-indigo-500/5 border-indigo-500/20 shadow-[0_0_15px_-5px_rgba(99,102,241,0.1)]"
                                : "bg-card border-border"
                        )}>
                            <div className="space-y-1 w-3/4">
                                <div className="flex items-center gap-2">
                                    <h3 className={cn(
                                        "text-[12px] font-black uppercase tracking-widest transition-colors",
                                        isPublic ? "text-indigo-500" : "text-amber-500"
                                    )}>
                                        {isPublic ? 'Public Status' : 'Draft Status'}
                                    </h3>
                                    {isPublic ? <Globe className="w-3 h-3 text-indigo-500" /> : <Lock className="w-3 h-3 text-amber-500" />}
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium">Draft workflows are hidden from some views. Mark as Public when ready for general use.</p>
                            </div>
                            <Switch
                                checked={isPublic}
                                onCheckedChange={setIsPublic}
                                className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-amber-500/50"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
