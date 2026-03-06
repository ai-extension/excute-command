import React from 'react';
import { Server as ServerIcon, Terminal, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../ui/table';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Pagination } from '../Pagination';
import { cn } from '../../lib/utils';
import { Server } from '../../types';

interface ServerTableProps {
    servers: Server[];
    isLoading: boolean;
    metrics: { [key: string]: any };
    total: number;
    offset: number;
    limit: number;
    onPageChange: (offset: number) => void;
    onEdit: (server: Server) => void;
    onDelete: (server: Server) => void;
    onOpenTerminal: (server: Server) => void;
}

export const ServerTable: React.FC<ServerTableProps> = ({
    servers,
    isLoading,
    metrics,
    total,
    offset,
    limit,
    onPageChange,
    onEdit,
    onDelete,
    onOpenTerminal
}) => {
    return (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted/80 border-border">
                        <TableHead className="px-6 h-12 font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Managed Host</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Status / Health</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Authentication</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Endpoint</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Created By</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground text-right px-6">Operations</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {servers.length > 0 ? servers.map((server) => (
                        <TableRow key={server.id} className="group border-border hover:bg-muted/40 transition-colors">
                            <TableCell className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-muted/80 flex items-center justify-center border border-border group-hover:border-primary/20 group-hover:scale-110 transition-all shadow-sm">
                                        <ServerIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-[13px] font-black tracking-tight">{server.name}</p>
                                            {server.connection_type === 'LOCAL' && (
                                                <Badge className="bg-primary/10 text-primary border-primary/20 text-[8px] h-4 font-black uppercase tracking-widest px-1.5">System</Badge>
                                            )}
                                        </div>
                                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-tighter opacity-70">
                                            {server.description || 'No description provided'}
                                        </p>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-2 min-w-[140px]">
                                    {metrics[server.id] ? (
                                        <>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-muted-foreground/60">
                                                    <span>CPU</span>
                                                    <span>{Math.round(metrics[server.id].cpu_usage)}%</span>
                                                </div>
                                                <div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            "h-full transition-all duration-500",
                                                            metrics[server.id].cpu_usage > 80 ? "bg-red-500" : metrics[server.id].cpu_usage > 50 ? "bg-amber-500" : "bg-emerald-500"
                                                        )}
                                                        style={{ width: `${metrics[server.id].cpu_usage}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-muted-foreground/60">
                                                    <span>RAM</span>
                                                    <span>{Math.round(metrics[server.id].ram_usage)}%</span>
                                                </div>
                                                <div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            "h-full transition-all duration-500",
                                                            metrics[server.id].ram_usage > 80 ? "bg-red-500" : metrics[server.id].ram_usage > 60 ? "bg-amber-500" : "bg-emerald-500"
                                                        )}
                                                        style={{ width: `${metrics[server.id].ram_usage}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">{metrics[server.id].uptime}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2 animate-pulse">
                                            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/30 italic">Syncing Health...</span>
                                        </div>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border-muted-foreground/20 bg-muted/50">
                                    {server.auth_type}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-black tracking-tight">{server.host}</span>
                                    <span className="text-[9px] font-bold text-muted-foreground">Port {server.port}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                {server.created_by_username ? (
                                    <div className="flex items-center gap-1.5 grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
                                        <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-black text-primary uppercase shrink-0">
                                            {server.created_by_username[0]}
                                        </div>
                                        <span className="text-[10px] font-black tracking-tighter text-muted-foreground uppercase">{server.created_by_username}</span>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground/40 italic">System</span>
                                )}
                            </TableCell>
                            <TableCell className="text-right px-6">
                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onOpenTerminal(server)}
                                        className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary"
                                    >
                                        <Terminal className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={server.connection_type === 'LOCAL'}
                                        onClick={() => onEdit(server)}
                                        className="h-8 w-8 rounded-lg hover:bg-muted disabled:opacity-30"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={server.connection_type === 'LOCAL'}
                                        onClick={() => onDelete(server)}
                                        className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground/40 font-black uppercase tracking-[0.2em] text-[10px]">
                                {isLoading ? 'Synchronizing Node Records...' : 'No Hosts Registered in Fleet'}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            <Pagination
                total={total}
                offset={offset}
                limit={limit}
                itemName="Servers"
                onPageChange={onPageChange}
            />
        </div>
    );
};
