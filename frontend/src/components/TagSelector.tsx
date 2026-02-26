import React, { useState, useEffect } from 'react';
import { Tag as TagIcon, Check } from 'lucide-react';
import { Button } from './ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { Tag } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { cn } from '../lib/utils';

interface TagSelectorProps {
    selectedTags: Tag[];
    onChange: (tags: Tag[]) => void;
    className?: string;
}

export function TagSelector({ selectedTags, onChange, className }: TagSelectorProps) {
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!activeNamespace) return;
        const fetchTags = async () => {
            setIsLoading(true);
            try {
                const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/tags`);
                const data = await response.json();
                setAvailableTags(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Failed to fetch tags:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTags();
    }, [activeNamespace, apiFetch]);

    const toggleTag = (tag: Tag) => {
        const isSelected = selectedTags.some(t => t.id === tag.id);
        if (isSelected) {
            onChange(selectedTags.filter(t => t.id !== tag.id));
        } else {
            onChange([...selectedTags, tag]);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn("justify-start h-auto min-h-[40px] px-3 py-2 w-full flex-wrap gap-2 text-left font-normal bg-muted/30 border-border rounded-xl", className)}
                >
                    {selectedTags.length > 0 ? (
                        selectedTags.map(tag => (
                            <Badge
                                key={tag.id}
                                variant="outline"
                                className="h-6 text-[10px] font-black"
                                style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
                            >
                                {tag.name}
                            </Badge>
                        ))
                    ) : (
                        <div className="flex items-center gap-2 text-muted-foreground opacity-70">
                            <TagIcon className="w-4 h-4" />
                            <span className="text-xs font-bold tracking-tight">Select Tags</span>
                        </div>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="bg-card border-border shadow-xl z-50 p-1.5 min-w-[200px]"
                style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }}
                align="start"
            >
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider opacity-60">Tags</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isLoading ? (
                    <div className="p-2 text-center text-xs text-muted-foreground">Loading...</div>
                ) : availableTags.length > 0 ? (
                    availableTags.map(tag => {
                        const isSelected = selectedTags.some(t => t.id === tag.id);
                        return (
                            <DropdownMenuCheckboxItem
                                key={tag.id}
                                checked={isSelected}
                                onCheckedChange={() => toggleTag(tag)}
                                className="gap-2 cursor-pointer font-medium"
                            >
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                {tag.name}
                            </DropdownMenuCheckboxItem>
                        );
                    })
                ) : (
                    <div className="p-2 text-center text-xs text-muted-foreground">No tags available</div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
