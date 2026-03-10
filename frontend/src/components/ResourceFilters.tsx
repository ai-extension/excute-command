import React from 'react';
import { Search, Filter } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { SearchableSelect, SelectOption } from './SearchableSelect';

export interface FilterConfig {
    key: string;
    placeholder: string;
    options: SelectOption[];
    width?: string;
    type?: 'single' | 'multi';
    isSearchable?: boolean;
    onSearch?: (query: string) => void;
}

interface ResourceFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onApply: (search: string, filters: { [key: string]: any }) => void;
    filters?: { [key: string]: any };
    filterConfigs?: FilterConfig[];
    primaryAction?: React.ReactNode;
    searchPlaceholder?: string;
    isLoading?: boolean;
    onReset?: () => void;
}

export const ResourceFilters: React.FC<ResourceFiltersProps> = ({
    searchTerm,
    onSearchChange,
    onApply,
    filters = {},
    filterConfigs = [],
    primaryAction,
    searchPlaceholder = "Search...",
    isLoading = false,
    onReset
}) => {
    const [localSearch, setLocalSearch] = React.useState(searchTerm);
    const [localFilters, setLocalFilters] = React.useState(filters);

    React.useEffect(() => {
        setLocalSearch(searchTerm);
    }, [searchTerm]);

    const filtersStr = JSON.stringify(filters);
    React.useEffect(() => {
        setLocalFilters(JSON.parse(filtersStr));
    }, [filtersStr]);

    const handleApply = () => {
        onApply(localSearch, localFilters);
    };

    const isFiltered = (config: FilterConfig) => {
        const val = localFilters[config.key];
        if (config.type === 'multi') {
            return Array.isArray(val) && val.length > 0;
        }
        return val && val !== config.options[0]?.value;
    };

    return (
        <div className="flex items-center gap-3 bg-card/60 backdrop-blur-md px-2 py-2 rounded-xl border border-border shadow-premium group/filter transition-all duration-300 hover:border-primary/30">
            <div className="flex flex-1 items-center gap-2 min-w-0">
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

                {filterConfigs.map((config) => (
                    <SearchableSelect
                        key={config.key}
                        options={config.options}
                        value={localFilters[config.key]}
                        onValueChange={(val) => setLocalFilters(prev => ({ ...prev, [config.key]: val }))}
                        placeholder={config.placeholder}
                        isSearchable={config.isSearchable}
                        onSearch={config.onSearch}
                        type={config.type}
                        width={config.width || "w-48"}
                        triggerClassName={cn(
                            "h-9 flex items-center gap-2 px-3 rounded-lg border font-black uppercase tracking-wider text-[10px] transition-all shrink-0",
                            isFiltered(config)
                                ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                                : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-background"
                        )}
                    />
                ))}
            </div>

            <div className="flex items-center gap-2 shrink-0 border-l border-border/30 pl-3">
                <Button
                    onClick={handleApply}
                    disabled={isLoading}
                    className="px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] shadow-sm transition-all active:scale-95 gap-1.5 shrink-0"
                >
                    <Filter className="w-3 h-3" />
                    {isLoading ? "Syncing..." : "Apply"}
                </Button>

                {onReset && (
                    <Button
                        variant="outline"
                        onClick={() => {
                            setLocalSearch('');
                            setLocalFilters({});
                            onReset();
                        }}
                        disabled={isLoading}
                        className="px-4 rounded-lg border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 shrink-0"
                    >
                        Reset
                    </Button>
                )}

                {primaryAction && (
                    <div className="shrink-0">
                        {primaryAction}
                    </div>
                )}
            </div>
        </div>
    );
};
