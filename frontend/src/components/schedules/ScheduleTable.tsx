import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Calendar, Zap, Pause, Play, Edit3, Trash2 } from 'lucide-react';
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
import { Card } from '../ui/card';
import { cn } from '../../lib/utils';
import { Schedule } from '../../types';

import { Pagination } from '../Pagination';

interface ScheduleTableProps {
    schedules: Schedule[];
    isLoading: boolean;
    onEdit: (schedule: Schedule) => void;
    onDelete: (schedule: Schedule) => void;
    onToggleStatus: (id: string) => void;
    total: number;
    offset: number;
    limit: number;
    onPageChange: (offset: number) => void;
}

export const ScheduleTable: React.FC<ScheduleTableProps> = ({
    schedules,
    isLoading,
    onEdit,
    onDelete,
    onToggleStatus,
    total,
    offset,
    limit,
    onPageChange
}) => {
    const navigate = useNavigate();

    return (
        <Card className="border-border bg-card shadow-premium overflow-hidden rounded-2xl">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50 border-border hover:bg-muted/50">
                        <TableHead className="w-[300px] h-14 font-black uppercase tracking-widest text-[9px] px-8">Schedule</TableHead>
                        <TableHead className="font-black uppercase tracking-widest text-[9px]">Timing & Pattern</TableHead>
                        <TableHead className="font-black uppercase tracking-widest text-[9px]">Performance</TableHead>
                        <TableHead className="font-black uppercase tracking-widest text-[9px]">Workflows</TableHead>
                        <TableHead className="font-black uppercase tracking-widest text-[9px]">Created By</TableHead>
                        <TableHead className="text-right h-14 px-8 font-black uppercase tracking-widest text-[9px]">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        <TableRow>
                            <TableCell colSpan={6} className="h-48 text-center bg-transparent">
                                <div className="flex flex-col items-center justify-center gap-3">
                                    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Synchronizing chronometer...</p>
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : schedules.length > 0 ? schedules.map((s) => (
                        <TableRow key={s.id} className="group border-border hover:bg-muted/30 transition-all duration-200">
                            <TableCell className="px-8 py-5">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center border shadow-sm shrink-0 transition-colors",
                                        s.status === 'ACTIVE' ? "bg-emerald-500/10 border-emerald-500/20" : "bg-slate-500/10 border-slate-500/20"
                                    )}>
                                        <Clock className={cn("w-5 h-5", s.status === 'ACTIVE' ? "text-emerald-500" : "text-slate-500")} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p
                                                className="text-sm font-black tracking-tight text-white uppercase cursor-pointer hover:text-primary transition-colors"
                                                onClick={() => navigate(`/schedules/${s.id}`)}
                                            >
                                                {s.name}
                                            </p>
                                            <Badge className={cn(
                                                "font-black text-[8px] uppercase tracking-widest px-1.5 py-0 rounded",
                                                s.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-slate-500/10 text-slate-500 border-slate-500/10"
                                            )}>
                                                {s.status}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Badge variant="outline" className="text-[8px] font-black tracking-widest bg-muted/20 px-1.5 py-0 border-white/5">
                                                {s.type}
                                            </Badge>
                                            <span className="text-[10px] text-muted-foreground font-bold opacity-40">
                                                {s.id.substring(0, 8)}
                                            </span>
                                        </div>
                                        {s.tags && s.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {s.tags.map(tag => (
                                                    <span
                                                        key={tag.id}
                                                        className="px-1.5 py-0.5 rounded text-[8px] font-bold border"
                                                        style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
                                                    >
                                                        {tag.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-muted-foreground/40" />
                                        <span className="text-[11px] font-black text-slate-300">
                                            {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : 'Not set/Finished'}
                                        </span>
                                    </div>
                                    {s.type === 'RECURRING' && (
                                        <code className="text-[9px] font-bold text-indigo-400 font-mono opacity-80">
                                            {s.cron_expression}
                                        </code>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        {s.type === 'ONE_TIME' ? (
                                            <span className={cn(
                                                "text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded",
                                                s.total_runs > 0 ? "bg-indigo-500/10 text-indigo-400" : "bg-muted text-muted-foreground opacity-40"
                                            )}>
                                                {s.total_runs > 0 ? 'EXECUTED' : 'PENDING'}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-black text-emerald-500/80">
                                                RUNS: {s.total_runs}
                                            </span>
                                        )}

                                        {s.last_run_status && (
                                            <Badge className={cn(
                                                "font-black text-[8px] uppercase tracking-widest px-1.5 py-0 rounded",
                                                s.last_run_status === 'SUCCESS' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                    s.last_run_status === 'FAILED' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                        "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                            )}>
                                                {s.last_run_status}
                                            </Badge>
                                        )}
                                    </div>
                                    {s.retries > 0 && (
                                        <span className="text-[9px] font-bold text-amber-500/60 uppercase">
                                            Retries: {s.retries}x
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                    {s.scheduled_workflows?.map(sw => (
                                        <Badge key={sw.id} variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-black text-[8px] px-1.5 py-0.5 rounded-md">
                                            {sw.workflow?.name?.split(' ')[0] || 'Unknown'}
                                        </Badge>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell>
                                {s.created_by_username ? (
                                    <div className="flex items-center gap-1.5">
                                        <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-black text-primary uppercase shrink-0">
                                            {s.created_by_username[0]}
                                        </div>
                                        <span className="text-[10px] font-semibold text-muted-foreground">{s.created_by_username}</span>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-muted-foreground/40 italic">—</span>
                                )}
                            </TableCell>
                            <TableCell className="text-right px-8">
                                <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-xl hover:bg-muted transition-colors text-zinc-400 hover:text-white"
                                        onClick={() => onToggleStatus(s.id)}
                                        title={s.status === 'ACTIVE' ? "Pause" : "Activate"}
                                    >
                                        {s.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-xl hover:bg-muted transition-colors text-zinc-400 hover:text-white"
                                        onClick={() => onEdit(s)}
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-xl hover:bg-muted transition-colors text-zinc-400 hover:text-destructive"
                                        onClick={() => onDelete(s)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground/40 font-black uppercase tracking-[0.2em] text-[10px]">
                                No schedules found
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            <Pagination
                total={total}
                offset={offset}
                limit={limit}
                itemName="Schedules"
                onPageChange={onPageChange}
            />
        </Card>
    );
};
