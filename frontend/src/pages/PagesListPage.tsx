import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Plus, Search, MoreVertical, Edit2, Trash2, Globe, Lock, ChevronRight, ExternalLink, Copy, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import { cn } from '../lib/utils';
import { Page } from '../types';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Pagination } from '../components/Pagination';

const PagesListPage = () => {
    const navigate = useNavigate();
    const { activeNamespace } = useNamespace();
    const { apiFetch } = useAuth();

    const [pages, setPages] = useState<Page[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [visibilityFilter, setVisibilityFilter] = useState<string>('ALL');

    const [limit, setLimit] = useState(21);
    const [offset, setOffset] = useState(0);

    const fetchPages = async () => {
        if (!activeNamespace) return;
        setIsLoading(true);
        setError(null);
        try {
            let url = `${API_BASE_URL}/namespaces/${activeNamespace.id}/pages?limit=${limit}&offset=${offset}`;
            if (visibilityFilter === 'PUBLIC') {
                url += `&is_public=true`;
            } else if (visibilityFilter === 'PRIVATE') {
                url += `&is_public=false`;
            }
            if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

            const response = await apiFetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch pages: ${response.statusText}`);
            }
            const data = await response.json();
            setPages(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch pages:', error);
            setError(error instanceof Error ? error.message : 'Failed to load pages');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPages();
    }, [activeNamespace, apiFetch, offset, limit, visibilityFilter]);

    const handleApplyFilter = () => {
        setOffset(0);
        fetchPages();
    };

    const handleCreatePage = async () => {
        if (!activeNamespace) return;

        const newPage: Partial<Page> = {
            title: 'New Page',
            description: 'A new designed page',
            slug: `page-${Math.random().toString(36).substring(2, 7)}`,
            is_public: false,
            layout: JSON.stringify({ components: [] }),
            workflows: []
        };

        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${activeNamespace.id}/pages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPage)
            });
            const data = await response.json();
            if (response.ok) {
                navigate(`/pages/${data.id}/edit`);
            }
        } catch (error) {
            console.error('Failed to create page:', error);
        }
    };

    const handleDeletePage = async (id: string) => {
        if (!confirm('Are you sure you want to delete this page?')) return;

        try {
            const response = await apiFetch(`${API_BASE_URL}/pages/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setPages(pages.filter(p => p.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete page:', error);
        }
    };

    const filteredPages = pages.filter(p => {
        const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.slug.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesVisibility = visibilityFilter === 'ALL' ||
            (visibilityFilter === 'PUBLIC' && p.is_public) ||
            (visibilityFilter === 'PRIVATE' && !p.is_public);
        return matchesSearch && matchesVisibility;
    });

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                            <Layout className="w-6 h-6" />
                        </div>
                        PAGES
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">Design and share interactive workflow dashboards.</p>
                </div>
                <Button onClick={handleCreatePage} className="premium-gradient text-white shadow-premium gap-2 h-11 px-6 rounded-xl font-bold uppercase tracking-widest text-[11px]">
                    <Plus className="w-4 h-4" />
                    Create New Page
                </Button>
            </div>

            <div className="flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search pages by title or slug..."
                        className="pl-10 h-11 bg-card border-border focus:ring-primary/20 rounded-xl"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
                    />
                </div>
                <Button
                    onClick={handleApplyFilter}
                    className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-[11px] shadow-lg shadow-emerald-500/20"
                >
                    Apply Filter
                </Button>
                <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                    <SelectTrigger className="w-40 h-11 bg-card border-border rounded-xl">
                        <SelectValue placeholder="VISIBILITY" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                        <SelectItem value="ALL">ALL VISIBILITY</SelectItem>
                        <SelectItem value="PUBLIC">PUBLIC ONLY</SelectItem>
                        <SelectItem value="PRIVATE">PRIVATE ONLY</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center italic text-muted-foreground opacity-50">
                    Loading your interfaces...
                </div>
            ) : error ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 p-12 border-2 border-dashed border-destructive/20 rounded-3xl bg-destructive/5 animate-in fade-in zoom-in-95 duration-500">
                    <div className="p-4 rounded-2xl bg-destructive/10 text-destructive">
                        <AlertTriangle className="w-10 h-10" />
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-black tracking-tight uppercase">Connection Interrupted</h3>
                        <p className="text-sm text-muted-foreground font-medium max-w-xs mx-auto">
                            {error}
                        </p>
                    </div>
                    <Button
                        onClick={() => window.location.reload()}
                        variant="outline"
                        className="rounded-xl px-8 h-12 font-bold uppercase tracking-widest text-[11px] border-destructive/20 hover:bg-destructive/10"
                    >
                        Retry Connection
                    </Button>
                </div>
            ) : pages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-50 border-2 border-dashed border-border rounded-2xl bg-card">
                    <Layout className="w-12 h-12 text-muted-foreground" />
                    <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">No pages found</p>
                    <Button onClick={handleCreatePage} variant="outline" className="rounded-full px-6">Create your first page</Button>
                </div>
            ) : (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pages.map(page => (
                            <div key={page.id} className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/5 relative overflow-hidden flex flex-col">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex flex-col gap-1">
                                        <h3 className="text-lg font-bold group-hover:text-primary transition-colors">{page.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-[10px] font-mono py-0 h-5 lowercase bg-muted/50">
                                                /{page.slug}
                                            </Badge>
                                            {page.is_public ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-bold uppercase py-0 h-5">
                                                    <Globe className="w-3 h-3 mr-1" /> Public
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] font-bold uppercase py-0 h-5">
                                                    <Lock className="w-3 h-3 mr-1" /> Private
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => navigate(`/pages/${page.id}/edit`)}>
                                            <Edit2 className="w-4 h-4 text-muted-foreground" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:text-destructive" onClick={() => handleDeletePage(page.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <p className="text-sm text-muted-foreground line-clamp-2 mb-6 h-10">
                                    {page.description || 'No description provided.'}
                                </p>

                                <div className="mt-auto flex items-center justify-between pt-4 border-t border-border/50">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                        {page.workflows?.length || 0} Workflows
                                    </span>
                                    <div className="flex gap-2">
                                        {page.is_public && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest rounded-lg"
                                                onClick={() => window.open(`/public/pages/${page.slug}`, '_blank')}
                                            >
                                                <ExternalLink className="w-3 h-3 mr-2" /> View
                                            </Button>
                                        )}
                                        <Button
                                            className="h-8 px-4 text-[10px] font-bold uppercase tracking-widest rounded-lg premium-gradient text-white"
                                            onClick={() => navigate(`/pages/${page.id}/edit`)}
                                        >
                                            Design <ChevronRight className="w-3 h-3 ml-1" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Pagination
                        total={total}
                        offset={offset}
                        limit={limit}
                        itemName="Pages"
                        onPageChange={setOffset}
                    />
                </div>
            )}
        </div>
    );
};

export default PagesListPage;
