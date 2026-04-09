import React, { useState, useMemo } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday,
    addMonths,
    subMonths,
    parseISO,
} from 'date-fns';
import { CronExpressionParser } from 'cron-parser';
import { ChevronLeft, ChevronRight, CalendarClock, Repeat, Clock, Edit3, Play, Pause } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { Schedule } from '../types';

interface ScheduleCalendarProps {
    schedules: Schedule[];
    onEdit: (schedule: Schedule) => void;
    onToggleStatus: (id: string) => void;
    onCreate?: (date: Date) => void;
}

const DOT_COLORS: Record<string, string> = {
    ACTIVE: 'bg-emerald-500',
    PAUSED: 'bg-slate-500',
};

// Compute upcoming days a recurring schedule will run in the displayed month
// (uses next_run_at if available, otherwise skips)
function getOneTimeDayForMonth(schedule: Schedule, year: number, month: number): Date | null {
    if (!schedule.next_run_at) return null;
    const d = parseISO(schedule.next_run_at);
    if (d.getFullYear() === year && d.getMonth() === month) return d;
    return null;
}

const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({ schedules, onEdit, onToggleStatus, onCreate }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [showRecurring, setShowRecurring] = useState(false);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });

    // Build a map: day string -> schedules for that day
    const dayScheduleMap = useMemo(() => {
        const map: Record<string, Schedule[]> = {};

        schedules.forEach(schedule => {
            if (schedule.type === 'ONE_TIME') {
                const d = getOneTimeDayForMonth(schedule, year, month);
                if (d) {
                    const key = format(d, 'yyyy-MM-dd');
                    if (!map[key]) map[key] = [];
                    map[key].push(schedule);
                }
            } else if (showRecurring && schedule.type === 'RECURRING' && schedule.cron_expression) {
                try {
                    days.forEach(day => {
                        try {
                            const interval = CronExpressionParser.parse(schedule.cron_expression!, {
                                currentDate: new Date(day.getTime() - 1000),
                                endDate: new Date(day.getTime() + 86400000 - 1)
                            });
                            interval.next();
                            const key = format(day, 'yyyy-MM-dd');
                            if (!map[key]) map[key] = [];
                            map[key].push(schedule);
                        } catch (e) {
                            // No run on this day
                        }
                    });
                } catch (e) {
                    // Fallback to next_run_at
                    if (schedule.next_run_at) {
                        const d = parseISO(schedule.next_run_at);
                        if (d.getFullYear() === year && d.getMonth() === month) {
                            const key = format(d, 'yyyy-MM-dd');
                            if (!map[key]) map[key] = [];
                            map[key].push(schedule);
                        }
                    }
                }
            }
        });

        return map;
    }, [schedules, year, month, showRecurring]);

    const selectedDaySchedules = selectedDay
        ? (dayScheduleMap[format(selectedDay, 'yyyy-MM-dd')] || [])
        : [];

    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className="flex gap-4 animate-in fade-in duration-300">
            {/* Calendar grid */}
            <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden shadow-premium">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl"
                            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <h2 className="text-sm font-black tracking-tight uppercase">
                            {format(currentDate, 'MMMM yyyy')}
                        </h2>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-xl"
                            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    className="peer sr-only"
                                    checked={showRecurring}
                                    onChange={(e) => setShowRecurring(e.target.checked)}
                                />
                                <div className="w-8 h-4 bg-muted/50 rounded-full peer-checked:bg-primary/20 transition-colors"></div>
                                <div className="absolute left-[2px] w-3 h-3 bg-muted-foreground rounded-full peer-checked:translate-x-4 peer-checked:bg-primary transition-transform"></div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                                Show Cron
                            </span>
                        </label>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] font-black uppercase tracking-widest"
                            onClick={() => setCurrentDate(new Date())}
                        >
                            Today
                        </Button>
                    </div>
                </div>

                {/* Weekday labels */}
                <div className="grid grid-cols-7 border-b border-border">
                    {WEEKDAYS.map(d => (
                        <div key={d} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7">
                    {days.map((day, idx) => {
                        const key = format(day, 'yyyy-MM-dd');
                        const daySchedules = dayScheduleMap[key] || [];
                        const inMonth = isSameMonth(day, currentDate);
                        const selected = selectedDay && isSameDay(day, selectedDay);
                        const today = isToday(day);

                        return (
                            <div
                                key={idx}
                                onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
                                className={cn(
                                    "min-h-[80px] p-2 border-r border-b border-border/50 cursor-pointer transition-all duration-150 group",
                                    !inMonth && "opacity-30",
                                    selected && "bg-primary/8 ring-1 ring-inset ring-primary/30",
                                    !selected && "hover:bg-muted/30",
                                    // Last col no right border
                                    (idx + 1) % 7 === 0 && "border-r-0"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={cn(
                                        "text-xs font-black w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                                        today ? "bg-primary text-white" : "text-muted-foreground group-hover:text-foreground"
                                    )}>
                                        {format(day, 'd')}
                                    </span>
                                </div>

                                {/* Schedule dots / badges */}
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                    {daySchedules.slice(0, 3).map(s => (
                                        <div
                                            key={s.id}
                                            className={cn(
                                                "flex items-center gap-1 px-1 py-0.5 rounded text-[8px] font-bold truncate",
                                                s.status === 'ACTIVE'
                                                    ? "bg-emerald-500/15 text-emerald-400"
                                                    : "bg-slate-500/15 text-slate-400"
                                            )}
                                            title={s.name}
                                        >
                                            {s.type === 'RECURRING'
                                                ? <Repeat className="w-2 h-2 shrink-0" />
                                                : <CalendarClock className="w-2 h-2 shrink-0" />
                                            }
                                            <span className="truncate">{s.name}</span>
                                        </div>
                                    ))}
                                    {daySchedules.length > 3 && (
                                        <span className="text-[8px] text-muted-foreground/50 font-bold px-1">
                                            +{daySchedules.length - 3} more
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Side panel: selected day schedules */}
            <div className={cn(
                "w-72 shrink-0 flex flex-col gap-3 transition-all duration-300",
                !selectedDay && "opacity-50 pointer-events-none"
            )}>
                <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
                    {selectedDay ? (
                        <>
                            <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Selected Day</p>
                                    <p className="text-sm font-black text-foreground">{format(selectedDay, 'EEE, MMM d yyyy')}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1.5">
                                    <Badge variant="outline" className="text-[9px] font-black">
                                        {selectedDaySchedules.length}
                                    </Badge>
                                    {onCreate && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="h-6 text-[9px] font-black px-2 uppercase tracking-widest gap-1 border-border/50 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer relative z-10"
                                            onClick={() => onCreate(selectedDay)}
                                        >
                                            <CalendarClock className="w-3 h-3" /> Create
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {selectedDaySchedules.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">No schedules on this day</p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {selectedDaySchedules.map(s => (
                                        <div
                                            key={s.id}
                                            className="bg-muted/30 rounded-xl p-3 border border-border hover:border-primary/30 transition-all group"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <div className={cn(
                                                            "w-1.5 h-1.5 rounded-full shrink-0",
                                                            s.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-500'
                                                        )} />
                                                        <p className="text-xs font-black truncate">{s.name}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                                        {s.type === 'RECURRING' ? (
                                                            <><Repeat className="w-2.5 h-2.5" />{s.cron_expression}</>
                                                        ) : (
                                                            <><Clock className="w-2.5 h-2.5" />
                                                                {s.next_run_at ? format(parseISO(s.next_run_at), 'HH:mm') : '—'}</>
                                                        )}
                                                    </div>
                                                    <Badge
                                                        className={cn(
                                                            "mt-1.5 text-[7px] font-black uppercase tracking-widest px-1.5 py-0",
                                                            s.status === 'ACTIVE'
                                                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                                : "bg-slate-500/10 text-slate-500 border-slate-500/10"
                                                        )}
                                                    >
                                                        {s.status}
                                                    </Badge>
                                                </div>
                                                <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 rounded-lg"
                                                        onClick={(e) => { e.stopPropagation(); onEdit(s); }}
                                                        title="Edit"
                                                    >
                                                        <Edit3 className="w-3 h-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 rounded-lg"
                                                        onClick={(e) => { e.stopPropagation(); onToggleStatus(s.id); }}
                                                        title={s.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                                                    >
                                                        {s.status === 'ACTIVE'
                                                            ? <Pause className="w-3 h-3" />
                                                            : <Play className="w-3 h-3" />
                                                        }
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-6">
                            <CalendarClock className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                            <p className="text-xs text-muted-foreground">Click a day to see schedules</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ScheduleCalendar;
