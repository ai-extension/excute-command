import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Save, Loader2, Settings2, Plus, Trash2, Globe, Server, User, Key, Lock, FileText, Database, Calendar, Users, LayoutDashboard, Tag, History, Layout, Zap, Network, Settings } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Search } from "lucide-react";

const CATEGORIES = [
    {
        id: 'management',
        label: 'Management',
        icon: Settings,
        items: [
            { id: 'namespaces', label: 'Namespaces', icon: Globe, path: '/permissions/resource-items?type=namespaces' },
            { id: 'tags', label: 'Tags', icon: Tag, path: '/permissions/resource-items?type=tags' },
        ]
    },
    {
        id: 'operational',
        label: 'Operational',
        icon: Zap,
        items: [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
            { id: 'workflows', label: 'Workflows', icon: FileText, path: '/permissions/resource-items?type=workflows' },
            { id: 'history', label: 'History', icon: History, path: '/permissions/resource-items?type=history' },
            { id: 'variables', label: 'Variables', icon: Database, path: '/permissions/resource-items?type=variables' },
            { id: 'schedules', label: 'Schedules', icon: Calendar, path: '/permissions/resource-items?type=schedules' },
            { id: 'pages', label: 'Pages', icon: Layout, path: '/permissions/resource-items?type=pages' },
        ]
    },
    {
        id: 'global',
        label: 'Global',
        icon: Network,
        items: [
            { id: 'servers', label: 'Servers', icon: Server, path: '/permissions/resource-items?type=servers' },
            { id: 'vpns', label: 'VPNs', icon: Key, path: '/vpns' },
        ]
    },
    {
        id: 'identity',
        label: 'Identity',
        icon: Shield,
        items: [
            { id: 'users', label: 'Users', icon: Users, path: '/users' },
            { id: 'roles', label: 'Roles', icon: Lock, path: '/roles' },
        ]
    },
    {
        id: 'system',
        label: 'System',
        icon: Settings2,
        items: [
            { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
        ]
    }
];

const ACTIONS = ['READ', 'WRITE', 'EXECUTE', 'DELETE'];
const HIERARCHY_ACTIONS = ['RESOURCE_READ', 'RESOURCE_WRITE', 'RESOURCE_EXECUTE', 'RESOURCE_DELETE'];

export default function RolePermissionsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { apiFetch } = useAuth();
    const [role, setRole] = useState<any>(null);
    const [allPermissions, setAllPermissions] = useState<any[]>([]);
    const [rolePerms, setRolePerms] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [namespaces, setNamespaces] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Fetch current role
                const rolesRes = await apiFetch(`${API_BASE_URL}/roles`);
                const rolesDataRaw = await rolesRes.json();
                const rolesData = rolesDataRaw.items || rolesDataRaw || [];

                if (Array.isArray(rolesData)) {
                    const currentRole = rolesData.find((r: any) => r.id === id);
                    if (currentRole) {
                        setRole(currentRole);
                        setRolePerms(currentRole.permissions || []);
                    }
                } else {
                    console.error('Unexpected roles format:', rolesDataRaw);
                }

                // 2. Fetch all permissions
                const permsRes = await apiFetch(`${API_BASE_URL}/permissions`);
                const permsDataRaw = await permsRes.json();
                setAllPermissions(permsDataRaw.items || permsDataRaw || []);

                // 3. Fetch namespaces
                const nsRes = await apiFetch(`${API_BASE_URL}/namespaces`);
                const nsDataRaw = await nsRes.json();
                const nsData = nsDataRaw.items || nsDataRaw || [];
                setNamespaces(Array.isArray(nsData) ? nsData : []);

            } catch (error) {
                console.error('Failed to load role data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (id) {
            fetchData();
        }
    }, [id, apiFetch]);

    const activeNamespaceId = useMemo(() => {
        return namespaces.length > 0 ? namespaces[0].id : null;
    }, [namespaces]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = {
                permissions: rolePerms.map(rp => ({
                    permission_id: rp.permission_id || rp.permission?.id,
                    resource_id: rp.resource_id
                }))
            };

            const res = await apiFetch(`${API_BASE_URL}/roles/${id}/permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                navigate('/roles');
            } else {
                console.error("Failed to save permissions", await res.text());
            }
        } catch (error) {
            console.error('Error saving permissions:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const togglePermission = (permId: string, resourceId: string | null, enabled: boolean) => {
        setRolePerms(prev => {
            if (enabled) {
                const exists = prev.some(rp =>
                    (rp.permission_id === permId || rp.permission?.id === permId) &&
                    (rp.resource_id || null) === (resourceId || null)
                );
                if (exists) return prev;
                return [...prev, { permission_id: permId, resource_id: resourceId }];
            } else {
                return prev.filter(rp =>
                    !((rp.permission_id === permId || rp.permission?.id === permId) && (rp.resource_id || null) === (resourceId || null))
                );
            }
        });
    };

    const isPermEnabled = (permId: string, resourceId: string | null) => {
        return rolePerms.some(rp =>
            (rp.permission_id === permId || rp.permission?.id === permId) &&
            (rp.resource_id || null) === (resourceId || null)
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between bg-card p-6 rounded-3xl border border-border shadow-soft">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/roles')} className="rounded-xl mr-2">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="p-3 bg-primary/10 rounded-2xl">
                        <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter">{role?.name} Permissions</h1>
                        <p className="text-muted-foreground text-sm font-medium mt-1">Define access rules for resources.</p>
                    </div>
                </div>
                <Button onClick={handleSave} disabled={isSaving} className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 px-8 shadow-premium rounded-xl gap-2">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                </Button>
            </div>
            {/* Categorized Permissions List */}
            <div className="space-y-12">
                {CATEGORIES.map((cat) => (
                    <div key={cat.id} className="space-y-4">
                        <div className="flex items-center gap-3 px-2">
                            <div className="p-2 bg-primary/5 rounded-lg border border-primary/10">
                                <cat.icon className="w-4 h-4 text-primary" />
                            </div>
                            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/70">{cat.label} Resources</h2>
                            <div className="h-px flex-1 bg-border/50" />
                        </div>

                        <div className="grid gap-4">
                            {cat.items.map(item => {
                                const perms = allPermissions.filter(p => p.type === item.id);
                                if (perms.length === 0) return null;

                                return (
                                    <ResourceCategoryRow
                                        key={item.id}
                                        category={{ ...item, permissions: perms }}
                                        activeNamespaceId={activeNamespaceId}
                                        isPermEnabled={isPermEnabled}
                                        togglePermission={togglePermission}
                                        rolePerms={rolePerms}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ResourceCategoryRow({ category, activeNamespaceId, isPermEnabled, togglePermission, rolePerms }: any) {
    const { apiFetch } = useAuth();
    const [items, setItems] = useState<any[]>([]);
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<any[] | null>(null);

    const getPermByAction = (action: string) => category.permissions.find((p: any) => p.action === action);

    const addedItemsIds = useMemo(() => {
        const ids = new Set<string>();
        rolePerms.forEach((rp: any) => {
            const pId = rp.permission_id || rp.permission?.id;
            const isInCategory = category.permissions.some((p: any) => p.id === pId);
            if (isInCategory && rp.resource_id) {
                ids.add(rp.resource_id);
            }
        });
        return Array.from(ids);
    }, [rolePerms, category.permissions]);

    const fetchItems = async (search?: string) => {
        setIsLoadingItems(true);
        try {
            const path = category.path;
            let resourcePath = path;

            // Map frontend routes to backend resource types for specific categories
            if (path === '/vpns') resourcePath = '/permissions/resource-items?type=vpns';
            else if (path === '/users') resourcePath = '/permissions/resource-items?type=users';
            else if (path === '/roles') resourcePath = '/permissions/resource-items?type=roles';

            // Settings and dashboard don't have sub-resources
            if (path === '/' || category.id === 'settings') {
                setItems([]);
                setSearchResults([]);
                return;
            }

            const queryParams = new URLSearchParams();
            if (search) queryParams.append('search', search);
            queryParams.append('limit', '20');

            const separator = resourcePath.includes('?') ? '&' : '?';
            const res = await apiFetch(`${API_BASE_URL}${resourcePath}${separator}${queryParams.toString()}`);
            const data = await res.json();
            const fetchedItems = data.items || (Array.isArray(data) ? data : []);

            // Merge with existing items if it's just a name lookup for existing rules
            setItems(prev => {
                const itemMap = new Map();
                prev.forEach(i => itemMap.set(i.id, i));
                fetchedItems.forEach((i: any) => itemMap.set(i.id, i));
                return Array.from(itemMap.values());
            });
            setSearchResults(fetchedItems);
            setHasLoaded(true);
        } catch (e) {
            console.error(`Failed to fetch ${category.id}:`, e);
        } finally {
            setIsLoadingItems(false);
        }
    };

    // Load items once on mount if there are already added items
    useEffect(() => {
        if (addedItemsIds.length > 0 && !hasLoaded && !isLoadingItems) {
            fetchItems();
        }
    }, []);

    // Handle search in dialog
    useEffect(() => {
        if (isDialogOpen) {
            const timer = setTimeout(() => {
                fetchItems(searchTerm);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [searchTerm, isDialogOpen]);

    const isExpanded = addedItemsIds.length > 0;

    const availableItems = useMemo(() => {
        const sourceList = searchResults !== null ? searchResults : items;
        return sourceList.filter((item: any) => !addedItemsIds.includes(item.id));
    }, [searchResults, items, addedItemsIds]);

    return (
        <Card className="border-border shadow-sm overflow-hidden transition-all duration-300">
            <CardHeader className="p-5 flex flex-row items-center justify-between bg-muted/20">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-background rounded-xl border border-border shadow-sm">
                        <category.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-base font-bold tracking-tight">{category.label}</CardTitle>
                        <CardDescription className="text-xs">Manage access to {category.label.toLowerCase()}.</CardDescription>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    {category.id === 'namespaces' || category.id === 'tags' ? (
                        <>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase text-muted-foreground ml-1">Metadata Defaults:</span>
                                <div className="flex items-center gap-3 bg-background px-3 py-1.5 rounded-xl border border-border/50 shadow-xs">
                                    {ACTIONS.map(action => {
                                        const perm = getPermByAction(action);
                                        if (!perm) return null;
                                        return (
                                            <div key={action} className="flex items-center gap-1">
                                                <Checkbox
                                                    id={`all-${category.id}-${action}`}
                                                    checked={isPermEnabled(perm.id, null)}
                                                    onClick={() => togglePermission(perm.id, null, !isPermEnabled(perm.id, null))}
                                                />
                                                <Label htmlFor={`all-${category.id}-${action}`} className="text-[9px] font-bold cursor-pointer">{action}</Label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black uppercase text-primary ml-1">Inherited Access Defaults:</span>
                                <div className="flex items-center gap-3 bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/20 shadow-xs">
                                    {HIERARCHY_ACTIONS.map(action => {
                                        const perm = getPermByAction(action);
                                        if (!perm) return null;
                                        return (
                                            <div key={action} className="flex items-center gap-1">
                                                <Checkbox
                                                    id={`all-${category.id}-${action}`}
                                                    checked={isPermEnabled(perm.id, null)}
                                                    onClick={() => togglePermission(perm.id, null, !isPermEnabled(perm.id, null))}
                                                />
                                                <Label htmlFor={`all-${category.id}-${action}`} className="text-[9px] font-bold text-primary cursor-pointer">{action.replace('RESOURCE_', 'RES ')}</Label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-4 bg-background px-4 py-2 rounded-xl border border-border shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground mr-1">All {category.label}:</span>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 max-w-[400px]">
                                {ACTIONS.map(action => {
                                    const perm = getPermByAction(action);
                                    if (!perm) return null;
                                    return (
                                        <div key={action} className="flex items-center gap-1.5">
                                            <Checkbox
                                                id={`all-${category.id}-${action}`}
                                                checked={isPermEnabled(perm.id, null)}
                                                onClick={() => togglePermission(perm.id, null, !isPermEnabled(perm.id, null))}
                                            />
                                            <Label htmlFor={`all-${category.id}-${action}`} className="text-[10px] font-bold cursor-pointer">{action}</Label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs font-bold gap-2 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                                Add Specific Rules
                                {isLoadingItems && <Loader2 className="w-3 h-3 animate-spin" />}
                                <Plus className="w-3 h-3" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Add specific {category.label.toLowerCase()}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search items..."
                                        className="pl-10 rounded-xl"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    {isLoadingItems && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                        </div>
                                    )}
                                </div>
                                <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                    {availableItems.length > 0 ? (
                                        availableItems.map((item: any) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/50 border border-transparent hover:border-border transition-all group"
                                            >
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold">{item.name || item.title || item.username || item.id}</span>
                                                    <span className="text-[10px] text-muted-foreground font-mono">{item.id}</span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    className="h-8 rounded-lg"
                                                    onClick={() => {
                                                        const readPerm = getPermByAction('READ');
                                                        if (readPerm) togglePermission(readPerm.id, item.id, true);
                                                    }}
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground text-xs italic">
                                            {isLoadingItems ? 'Searching...' : 'No more items found.'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="p-0 border-t border-border animate-in slide-in-from-top-2">
                    <div className="p-5">
                        <div className="border border-border rounded-2xl overflow-hidden shadow-xs">
                            <table className="w-full text-sm border-collapse">
                                <thead className="bg-muted/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest">
                                    {category.id === 'namespaces' || category.id === 'tags' ? (
                                        <>
                                            <tr className="border-b border-border/50">
                                                <th className="p-2 pl-5 bg-background"></th>
                                                <th colSpan={ACTIONS.length} className="p-2 border-l border-border/50 text-center">Item Management</th>
                                                <th colSpan={HIERARCHY_ACTIONS.length} className="p-2 border-l border-primary/20 bg-primary/5 text-primary text-center">Inherited Resource Access</th>
                                                <th className="bg-background"></th>
                                            </tr>
                                            <tr>
                                                <th className="text-left p-3 pl-5 w-1/4">Resource Item</th>
                                                {ACTIONS.map(a => <th key={a} className="p-3 text-center border-l border-border/50">{a}</th>)}
                                                {HIERARCHY_ACTIONS.map(a => <th key={a} className="p-3 text-center border-l border-primary/20 bg-primary/5 text-primary">{a.replace('RESOURCE_', '')}</th>)}
                                                <th className="p-3 w-10 border-l border-border/50"></th>
                                            </tr>
                                        </>
                                    ) : (
                                        <tr>
                                            <th className="text-left p-3 pl-5 w-1/3">Resource Item</th>
                                            {ACTIONS.map(a => <th key={a} className="p-3 text-center">{a}</th>)}
                                            <th className="p-3 w-10"></th>
                                        </tr>
                                    )}
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {addedItemsIds.map(itemId => {
                                        const item = items.find((i: any) => i.id === itemId);
                                        return (
                                            <tr key={itemId} className="hover:bg-muted/10 transition-colors">
                                                <td className="p-3 pl-5 font-bold text-xs">{item?.name || item?.title || item?.username || itemId}</td>
                                                {ACTIONS.map(action => {
                                                    const perm = getPermByAction(action);
                                                    return (
                                                        <td key={action} className="p-3 text-center border-l border-border/50">
                                                            {perm ? (
                                                                <Checkbox
                                                                    checked={isPermEnabled(perm.id, itemId)}
                                                                    onClick={() => togglePermission(perm.id, itemId, !isPermEnabled(perm.id, itemId))}
                                                                />
                                                            ) : <span className="text-muted-foreground/30">-</span>}
                                                        </td>
                                                    );
                                                })}
                                                {(category.id === 'namespaces' || category.id === 'tags') && HIERARCHY_ACTIONS.map(action => {
                                                    const perm = getPermByAction(action);
                                                    return (
                                                        <td key={action} className="p-3 text-center border-l border-primary/20 bg-primary/5">
                                                            {perm ? (
                                                                <Checkbox
                                                                    checked={isPermEnabled(perm.id, itemId)}
                                                                    onClick={() => togglePermission(perm.id, itemId, !isPermEnabled(perm.id, itemId))}
                                                                />
                                                            ) : <span className="text-muted-foreground/30">-</span>}
                                                        </td>
                                                    );
                                                })}
                                                <td className="p-3 pr-5">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="w-7 h-7 text-destructive hover:bg-destructive/10 rounded-lg"
                                                        onClick={() => {
                                                            category.permissions.forEach((p: any) => togglePermission(p.id, itemId, false));
                                                        }}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
