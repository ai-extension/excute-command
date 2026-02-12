import React, { useState } from 'react';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { cn } from '../lib/utils';
import { ChevronDown, Layers, Plus, Check, Globe } from 'lucide-react';
import { Button } from './ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface NamespaceSwitcherProps {
    isCollapsed: boolean;
}

const NamespaceSwitcher = ({ isCollapsed }: NamespaceSwitcherProps) => {
    const { namespaces, activeNamespace, setActiveNamespace, refreshNamespaces } = useNamespace();
    const { token } = useAuth();
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');

    const handleCreateNamespace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim() || !token) return;

        try {
            const response = await fetch(`${API_BASE_URL}/namespaces`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: newName }),
            });
            if (response.ok) {
                const data = await response.json();
                await refreshNamespaces();
                setActiveNamespace(data);
                setNewName('');
                setIsCreating(false);
            }
        } catch (error) {
            console.error('Failed to create namespace:', error);
        }
    };

    return (
        <div className={cn("px-2 mb-2", isCollapsed && "px-0 flex justify-center")}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 py-6 h-12 rounded-xl group transition-all duration-300",
                            "bg-muted/30 border border-border/50 hover:bg-muted/50 hover:border-primary/30 shadow-sm",
                            isCollapsed && "w-12 px-0 justify-center h-12"
                        )}
                    >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                                <Globe className="w-4 h-4 text-primary" />
                            </div>
                            {!isCollapsed && (
                                <div className="flex flex-col items-start overflow-hidden">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 leading-tight">Environment</span>
                                    <span className="text-[13px] font-black tracking-tight truncate w-full">
                                        {activeNamespace?.name || 'Loading...'}
                                    </span>
                                </div>
                            )}
                        </div>
                        {!isCollapsed && <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-180" />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 bg-card border-border shadow-premium rounded-xl p-1.5 ml-2" align="start">
                    <DropdownMenuLabel className="px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Switch Namespace</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-border/50" />
                    <div className="max-h-[200px] overflow-y-auto py-1">
                        {namespaces.map((ns) => (
                            <DropdownMenuItem
                                key={ns.id}
                                onClick={() => setActiveNamespace(ns)}
                                className={cn(
                                    "px-2.5 py-2 rounded-lg cursor-pointer flex items-center justify-between group transition-all duration-200 mb-0.5 last:mb-0",
                                    activeNamespace?.id === ns.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                        activeNamespace?.id === ns.id ? "bg-primary scale-125 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "bg-muted-foreground/30"
                                    )} />
                                    <span className="text-[13px] font-bold tracking-tight">{ns.name}</span>
                                </div>
                                {activeNamespace?.id === ns.id && <Check className="w-3.5 h-3.5" />}
                            </DropdownMenuItem>
                        ))}
                    </div>
                    <DropdownMenuSeparator className="bg-border/50" />
                    {isCreating ? (
                        <form onSubmit={handleCreateNamespace} className="p-2 animate-in fade-in slide-in-from-top-2 duration-300">
                            <input
                                autoFocus
                                className="w-full bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-primary/50 transition-all mb-2"
                                placeholder="Namespace name..."
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                            <div className="flex gap-1.5">
                                <Button type="submit" size="sm" className="flex-1 h-7 text-[10px] font-black uppercase tracking-widest rounded-md">Create</Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreating(false)} className="h-7 text-[10px] font-black uppercase tracking-widest rounded-md">Cancel</Button>
                            </div>
                        </form>
                    ) : (
                        <DropdownMenuItem
                            onClick={(e) => { e.preventDefault(); setIsCreating(true); }}
                            className="px-2.5 py-2 rounded-lg cursor-pointer flex items-center gap-2.5 text-primary hover:bg-primary/10 font-bold transition-all duration-200"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="text-[12px] font-black uppercase tracking-tighter">Add Namespace</span>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};

export default NamespaceSwitcher;
