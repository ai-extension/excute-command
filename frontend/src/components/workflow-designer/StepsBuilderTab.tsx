import React, { useState } from 'react';
import { Layers, Plus, GripVertical, AlertCircle, Server, SlidersHorizontal, File, Trash2, RefreshCw, FileText } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { SearchableSelect } from '../SearchableSelect';
import { cn } from '../../lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu";

import { WorkflowGroup, WorkflowStep, Server as ServerType, Workflow } from '../../types';

interface StepsBuilderTabProps {
    groups: Partial<WorkflowGroup>[];
    setGroups: (groups: Partial<WorkflowGroup>[]) => void;
    availableServers: ServerType[];
    allWorkflows: Workflow[];
    handleDragEnd: (result: DropResult) => void;
    handleAddGroup: () => void;
    handleSearchServers: (query: string) => void;
    handleSearchWorkflows: (query: string) => void;
    id: string | undefined;
}

export const StepsBuilderTab: React.FC<StepsBuilderTabProps> = ({
    groups, setGroups, availableServers, allWorkflows,
    handleDragEnd,
    handleAddGroup,
    handleSearchServers,
    handleSearchWorkflows,
    id
}) => {
    const [openSettingsGroupIdx, setOpenSettingsGroupIdx] = useState<number | null>(null);

    const parentWf = allWorkflows.find(w => w.id === id);
    const parentInputs = parentWf?.inputs || [];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
            {groups.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center gap-4 opacity-50 border-2 border-dashed border-border rounded-2xl bg-card">
                    <Layers className="w-12 h-12 text-muted-foreground" />
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Blueprint is currently empty</p>
                    <Button onClick={handleAddGroup} variant="outline" className="rounded-full px-6">Initialize Architecture</Button>
                </div>
            ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="groups" type="GROUP">
                        {(provided) => (
                            <div
                                className="space-y-6"
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                            >
                                {groups.map((group, gIdx) => (
                                    <Draggable key={group.key || `temp_group_${gIdx}`} draggableId={group.key || `temp_group_${gIdx}`} index={gIdx}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                className={cn(
                                                    "bg-card border rounded-xl overflow-hidden transition-all",
                                                    snapshot.isDragging ? "border-primary/50 shadow-xl shadow-black/20" : "border-border shadow-sm"
                                                )}
                                            >
                                                <div className="px-6 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            {...provided.dragHandleProps}
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing transition-colors"
                                                        >
                                                            <GripVertical className="w-4 h-4" />
                                                        </div>
                                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                                                            <Layers className="w-4 h-4 text-primary" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <Input
                                                                value={group.name}
                                                                onChange={(e) => {
                                                                    const ng = [...groups];
                                                                    ng[gIdx].name = e.target.value;
                                                                    setGroups(ng);
                                                                }}
                                                                className="bg-transparent border border-transparent hover:border-border/50 focus:border-primary/30 focus:bg-background h-7 px-2 -ml-2 rounded-md text-sm font-bold tracking-tight focus-visible:ring-1 focus-visible:ring-primary/20 min-w-[200px] transition-all"
                                                                placeholder="Group Name"
                                                            />
                                                            <div className="flex items-center gap-1 pl-0.5">
                                                                <span className="text-[10px] font-mono text-muted-foreground/50">ID:</span>
                                                                <Input
                                                                    value={group.key || ''}
                                                                    onChange={(e) => {
                                                                        const ng = [...groups];
                                                                        ng[gIdx].key = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                                                                        setGroups(ng);
                                                                    }}
                                                                    className="bg-transparent border border-transparent hover:border-border/50 focus:border-primary/30 focus:bg-background h-6 px-1.5 -ml-1.5 rounded-md text-[10px] font-mono text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/20 w-[150px] transition-all"
                                                                    placeholder="group_key"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {/* Active config badges */}
                                                        {(group.condition || group.default_server_id || group.continue_on_failure || group.is_copy_enabled || group.retry_enabled || group.mcp_report_log) && (
                                                            <div className="flex items-center gap-2 mr-2 pr-4 border-r border-border/50">
                                                                {group.mcp_report_log && (
                                                                    <Badge variant="outline" className="h-5 px-2 text-[8px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 border-blue-500/20 whitespace-nowrap">
                                                                        <FileText className="w-3 h-3 mr-1" /> MCP Log
                                                                    </Badge>
                                                                )}
                                                                {group.retry_enabled && (
                                                                    <Badge variant="outline" className="h-5 px-2 text-[8px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border-amber-500/20 whitespace-nowrap">
                                                                        <RefreshCw className="w-3 h-3 mr-1" /> Retry
                                                                    </Badge>
                                                                )}
                                                                {group.continue_on_failure && (
                                                                    <Badge variant="outline" className="h-5 px-2 text-[8px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border-amber-500/20 whitespace-nowrap">
                                                                        <AlertCircle className="w-3 h-3 mr-1" /> Continue
                                                                    </Badge>
                                                                )}
                                                                {group.is_copy_enabled && (
                                                                    <Badge variant="outline" className="h-5 px-2 text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border-emerald-500/20 whitespace-nowrap">
                                                                        <File className="w-3 h-3 mr-1" /> Relay
                                                                    </Badge>
                                                                )}
                                                                {group.condition && (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] font-bold text-amber-500 max-w-[160px] truncate">
                                                                        if {group.condition}
                                                                    </span>
                                                                )}
                                                                {group.default_server_id && (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-500">
                                                                        <Server className="w-3 h-3" />
                                                                        {group.default_server?.name || availableServers.find(s => s.id === group.default_server_id)?.name || group.default_server_id}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                const ng = [...groups];
                                                                ng[gIdx].is_parallel = !ng[gIdx].is_parallel;
                                                                setGroups(ng);
                                                            }}
                                                            className={cn(
                                                                "px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all border",
                                                                group.is_parallel
                                                                    ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                                                                    : "bg-background border-border text-muted-foreground"
                                                            )}
                                                        >
                                                            {group.is_parallel ? 'Parallel' : 'Sequence'}
                                                        </button>
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setOpenSettingsGroupIdx(openSettingsGroupIdx === gIdx ? null : gIdx)}
                                                                className={cn(
                                                                    "h-8 w-8 flex items-center justify-center rounded-md border transition-all",
                                                                    openSettingsGroupIdx === gIdx
                                                                        ? "bg-primary/10 border-primary/30 text-primary"
                                                                        : (group.default_server_id || group.condition)
                                                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                                                            : "bg-background border-border text-muted-foreground hover:text-foreground"
                                                                )}
                                                                title="Group settings"
                                                            >
                                                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                                            </button>
                                                            {/* Floating popup */}
                                                            {openSettingsGroupIdx === gIdx && (
                                                                <>
                                                                    {/* Backdrop */}
                                                                    <div
                                                                        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                                                                        onClick={() => setOpenSettingsGroupIdx(null)}
                                                                    />
                                                                    {/* Popup card */}
                                                                    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-4xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto glass rounded-2xl shadow-2xl shadow-indigo-500/10 animate-in fade-in zoom-in-95 duration-200 border-none flex flex-col">
                                                                        {/* Header with Premium Gradient */}
                                                                        <div className="px-6 py-5 flex items-center justify-between text-white rounded-t-2xl shrink-0">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                                                                                    <SlidersHorizontal className="w-5 h-5" />
                                                                                </div>

                                                                                <div className="flex flex-col px-2 pt-3">
                                                                                    <span className="text-[16px] backdrop-blur-sm font-mono">{group.name}</span>
                                                                                    <span className="text-[9px] opacity-60 mt-1 font-mono">{group.key}</span>
                                                                                </div>

                                                                            </div>

                                                                        </div>

                                                                        <div className="px-8 py-3 grid grid-cols-1 lg:grid-cols-2 gap-8 custom-scrollbar">
                                                                            {/* Left Column: Logic & Routing */}
                                                                            <div className="space-y-8">
                                                                                <section className="space-y-4">
                                                                                    <div className="flex items-center gap-2 mb-2">
                                                                                        <div className="w-1 h-4 bg-amber-500 rounded-full" />
                                                                                        <h4 className="text-[11px] font-black uppercase tracking-widest text-foreground/70">Execution Logic</h4>
                                                                                    </div>

                                                                                    {/* Condition */}
                                                                                    <div className="space-y-3 p-5 bg-background border border-border/50 rounded-xl shadow-sm">
                                                                                        <div className="flex items-center justify-between">
                                                                                            <label className="text-[10px] font-bold text-amber-600 flex items-center gap-1.5 uppercase tracking-wider">
                                                                                                <AlertCircle className="w-3.5 h-3.5" />
                                                                                                Active Condition
                                                                                            </label>
                                                                                            <span className="text-[9px] font-mono text-muted-foreground/50">Pongo2 Syntax</span>
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={group.condition || ''}
                                                                                            onChange={(e) => {
                                                                                                const ng = [...groups];
                                                                                                ng[gIdx].condition = e.target.value;
                                                                                                setGroups(ng);
                                                                                            }}
                                                                                            placeholder="e.g. input.env == 'prod'"
                                                                                            className="w-full h-10 px-4 text-xs font-mono rounded-lg border border-border bg-muted/30 text-amber-600 placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/40 outline-none transition-all"
                                                                                        />
                                                                                        <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/10">
                                                                                            <p className="text-[10px] text-amber-700/70 leading-relaxed">
                                                                                                Skip this group unless the condition is met.
                                                                                                <br />
                                                                                                <span className="opacity-50 text-[9px]">Use: <code className="bg-white/50 px-1 rounded">input.key</code>, <code className="bg-white/50 px-1 rounded">variable.key</code>, <code className="bg-white/50 px-1 rounded">step.key.status</code>.</span>
                                                                                            </p>
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Server override */}
                                                                                    <div className="space-y-3 p-5 bg-background border border-border/50 rounded-xl shadow-sm">
                                                                                        <label className="text-[10px] font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                                                                                            <Server className="w-3.5 h-3.5" />
                                                                                            Server Override
                                                                                        </label>
                                                                                        <SearchableSelect
                                                                                            options={[
                                                                                                { label: '— Use workflow default —', value: '' },
                                                                                                ...(group.default_server && !availableServers.some(s => s.id === group.default_server_id)
                                                                                                    ? [{ label: `${group.default_server.name} (${group.default_server.host || group.default_server.id})`, value: group.default_server_id as string }]
                                                                                                    : []),
                                                                                                ...availableServers.map(s => ({ label: `${s.name} (${s.host})`, value: s.id }))
                                                                                            ]}
                                                                                            value={group.default_server_id || ''}
                                                                                            onValueChange={(val) => {
                                                                                                const ng = [...groups];
                                                                                                ng[gIdx].default_server_id = val || undefined;
                                                                                                setGroups(ng);
                                                                                            }}
                                                                                            onSearch={handleSearchServers}
                                                                                            placeholder="— Use workflow default —"
                                                                                            isSearchable={true}
                                                                                            triggerClassName="h-10 text-xs rounded-lg border-border/50"
                                                                                        />
                                                                                    </div>
                                                                                </section>
                                                                            </div>

                                                                            {/* Right Column: Policies & Toggles */}
                                                                            <div className="space-y-6">
                                                                                <div className="flex items-center gap-2 mb-2">
                                                                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                                                                    <h4 className="text-[11px] font-black uppercase tracking-widest text-foreground/70">Safety & Compliance</h4>
                                                                                </div>

                                                                                <div className="grid grid-cols-1 gap-4">
                                                                                    {/* Toggles Grid */}
                                                                                    <div className="p-5 bg-background border border-border/50 rounded-xl shadow-sm space-y-5">
                                                                                        {/* MCP Log Reporting */}
                                                                                        <div className="flex items-center justify-between">
                                                                                            <div className="flex items-center gap-3">
                                                                                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                                                                    <FileText className="w-4 h-4 text-blue-500" />
                                                                                                </div>
                                                                                                <div className="flex flex-col">
                                                                                                    <span className="text-xs font-bold text-foreground/80 leading-none">MCP Detailed Logs</span>
                                                                                                    <span className="text-[10px] text-muted-foreground mt-1">Include raw step logs in reports</span>
                                                                                                </div>
                                                                                            </div>
                                                                                            <Switch
                                                                                                checked={!!group.mcp_report_log}
                                                                                                onCheckedChange={(checked) => {
                                                                                                    const ng = [...groups];
                                                                                                    ng[gIdx].mcp_report_log = checked;
                                                                                                    setGroups(ng);
                                                                                                }}
                                                                                            />
                                                                                        </div>

                                                                                        {/* Continue on Failure */}
                                                                                        <div className="flex items-center justify-between">
                                                                                            <div className="flex items-center gap-3">
                                                                                                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                                                                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                                                                                </div>
                                                                                                <div className="flex flex-col">
                                                                                                    <span className="text-xs font-bold text-foreground/80 leading-none">Fault Tolerance</span>
                                                                                                    <span className="text-[10px] text-muted-foreground mt-1 text-left">Continue workflow even if group fails</span>
                                                                                                </div>
                                                                                            </div>
                                                                                            <Switch
                                                                                                checked={group.continue_on_failure}
                                                                                                onCheckedChange={(checked) => {
                                                                                                    const ng = [...groups];
                                                                                                    ng[gIdx].continue_on_failure = checked;
                                                                                                    setGroups(ng);
                                                                                                }}
                                                                                            />
                                                                                        </div>

                                                                                        {/* Retry Policy */}
                                                                                        <div className="pt-5 border-t border-border/50 space-y-4">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <div className="flex items-center gap-3">
                                                                                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                                                                                        <RefreshCw className="w-4 h-4 text-indigo-500" />
                                                                                                    </div>
                                                                                                    <div className="flex flex-col">
                                                                                                        <span className="text-xs font-bold text-foreground/80 leading-none">Auto-Retry Strategy</span>
                                                                                                        <span className="text-[10px] text-muted-foreground mt-1">Re-run entire group on error</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <Switch
                                                                                                    checked={group.retry_enabled || false}
                                                                                                    onCheckedChange={(checked) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx].retry_enabled = checked;
                                                                                                        if (checked) {
                                                                                                            if (!ng[gIdx].retry_limit) ng[gIdx].retry_limit = 3;
                                                                                                            if (!ng[gIdx].retry_delay) ng[gIdx].retry_delay = 5;
                                                                                                        }
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                />
                                                                                            </div>

                                                                                            {group.retry_enabled && (
                                                                                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200 bg-muted/30 p-4 rounded-xl border border-indigo-500/10 mt-2">
                                                                                                    <div className="space-y-2 text-left">
                                                                                                        <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Max Attempts</label>
                                                                                                        <Input
                                                                                                            type="number"
                                                                                                            value={group.retry_limit || 0}
                                                                                                            onChange={(e) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx].retry_limit = parseInt(e.target.value) || 0;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            className="h-9 text-xs font-mono bg-background"
                                                                                                            min={1} max={10}
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="space-y-2 text-left">
                                                                                                        <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Delay (seconds)</label>
                                                                                                        <Input
                                                                                                            type="number"
                                                                                                            value={group.retry_delay || 0}
                                                                                                            onChange={(e) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx].retry_delay = parseInt(e.target.value) || 0;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            className="h-9 text-xs font-mono bg-background"
                                                                                                            min={0}
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Relay Strategy (Separate Section) */}
                                                                                    <div className="p-5 bg-background border border-border/50 rounded-xl shadow-sm space-y-4">
                                                                                        <div className="flex items-center justify-between">
                                                                                            <div className="flex items-center gap-3">
                                                                                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                                                                    <File className="w-4 h-4 text-emerald-500" />
                                                                                                </div>
                                                                                                <div className="flex flex-col text-left">
                                                                                                    <span className="text-xs font-bold text-foreground/80 leading-none">Relay (SOP Deployment)</span>
                                                                                                    <span className="text-[10px] text-muted-foreground mt-1">Copy files after group success</span>
                                                                                                </div>
                                                                                            </div>
                                                                                            <Switch
                                                                                                checked={group.is_copy_enabled}
                                                                                                onCheckedChange={(checked) => {
                                                                                                    const ng = [...groups];
                                                                                                    ng[gIdx].is_copy_enabled = checked;
                                                                                                    setGroups(ng);
                                                                                                }}
                                                                                            />
                                                                                        </div>

                                                                                        {group.is_copy_enabled && (
                                                                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 pt-4 border-t border-border/50">
                                                                                                <div className="space-y-2 text-left">
                                                                                                    <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Source Artifact Path</label>
                                                                                                    <Input
                                                                                                        value={group.copy_source_path || ''}
                                                                                                        onChange={(e) => {
                                                                                                            const ng = [...groups];
                                                                                                            ng[gIdx].copy_source_path = e.target.value;
                                                                                                            setGroups(ng);
                                                                                                        }}
                                                                                                        placeholder="/var/www/html/dist"
                                                                                                        className="h-9 text-xs font-mono bg-background"
                                                                                                    />
                                                                                                </div>
                                                                                                <div className="grid grid-cols-2 gap-4">
                                                                                                    <div className="space-y-2 text-left">
                                                                                                        <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Destination Server</label>
                                                                                                        <SearchableSelect
                                                                                                            options={[
                                                                                                                ...(group.copy_target_server && !availableServers.some(s => s.id === group.copy_target_server_id)
                                                                                                                    ? [{ label: group.copy_target_server.name, value: group.copy_target_server_id as string }]
                                                                                                                    : []),
                                                                                                                ...availableServers.map(s => ({ label: s.name, value: s.id }))
                                                                                                            ]}
                                                                                                            value={group.copy_target_server_id || ''}
                                                                                                            onValueChange={(val) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx].copy_target_server_id = val;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            onSearch={handleSearchServers}
                                                                                                            placeholder="Server"
                                                                                                            triggerClassName="h-9 text-xs bg-background"
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="space-y-2 text-left">
                                                                                                        <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Destination Path</label>
                                                                                                        <Input
                                                                                                            value={group.copy_target_path || ''}
                                                                                                            onChange={(e) => {
                                                                                                                const ng = [...groups];
                                                                                                                ng[gIdx].copy_target_path = e.target.value;
                                                                                                                setGroups(ng);
                                                                                                            }}
                                                                                                            placeholder="/opt/app/deploy"
                                                                                                            className="h-9 text-xs font-mono bg-background"
                                                                                                        />
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Footer Action */}
                                                                        <div className="px-8 py-5 glass border-t border-border/50 flex justify-end gap-3 rounded-b-2xl">
                                                                            <Button
                                                                                variant="outline"
                                                                                onClick={() => setOpenSettingsGroupIdx(null)}
                                                                                className="h-10 text-xs font-bold uppercase tracking-widest px-8 rounded-lg"
                                                                            >
                                                                                Discard
                                                                            </Button>
                                                                            <Button
                                                                                onClick={() => setOpenSettingsGroupIdx(null)}
                                                                                className="h-10 text-xs font-bold uppercase tracking-widest px-10 premium-gradient text-white rounded-lg shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                                                                            >
                                                                                Apply changes
                                                                            </Button>
                                                                        </div>
                                                                    </div>

                                                                </>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                            onClick={() => {
                                                                const ng = groups.filter((_, i) => i !== gIdx);
                                                                setGroups(ng);
                                                            }}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <Droppable droppableId={group.key || `temp_group_${gIdx}`} type="STEP">
                                                    {(provided) => (
                                                        <div
                                                            className="p-4 md:p-6 space-y-3"
                                                            {...provided.droppableProps}
                                                            ref={provided.innerRef}
                                                        >
                                                            {group.steps?.map((step, sIdx) => (
                                                                <Draggable key={step.id || `temp_step_${gIdx}_${sIdx}`} draggableId={step.id?.toString() || `temp_step_${gIdx}_${sIdx}`} index={sIdx}>
                                                                    {(provided, snapshot) => (
                                                                        <div
                                                                            ref={provided.innerRef}
                                                                            {...provided.draggableProps}
                                                                            className={cn(
                                                                                "flex items-center gap-4 p-4 rounded-lg border transition-all group/step",
                                                                                snapshot.isDragging ? "bg-card border-primary/40 shadow-lg" : "bg-background/50 border-border/50 hover:bg-background"
                                                                            )}
                                                                        >
                                                                            <div
                                                                                {...provided.dragHandleProps}
                                                                                className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-foreground transition-colors p-1 -ml-2"
                                                                            >
                                                                                <GripVertical className="w-4 h-4" />
                                                                            </div>
                                                                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground font-bold text-[10px] shrink-0 border border-border">
                                                                                {sIdx + 1}
                                                                            </div>
                                                                            <div className="flex-1 grid grid-cols-12 gap-3">
                                                                                <div className="col-span-3 space-y-1">
                                                                                    <label className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Action Label</label>
                                                                                    <Input
                                                                                        value={step.name}
                                                                                        onChange={(e) => {
                                                                                            const ng = [...groups];
                                                                                            ng[gIdx]!.steps![sIdx].name = e.target.value;
                                                                                            setGroups(ng);
                                                                                        }}
                                                                                        className="bg-muted/50 border-border h-8 text-[11px] font-medium rounded-md px-2"
                                                                                    />
                                                                                </div>
                                                                                <div className="col-span-2 space-y-1">
                                                                                    <label className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Type</label>
                                                                                    <select
                                                                                        value={step.action_type || 'COMMAND'}
                                                                                        onChange={(e) => {
                                                                                            const ng = [...groups];
                                                                                            ng[gIdx]!.steps![sIdx].action_type = e.target.value as 'COMMAND' | 'WORKFLOW';
                                                                                            if (e.target.value === 'COMMAND') {
                                                                                                ng[gIdx]!.steps![sIdx].target_workflow_id = undefined;
                                                                                                ng[gIdx]!.steps![sIdx].target_workflow_inputs = undefined;
                                                                                            }
                                                                                            setGroups(ng);
                                                                                        }}
                                                                                        className="h-8 px-2 w-full text-[11px] font-semibold border border-border rounded-md bg-background text-foreground outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
                                                                                    >
                                                                                        <option value="COMMAND">Command</option>
                                                                                        <option value="WORKFLOW">Workflow</option>
                                                                                    </select>
                                                                                </div>
                                                                                <div className="col-span-7 space-y-3">
                                                                                    {(!step.action_type || step.action_type === 'COMMAND') ? (
                                                                                        <div className="space-y-1">
                                                                                            <label className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Execution Sequence</label>
                                                                                            <Textarea
                                                                                                value={step.command_text}
                                                                                                onChange={(e) => {
                                                                                                    const ng = [...groups];
                                                                                                    ng[gIdx]!.steps![sIdx].command_text = e.target.value;
                                                                                                    setGroups(ng);
                                                                                                }}
                                                                                                className="bg-muted/50 border-border min-h-[40px] text-[11px] font-mono rounded-md px-2 py-2 resize-y"
                                                                                                placeholder="Enter command sequence..."
                                                                                            />
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="space-y-2">
                                                                                            <div className="space-y-1">
                                                                                                <label className="text-[8px] font-bold uppercase tracking-widest text-indigo-500">Target Workflow</label>
                                                                                                <SearchableSelect
                                                                                                    options={allWorkflows.filter(w => w.id !== id).map(w => ({
                                                                                                        label: w.name,
                                                                                                        value: w.id
                                                                                                    }))}
                                                                                                    value={step.target_workflow_id || ''}
                                                                                                    onValueChange={(val) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx]!.steps![sIdx].target_workflow_id = val || undefined;
                                                                                                        ng[gIdx]!.steps![sIdx].target_workflow_inputs = undefined;
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                    isSearchable
                                                                                                    onSearch={handleSearchWorkflows}
                                                                                                    placeholder="— Select workflow —"
                                                                                                    searchPlaceholder="Search workflows..."
                                                                                                    triggerClassName="h-8 px-2 w-full text-[11px] font-semibold border-indigo-500/30 rounded-md bg-background text-foreground"
                                                                                                />
                                                                                            </div>
                                                                                            {/* Dynamic inputs for selected target workflow */}
                                                                                            {(() => {
                                                                                                const targetWf = allWorkflows.find(w => w.id === step.target_workflow_id);
                                                                                                if (!targetWf?.inputs?.length) return null;
                                                                                                const parsedInputs: Record<string, string> = (() => {
                                                                                                    try { return JSON.parse(step.target_workflow_inputs || '{}'); } catch { return {}; }
                                                                                                })();
                                                                                                return (
                                                                                                    <div className="space-y-3 bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
                                                                                                        <label className="text-[8px] font-bold uppercase tracking-widest text-indigo-500">Workflow Inputs</label>
                                                                                                        {targetWf.inputs.map(inp => {
                                                                                                            const val = parsedInputs[inp.key] || '';
                                                                                                            const isVariable = val.startsWith('{{') && val.endsWith('}}');

                                                                                                            const updateInput = (newVal: string) => {
                                                                                                                const ng = [...groups];
                                                                                                                const updated = { ...parsedInputs, [inp.key]: newVal };
                                                                                                                ng[gIdx]!.steps![sIdx].target_workflow_inputs = JSON.stringify(updated);
                                                                                                                setGroups(ng);
                                                                                                            };

                                                                                                            if (isVariable) {
                                                                                                                return (
                                                                                                                    <div key={inp.key} className="flex items-center gap-2">
                                                                                                                        <span className="text-[9px] font-mono text-muted-foreground w-20 truncate shrink-0" title={inp.label || inp.key}>{inp.label || inp.key}</span>
                                                                                                                        <div className="flex-1 flex items-center gap-2 bg-background border border-indigo-500/30 rounded px-2 h-7 group/var">
                                                                                                                            <Badge variant="secondary" className="h-5 text-[8px] font-mono bg-indigo-500/10 text-indigo-500 border-indigo-500/20">
                                                                                                                                {val}
                                                                                                                            </Badge>
                                                                                                                            <button
                                                                                                                                onClick={() => updateInput('')}
                                                                                                                                className="ml-auto opacity-0 group-hover/var:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                                                                                                            >
                                                                                                                                <Trash2 className="w-3 h-3" />
                                                                                                                            </button>
                                                                                                                        </div>
                                                                                                                    </div>
                                                                                                                );
                                                                                                            }

                                                                                                            const isForeach = (() => { try { const p = JSON.parse(val); return p?._type === 'foreach'; } catch { return false; } })();
                                                                                                            const foreachVal = isForeach ? JSON.parse(val) : { _type: 'foreach', source: '', template: inp.type === 'multi-input' ? {} : '' };

                                                                                                            return (
                                                                                                                <div key={inp.key} className="space-y-1">
                                                                                                                    <div className="flex items-center justify-between">
                                                                                                                        <span className="text-[9px] font-mono text-muted-foreground truncate" title={inp.label || inp.key}>{inp.label || inp.key}</span>
                                                                                                                        {(inp.type === 'multi-select' || inp.type === 'multi-input') && (
                                                                                                                            <button
                                                                                                                                onClick={() => {
                                                                                                                                    if (isForeach) {
                                                                                                                                        updateInput('[]');
                                                                                                                                    } else {
                                                                                                                                        updateInput(JSON.stringify({ _type: 'foreach', source: '', template: inp.type === 'multi-input' ? {} : '' }));
                                                                                                                                    }
                                                                                                                                }}
                                                                                                                                className={cn(
                                                                                                                                    "text-[7px] font-black uppercase tracking-widest transition-colors",
                                                                                                                                    isForeach ? "text-amber-500" : "text-indigo-500/50 hover:text-indigo-500"
                                                                                                                                )}
                                                                                                                            >
                                                                                                                                {isForeach ? 'Exit Variable' : 'Use Variable'}
                                                                                                                            </button>
                                                                                                                        )}
                                                                                                                    </div>

                                                                                                                    {isForeach ? (
                                                                                                                        <div className="space-y-2 bg-amber-500/5 p-2 rounded border border-amber-500/20">
                                                                                                                            <div className="space-y-1">
                                                                                                                                <label className="text-[7px] font-bold text-amber-500 uppercase">Foreach Array</label>
                                                                                                                                <Input
                                                                                                                                    value={foreachVal.source || ''}
                                                                                                                                    onChange={(e) => {
                                                                                                                                        updateInput(JSON.stringify({ ...foreachVal, source: e.target.value }));
                                                                                                                                    }}
                                                                                                                                    placeholder="{{input.my_array}}"
                                                                                                                                    className="h-7 text-[10px] font-mono border-amber-500/20 bg-background"
                                                                                                                                />
                                                                                                                            </div>
                                                                                                                            <div className="space-y-1">
                                                                                                                                <label className="text-[7px] font-bold text-amber-500 uppercase">Item Template (use {"{{item}}"})</label>
                                                                                                                                {inp.type === 'multi-input' ? (
                                                                                                                                    <div className="space-y-2 p-2 bg-background/50 border border-amber-500/10 rounded">
                                                                                                                                        {(inp.default_value || '').split(',').map(k => k.trim()).filter(Boolean).map(key => {
                                                                                                                                            const currentVal = typeof foreachVal.template === 'object' ? (foreachVal.template[key] || '') : '';

                                                                                                                                            return (
                                                                                                                                                <div key={key} className="flex items-center gap-1">
                                                                                                                                                    <span className="text-[7px] font-bold text-amber-500/70 w-12 truncate">{key}</span>
                                                                                                                                                    <Input
                                                                                                                                                        value={currentVal}
                                                                                                                                                        onChange={(e) => {
                                                                                                                                                            const newTemplate = { ...(typeof foreachVal.template === 'object' ? foreachVal.template : {}), [key]: e.target.value };
                                                                                                                                                            updateInput(JSON.stringify({ ...foreachVal, template: newTemplate }));
                                                                                                                                                        }}
                                                                                                                                                        className="h-6 text-[9px] border-amber-500/20 bg-background"
                                                                                                                                                        placeholder={`{{item}}`}
                                                                                                                                                    />
                                                                                                                                                </div>
                                                                                                                                            );
                                                                                                                                        })}
                                                                                                                                    </div>
                                                                                                                                ) : (
                                                                                                                                    <Input
                                                                                                                                        value={typeof foreachVal.template === 'string' ? foreachVal.template : ''}
                                                                                                                                        onChange={(e) => {
                                                                                                                                            updateInput(JSON.stringify({ ...foreachVal, template: e.target.value }));
                                                                                                                                        }}
                                                                                                                                        placeholder="{{item}}"
                                                                                                                                        className="h-7 text-[10px] font-mono border-amber-500/20 bg-background"
                                                                                                                                    />
                                                                                                                                )}
                                                                                                                            </div>
                                                                                                                        </div>
                                                                                                                    ) : inp.type === 'select' ? (
                                                                                                                        <select
                                                                                                                            value={val}
                                                                                                                            onChange={(e) => updateInput(e.target.value)}
                                                                                                                            className="h-7 px-2 w-full text-[10px] font-semibold border border-indigo-500/20 rounded bg-background text-foreground outline-none focus:ring-1 focus:ring-indigo-500/30 cursor-pointer"
                                                                                                                        >
                                                                                                                            <option value="">— Select —</option>
                                                                                                                            {(inp.default_value || '').split(',').map(o => o.trim()).filter(Boolean).map(o => (
                                                                                                                                <option key={o} value={o}>{o}</option>
                                                                                                                            ))}
                                                                                                                        </select>
                                                                                                                    ) : inp.type === 'multi-select' ? (
                                                                                                                        <div className="flex flex-wrap gap-1 p-1 bg-background border border-indigo-500/20 rounded min-h-[28px]">
                                                                                                                            {(inp.default_value || '').split(',').map(o => o.trim()).filter(Boolean).map(o => {
                                                                                                                                let selected: string[] = [];
                                                                                                                                try { selected = JSON.parse(val || '[]'); } catch { }
                                                                                                                                const isSelected = selected.includes(o);
                                                                                                                                return (
                                                                                                                                    <button
                                                                                                                                        key={o}
                                                                                                                                        onClick={() => {
                                                                                                                                            let next = [...selected];
                                                                                                                                            if (isSelected) next = next.filter(s => s !== o);
                                                                                                                                            else next.push(o);
                                                                                                                                            updateInput(JSON.stringify(next));
                                                                                                                                        }}
                                                                                                                                        className={cn(
                                                                                                                                            "px-1.5 py-0.5 rounded text-[8px] font-bold transition-all border",
                                                                                                                                            isSelected
                                                                                                                                                ? "bg-indigo-500 text-white border-indigo-500"
                                                                                                                                                : "bg-background text-muted-foreground border-border hover:border-indigo-500/50"
                                                                                                                                        )}
                                                                                                                                    >
                                                                                                                                        {o}
                                                                                                                                    </button>
                                                                                                                                );
                                                                                                                            })}
                                                                                                                        </div>
                                                                                                                    ) : inp.type === 'multi-input' ? (
                                                                                                                        <div className="space-y-2 bg-indigo-500/5 p-2 rounded border border-indigo-500/10">
                                                                                                                            {(() => {
                                                                                                                                const keys = (inp.default_value || '').split(',').map(k => k.trim()).filter(Boolean);
                                                                                                                                let rows: any[] = [];
                                                                                                                                try { rows = JSON.parse(val || '[]'); if (!Array.isArray(rows)) rows = [{}]; } catch { rows = [{}]; }
                                                                                                                                if (rows.length === 0) rows = [{}];

                                                                                                                                return (
                                                                                                                                    <>
                                                                                                                                        {rows.map((row, rIdx) => (
                                                                                                                                            <div key={rIdx} className="space-y-1 p-2 bg-background border border-indigo-500/10 rounded relative group/mrow">
                                                                                                                                                {keys.map(k => (
                                                                                                                                                    <div key={k} className="flex items-center gap-1">
                                                                                                                                                        <span className="text-[7px] font-bold text-muted-foreground/50 w-12 truncate">{k}</span>
                                                                                                                                                        <Input
                                                                                                                                                            value={row[k] || ''}
                                                                                                                                                            onChange={(e) => {
                                                                                                                                                                const next = [...rows];
                                                                                                                                                                next[rIdx] = { ...next[rIdx], [k]: e.target.value };
                                                                                                                                                                updateInput(JSON.stringify(next));
                                                                                                                                                            }}
                                                                                                                                                            className="h-6 text-[9px] bg-muted/20 border-border/50"
                                                                                                                                                        />
                                                                                                                                                    </div>
                                                                                                                                                ))}
                                                                                                                                                {rows.length > 1 && (
                                                                                                                                                    <button
                                                                                                                                                        onClick={() => updateInput(JSON.stringify(rows.filter((_, i) => i !== rIdx)))}
                                                                                                                                                        className="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/mrow:opacity-100 transition-opacity"
                                                                                                                                                    >
                                                                                                                                                        <Trash2 className="w-2 h-2" />
                                                                                                                                                    </button>
                                                                                                                                                )}
                                                                                                                                            </div>
                                                                                                                                        ))}
                                                                                                                                        <Button
                                                                                                                                            variant="outline"
                                                                                                                                            size="sm"
                                                                                                                                            onClick={() => updateInput(JSON.stringify([...rows, {}]))}
                                                                                                                                            className="w-full h-6 border-dashed border-indigo-500/30 text-[8px] font-black uppercase tracking-widest bg-background"
                                                                                                                                        >
                                                                                                                                            <Plus className="w-2 h-2 mr-1" /> Add Row
                                                                                                                                        </Button>
                                                                                                                                    </>
                                                                                                                                );
                                                                                                                            })()}
                                                                                                                        </div>
                                                                                                                    ) : (
                                                                                                                        <Input
                                                                                                                            value={val}
                                                                                                                            onChange={(e) => updateInput(e.target.value)}
                                                                                                                            placeholder={`Value or {{input.key}}`}
                                                                                                                            className="h-7 text-[10px] font-mono border-indigo-500/20 bg-background"
                                                                                                                        />
                                                                                                                    )}
                                                                                                                </div>
                                                                                                            );
                                                                                                        })}
                                                                                                    </div>
                                                                                                );
                                                                                            })()}
                                                                                            <div className="flex items-center justify-between gap-2 pt-1">
                                                                                                <div>
                                                                                                    <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Wait for completion</span>
                                                                                                    <p className="text-[8px] text-muted-foreground/50">Off = run asynchronously</p>
                                                                                                </div>
                                                                                                <Switch
                                                                                                    checked={step.wait_to_finish !== false}
                                                                                                    onCheckedChange={(checked) => {
                                                                                                        const ng = [...groups];
                                                                                                        ng[gIdx]!.steps![sIdx].wait_to_finish = checked;
                                                                                                        setGroups(ng);
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-8 w-8 text-muted-foreground/30 hover:text-destructive transition-all"
                                                                                onClick={() => {
                                                                                    const ng = [...groups];
                                                                                    ng[gIdx].steps = ng[gIdx].steps?.filter((_, i) => i !== sIdx);
                                                                                    setGroups(ng);
                                                                                }}
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </Draggable>
                                                            ))}
                                                            {provided.placeholder}

                                                            <Button
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    const ng = [...groups];
                                                                    if (!ng[gIdx].steps) ng[gIdx].steps = [];
                                                                    ng[gIdx].steps!.push({
                                                                        name: `Action ${ng[gIdx].steps!.length + 1}`,
                                                                        command_text: '',
                                                                        order: ng[gIdx].steps!.length
                                                                    } as WorkflowStep);
                                                                    setGroups(ng);
                                                                }}
                                                                className="w-full h-10 border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 rounded-lg transition-all group"
                                                            >
                                                                <Plus className="w-3.5 h-3.5 mr-2 text-muted-foreground group-hover:text-primary" />
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary">Append Execution Step</span>
                                                            </Button>
                                                        </div>
                                                    )}
                                                </Droppable>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                                <div className="justify-center pt-4 flex">
                                    <Button
                                        onClick={handleAddGroup}
                                        variant="outline"
                                        className="h-12 px-8 rounded-xl bg-primary/5 hover:bg-primary/10 text-primary border-primary/20 font-bold uppercase tracking-widest text-[10px] transition-all"
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Extend Module Chain
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Droppable>
                </DragDropContext >
            )}
        </div >
    );
};
