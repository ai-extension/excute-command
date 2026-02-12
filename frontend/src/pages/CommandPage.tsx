import React, { useState, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Play, ChevronRight, Terminal, Filter, ArrowUpDown, Settings } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';

const CommandPage = () => {
    const { activeNamespace } = useNamespace();
    const { token } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [commands, setCommands] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchCommands = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const url = activeNamespace
                ? `${API_BASE_URL}/commands?namespace_id=${activeNamespace.id}`
                : `${API_BASE_URL}/commands`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            setCommands(data || []);
        } catch (error) {
            console.error('Failed to fetch commands:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCommands();
    }, [activeNamespace]);

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center gap-2 px-1">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em]">
                    <span className="text-primary">Operations</span>
                    <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                    <span className="text-muted-foreground font-black">Workflow Studio</span>
                </div>
            </div>
            <div className="flex items-center justify-between gap-4 bg-card p-2.5 rounded-xl border border-border shadow-card">
                <div className="relative flex-1 max-w-md group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground transition-all group-focus-within:text-primary group-focus-within:scale-110" />
                    <Input
                        placeholder="Search workflows, nodes, or logs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-11 h-9 bg-background border-border rounded-lg focus-visible:ring-primary/20 placeholder:text-muted-foreground/50 font-semibold text-xs transition-all focus:bg-muted/30"
                    />
                </div>
                <div className="flex gap-1.5 items-center">
                    <Button variant="outline" className="h-9 rounded-lg border-border px-3.5 font-black uppercase tracking-tight text-[8.5px] bg-background gap-1 shadow-sm hover:bg-muted transition-all">
                        <Filter className="w-3 h-3" /> Filter
                    </Button>
                    <Button variant="outline" className="h-9 rounded-lg border-border px-3.5 font-black uppercase tracking-tight text-[8.5px] bg-background gap-1 text-primary shadow-sm hover:bg-muted transition-all">
                        <ArrowUpDown className="w-3 h-3" /> Sort
                    </Button>
                    <div className="w-px h-6 bg-border mx-1" />
                    <Button className="h-9 px-5 rounded-lg premium-gradient font-black uppercase tracking-widest text-[9px] shadow-premium hover:shadow-indigo-500/25 transition-all gap-2">
                        <Plus className="w-3.5 h-3.5" />
                        Create Pipeline
                    </Button>
                </div>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden transition-all duration-500">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted hover:bg-muted/80 border-border">
                            <TableHead className="w-[350px] h-12 font-black uppercase tracking-[0.15em] text-[9px] px-6 text-muted-foreground">Pipeline</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Status</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Context</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Activity</TableHead>
                            <TableHead className="text-right h-12 px-6 font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {commands.length > 0 ? commands.map((cmd) => (
                            <TableRow key={cmd.id} className="group border-border hover:bg-muted/40 transition-colors duration-200">
                                <TableCell className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-xl bg-muted/80 flex items-center justify-center shrink-0 border border-border group-hover:border-primary/20 group-hover:scale-110 transition-all duration-500 shadow-sm">
                                            <Terminal className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-[13px] font-black tracking-tight group-hover:text-primary transition-colors">{cmd.name}</p>
                                            <p className="text-[9px] text-muted-foreground font-black uppercase tracking-tighter opacity-70 mt-0.5">
                                                {cmd.steps?.length || 0} Steps • {cmd.id}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "font-black text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-xl border-none",
                                            cmd.status === 'SUCCESS' && "bg-emerald-500/10 text-emerald-500",
                                            cmd.status === 'FAILED' && "bg-destructive/10 text-destructive",
                                            cmd.status === 'PENDING' && "bg-amber-500/10 text-amber-500"
                                        )}
                                    >
                                        {cmd.status === 'SUCCESS' && <div className="w-1 h-1 rounded-full bg-emerald-500 mr-2" />}
                                        {cmd.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center text-[10px] font-black text-indigo-500">
                                            SYS
                                        </div>
                                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">{activeNamespace?.name || 'Global'}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-[11px] font-semibold text-muted-foreground/60 tracking-tight italic">
                                    {cmd.last_run ? new Date(cmd.last_run).toLocaleString() : 'Never'}
                                </TableCell>
                                <TableCell className="text-right px-8">
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors">
                                            <Play className="w-4 h-4 fill-current" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-muted">
                                            <Settings className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-destructive/10 hover:text-destructive">
                                            <MoreHorizontal className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">No pipelines found in this namespace</p>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex justify-center pt-8 border-t border-border mt-auto">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.4em] opacity-40">
                    Workflow Engine v4.2.1-stable • ANTIGRAVITY
                </p>
            </div>
        </div>
    );
};

export default CommandPage;
