import React, { useState, useEffect } from 'react';
import { Tag as TagIcon } from 'lucide-react';
import { Badge } from './ui/badge';
import { Tag } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { cn } from '../lib/utils';

interface TagFilterProps {
    selectedTagIds: string[];
    onChange: (ids: string[]) => void;
    className?: string;
}

export function TagFilter({ selectedTagIds, onChange, className }: TagFilterProps) {
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

    const toggleTag = (id: string) => {
        if (selectedTagIds.includes(id)) {
            onChange(selectedTagIds.filter(t => t !== id));
        } else {
            onChange([...selectedTagIds, id]);
        }
    };

    if (isLoading || availableTags.length === 0) return null;

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <TagIcon className="w-4 h-4 text-muted-foreground opacity-50 shrink-0" />
            <div className="w-full overflow-x-auto whitespace-nowrap hide-scrollbar">
                <div className="flex w-max space-x-2 p-1">
                    {availableTags.map(tag => {
                        const isSelected = selectedTagIds.includes(tag.id);
                        return (
                            <Badge
                                key={tag.id}
                                variant="outline"
                                className={cn(
                                    "cursor-pointer transition-all hover:scale-105 active:scale-95",
                                    isSelected ? "ring-2 ring-offset-1" : "opacity-60 hover:opacity-100"
                                )}
                                style={{
                                    backgroundColor: `${tag.color}20`,
                                    color: tag.color,
                                    borderColor: `${tag.color}40`,
                                    ...(isSelected ? { ringColor: tag.color } : {})
                                }}
                                onClick={() => toggleTag(tag.id)}
                            >
                                {tag.name}
                            </Badge>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
