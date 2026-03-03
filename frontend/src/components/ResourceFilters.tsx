import React from 'react';
import { Search, Filter, ChevronDown, Check } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';

export interface FilterConfig {
    key: string;
    placeholder: string;
    options: { label: string; value: string }[];
    width?: string;
}

interface ResourceFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onApply: (search: string, filters: { [key: string]: string }) => void;
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
    const [localSearch, setLocalSearch] = React.useState(searchTerm);
    const [localFilters, setLocalFilters] = React.useState(filters);

    React.useEffect(() => {
        setLocalSearch(searchTerm);
    }, [searchTerm]);

    // Use JSON.stringify as dependency to avoid infinite loops if the filters object 
    // is recreated on every render in the parent component.
    const filtersStr = JSON.stringify(filters);
    React.useEffect(() => {
        setLocalFilters(JSON.parse(filtersStr));
    }, [filtersStr]);

    const handleApply = () => {
        onApply(localSearch, localFilters);
    };

    const getSelectedLabel = (config: FilterConfig) => {
        const val = localFilters[config.key];
        const opt = config.options.find(o => o.value === val);
        return opt ? opt.label : config.placeholder;
    };

    const isFiltered = (config: FilterConfig) => {
        const val = localFilters[config.key];
        // The first option is usually the "ALL" option — if selected or unset, not filtered
        return val && val !== config.options[0]?.value;
    };

    return (
        <div className="flex items-center gap-3 bg-card/60 backdrop-blur-md px-2 py-2 rounded-xl border border-border shadow-premium group/filter transition-all duration-300 hover:border-primary/30">
            {/* Left: search + dropdown filters */}
            <div className="flex flex-1 items-center gap-2 min-w-0">
                {/* Search */}
                <div className="relative w-56 shrink-0 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 transition-all group-focus-within:text-primary" />
                    <Input
                        placeholder={searchPlaceholder}
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                        className="pl-9 h-9 bg-background border-border text-foreground rounded-lg focus-visible:ring-primary/30 placeholder:text-muted-foreground/50 font-medium text-[12px] transition-all focus:border-primary/40 shadow-sm"
                    />
                </div>

                {/* Filter dropdowns as DropdownMenu */}
                {filterConfigs.map((config) => (
                    <DropdownMenu key={config.key}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                className={cn(
                                    "h-9 flex items-center gap-2 px-3 rounded-lg border font-black uppercase tracking-wider text-[10px] transition-all shrink-0",
                                    isFiltered(config)
                                        ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                                        : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-background"
                                )}
                            >
                                {isFiltered(config) && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                )}
                                <span className="truncate max-w-[120px]">{getSelectedLabel(config)}</span>
                                <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-52 bg-popover/95 backdrop-blur-md border-border/60 shadow-xl rounded-xl p-1.5"
                            align="start"
                        >
                            <DropdownMenuLabel className="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">
                                {config.placeholder}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-border/50" />
                            <div className="py-0.5">
                                {config.options.map((option) => {
                                    const isActive = localFilters[config.key] === option.value;
                                    return (
                                        <DropdownMenuItem
                                            key={option.value}
                                            onClick={() => {
                                                setLocalFilters(prev => ({ ...prev, [config.key]: option.value }));
                                                if (onFilterChange) onFilterChange(config.key, option.value);
                                            }}
                                            className={cn(
                                                "px-2.5 py-2 rounded-lg cursor-pointer flex items-center justify-between mb-0.5 last:mb-0 font-bold text-[11px] uppercase tracking-wide transition-all duration-150",
                                                isActive
                                                    ? "bg-primary/15 text-primary"
                                                    : "text-foreground/70 hover:bg-muted/80 hover:text-foreground"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                                    isActive ? "bg-primary shadow-[0_0_6px_rgba(99,102,241,0.6)] scale-125" : "bg-muted-foreground/30"
                                                )} />
                                                <span>{option.label}</span>
                                            </div>
                                            {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                                        </DropdownMenuItem>
                                    );
                                })}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ))}
            </div>

            {/* Right: Apply + primary action */}
            <div className="flex items-center gap-2 shrink-0 border-l border-border/30 pl-3">
                <Button
                    onClick={handleApply}
                    disabled={isLoading}
                    className="px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] shadow-sm transition-all active:scale-95 gap-1.5 shrink-0"
                >
                    <Filter className="w-3 h-3" />
                    {isLoading ? "Syncing..." : "Apply"}
                </Button>

                {primaryAction && (
                    <div className="shrink-0">
                        {primaryAction}
                    </div>
                )}
            </div>
        </div>
    );
};
