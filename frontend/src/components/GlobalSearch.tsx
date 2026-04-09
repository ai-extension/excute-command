import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { Search, Zap, Calendar, Loader2 } from 'lucide-react';
import { Workflow, Schedule } from '../types';

export function GlobalSearch({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const navigate = useNavigate();
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [search, setSearch] = useState('');
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onOpenChange(!open);
            }
        };

        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, [open, onOpenChange]);

    useEffect(() => {
        if (!open) {
            setSearch('');
            setWorkflows([]);
            setSchedules([]);
            return;
        }
    }, [open]);

    useEffect(() => {
        if (!activeNamespace || !open) return;

        const fetchResults = async () => {
            setIsLoading(true);
            try {
                // Determine limits, maybe more if one is empty
                const workflowsUrl = search
                    ? `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=5&search=${encodeURIComponent(search)}`
                    : `${API_BASE_URL}/namespaces/${activeNamespace.id}/workflows?limit=5`;

                const schedulesUrl = search
                    ? `${API_BASE_URL}/namespaces/${activeNamespace.id}/schedules?limit=5&search=${encodeURIComponent(search)}`
                    : `${API_BASE_URL}/namespaces/${activeNamespace.id}/schedules?limit=5`;

                const [workflowsRes, schedulesRes] = await Promise.all([
                    apiFetch(workflowsUrl),
                    apiFetch(schedulesUrl)
                ]);

                if (workflowsRes.ok) {
                    const data = await workflowsRes.json();
                    setWorkflows(data.items || (Array.isArray(data) ? data : []));
                }

                if (schedulesRes.ok) {
                    const data = await schedulesRes.json();
                    setSchedules(data.items || (Array.isArray(data) ? data : []));
                }
            } catch (error) {
                console.error('Failed to search:', error);
            } finally {
                setIsLoading(false);
            }
        };

        const timer = setTimeout(() => {
            fetchResults();
        }, 300);

        return () => clearTimeout(timer);
    }, [search, activeNamespace, open, apiFetch]);

    const runCommand = (command: () => void) => {
        onOpenChange(false);
        command();
    };

    return (
        <Command.Dialog
            open={open}
            onOpenChange={onOpenChange}
            label="Global Search"
            className="fixed left-[50%] top-[40%] sm:top-[30%] z-50 w-full max-w-[600px] translate-x-[-50%] translate-y-[-50%] bg-card rounded-2xl shadow-premium border border-border/50 overflow-hidden outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            overlayClassName="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 backdrop-blur-sm"
        >
            <div className="flex flex-col w-full text-foreground h-full max-h-[70vh]">
                <div className="flex items-center border-b border-border/50 px-4">
                    <Search className="w-5 h-5 text-muted-foreground mr-2 shrink-0" />
                    <Command.Input
                        value={search}
                        onValueChange={setSearch}
                        className="flex-1 h-14 bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0 text-sm font-medium"
                        placeholder="Search workflows, schedules..."
                    />
                    {isLoading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin ml-2 shrink-0" />}
                </div>

                <Command.List className="overflow-y-auto w-full p-2 h-full max-h-[60vh] scrollbar-thin scrollbar-thumb-muted-foreground/20">
                    <Command.Empty className="py-6 text-center text-xs text-muted-foreground/70 font-medium">
                        {isLoading ? 'Searching...' : 'No results found.'}
                    </Command.Empty>

                    {workflows.length > 0 && (
                        <Command.Group heading="Workflows" className="px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground/70">
                            {workflows.map((wf) => (
                                <Command.Item
                                    key={`wf-${wf.id}`}
                                    onSelect={() => runCommand(() => navigate(`/workflows/${wf.id}/edit`))}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-default aria-selected:bg-muted aria-selected:text-primary transition-colors mt-1 hover:bg-muted/50 data-[selected=true]:bg-muted data-[selected=true]:text-primary outline-none"
                                >
                                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0">
                                        <Zap className="w-4 h-4 text-indigo-500" />
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-sm font-semibold truncate">{wf.name}</span>
                                        {wf.description && (
                                            <span className="text-xs text-muted-foreground truncate opacity-80">{wf.description}</span>
                                        )}
                                    </div>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}

                    {schedules.length > 0 && (
                        <Command.Group heading="Schedules" className="px-2 py-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground/70 mt-2">
                            {schedules.map((schedule) => (
                                <Command.Item
                                    key={`sch-${schedule.id}`}
                                    onSelect={() => runCommand(() => navigate(`/schedules/${schedule.id}`))}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-default aria-selected:bg-muted aria-selected:text-primary transition-colors mt-1 hover:bg-muted/50 data-[selected=true]:bg-muted data-[selected=true]:text-primary outline-none"
                                >
                                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                                        <Calendar className="w-4 h-4 text-amber-500" />
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-sm font-semibold truncate">{schedule.name}</span>
                                        <span className="text-[11px] text-muted-foreground tracking-tight opacity-80 flex gap-2">
                                            <span className="px-1.5 py-0.5 bg-muted rounded font-bold uppercase">{schedule.type}</span>
                                            <span className="truncate">{schedule.cron_expression || 'One-time execution'}</span>
                                        </span>
                                    </div>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}
                </Command.List>
            </div>
        </Command.Dialog>
    );
}

export default GlobalSearch;
