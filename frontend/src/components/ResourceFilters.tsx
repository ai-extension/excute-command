import React from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from './ui/select';

export interface FilterConfig {
    key: string;
    placeholder: string;
    options: { label: string; value: string }[];
    width?: string;
}

interface ResourceFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onApply: () => void;
    filters?: { [key: string]: string };
    onFilterChange?: (key: string, value: string) => void;
    filterConfigs?: FilterConfig[];
    primaryAction?: React.ReactNode;
    searchPlaceholder?: string;
    isLoading?: boolean;
}

export const ResourceFilters: React.FC<ResourceFiltersProps> = ({
    searchTerm,
    onSearchChange,
    onApply,
    filters = {},
    onFilterChange,
    filterConfigs = [],
    primaryAction,
    searchPlaceholder = "Search...",
    isLoading = false
}) => {
    return (
        <div className="flex flex-col md:flex-row items-center gap-3 bg-card/40 backdrop-blur-md p-2 rounded-2xl border border-border/50 shadow-premium group/filter transition-all duration-300 hover:border-primary/20">
            <div className="relative flex-1 w-full group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-all group-focus-within:text-primary group-focus-within:scale-110" />
                <Input
                    placeholder={searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onApply()}
                    className="pl-11 h-11 bg-background/50 border-border/50 rounded-xl focus-visible:ring-primary/20 placeholder:text-muted-foreground/40 font-semibold text-sm transition-all focus:bg-background shadow-inner"
                />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {filterConfigs.map((config) => (
                    <Select
                        key={config.key}
                        value={filters[config.key]}
                        onValueChange={(val: string) => onFilterChange?.(config.key, val)}
                    >
                        <SelectTrigger className={cn(
                            "h-11 bg-background/50 border-border/50 rounded-xl px-4 font-bold text-[10px] uppercase tracking-widest hover:bg-background transition-all min-w-[140px]",
                            config.width
                        )}>
                            <SelectValue placeholder={config.placeholder} value={config.options.find(o => o.value === filters[config.key])?.label} />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            {config.options.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ))}

                <Button
                    onClick={onApply}
                    disabled={isLoading}
                    className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-500/20 transition-all active:scale-95 gap-2"
                >
                    <Filter className="w-3.5 h-3.5" />
                    {isLoading ? "Syncing..." : "Apply"}
                </Button>

                {primaryAction && (
                    <div className="flex-shrink-0 ml-auto md:ml-2">
                        {primaryAction}
                    </div>
                )}
            </div>
        </div>
    );
};
