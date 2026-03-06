import React from 'react';
import { Calendar, ChevronRight, Plus, LayoutList, CalendarDays } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { ResourceFilters } from '../ResourceFilters';

interface ScheduleHeaderProps {
    viewMode: 'list' | 'calendar';
    setViewMode: (mode: 'list' | 'calendar') => void;
    onNewSchedule: () => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    onApplyFilter: (search: string, filters: { [key: string]: any }) => void;
    selectedCreatedBy?: string;
    availableUsers: any[];
    onFetchUsers: (query: string) => Promise<void>;
}

export const ScheduleHeader: React.FC<ScheduleHeaderProps> = ({
    viewMode,
    setViewMode,
    onNewSchedule,
    searchTerm,
    setSearchTerm,
    onApplyFilter,
    selectedCreatedBy,
    availableUsers,
    onFetchUsers
}) => {
    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 px-1">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                    <span className="text-primary">Automations</span>
                    <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                    <span className="text-muted-foreground font-black">Schedules</span>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex bg-muted p-1 rounded-xl border border-border/50">
                        <button
                            onClick={() => setViewMode('list')}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                viewMode === 'list' ? "bg-card text-primary shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <LayoutList className={cn("w-3 h-3", viewMode === 'list' ? "text-primary" : "text-muted-foreground")} />
                            List View
                        </button>
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all gap-2 flex items-center",
                                viewMode === 'calendar' ? "bg-card text-primary shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <CalendarDays className={cn("w-3 h-3", viewMode === 'calendar' ? "text-primary" : "text-muted-foreground")} />
                            Calendar View
                        </button>
                    </div>
                    <Button
                        onClick={onNewSchedule}
                        className="h-9 px-4 rounded-xl premium-gradient text-[10px] font-black uppercase tracking-widest shadow-premium transition-all active:scale-95 gap-2"
                    >
                        <Plus className="w-4 h-4" /> New Schedule
                    </Button>
                </div>

                <ResourceFilters
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    onApply={onApplyFilter}
                    filters={{ createdBy: selectedCreatedBy }}
                    filterConfigs={[
                        {
                            key: 'createdBy',
                            placeholder: 'CREATED BY',
                            type: 'single',
                            isSearchable: true,
                            onSearch: onFetchUsers,
                            options: [
                                { label: 'ALL CREATORS', value: '' },
                                ...availableUsers.map(u => ({ label: u.username.toUpperCase(), value: u.id }))
                            ],
                            width: 'w-48'
                        }
                    ]}
                    searchPlaceholder="Search schedules by name..."
                />
            </div>
        </div>
    );
};
