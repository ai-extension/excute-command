import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Plus, Lock, Settings, Trash2, ArrowRight, Check, Search } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
import { Pagination } from '../components/Pagination';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";

const RolesPage = () => {
    const { apiFetch } = useAuth();
    const navigate = useNavigate();
    const [roles, setRoles] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newRoleData, setNewRoleData] = useState({ name: '', description: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [limit, setLimit] = useState(21); // Roles are in 3 columns, 21 is nice
    const [offset, setOffset] = useState(0);

    const fetchRoles = async () => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/roles`);
            const data = await response.json();
            setRoles(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch roles:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    const handleCreateRole = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newRoleData)
            });
            if (response.ok) {
                await fetchRoles();
                setIsCreateOpen(false);
                setNewRoleData({ name: '', description: '' });
            }
        } catch (error) {
            console.error('Failed to create role:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

            <div className="flex flex-row justify-between items-end">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Lock className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Authorization</span>
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter">Access Roles</h1>
                    <p className="text-muted-foreground text-sm font-medium">Define permission groups and security policies.</p>
                </div>

                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="premium-gradient font-black uppercase tracking-widest text-[10px] h-11 px-6 shadow-premium rounded-xl gap-2">
                            <Plus className="w-4 h-4" /> Create Role
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle className="text-2xl">Define New Role</DialogTitle>
                            <DialogDescription>
                                Create a new authorization group with a descriptive title.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateRole} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Role Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Developer"
                                    className="h-12 bg-muted/30 border-border rounded-xl font-semibold"
                                    value={newRoleData.name}
                                    onChange={(e) => setNewRoleData({ ...newRoleData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Description</Label>
                                <Input
                                    id="description"
                                    placeholder="Brief explanation of this role's purpose"
                                    className="h-12 bg-muted/30 border-border rounded-xl font-semibold"
                                    value={newRoleData.description}
                                    onChange={(e) => setNewRoleData({ ...newRoleData, description: e.target.value })}
                                />
                            </div>
                            <DialogFooter className="pt-4">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 w-full shadow-premium rounded-xl"
                                >
                                    {isSubmitting ? "Defining..." : "Save Role"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex items-center gap-4 bg-card p-3 rounded-2xl border border-border shadow-card mb-6">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-all group-focus-within:text-primary" />
                    <Input
                        placeholder="Search roles by name or description..."
                        className="pl-11 h-11 bg-background border-border rounded-xl font-semibold text-sm transition-all focus:bg-muted/30"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-6 flex flex-col">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 flex-1">
                    {roles.length > 0 ? roles
                        .filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()) || (r.description && r.description.toLowerCase().includes(searchTerm.toLowerCase())))
                        .slice(offset, offset + limit)
                        .map((role) => (
                            <Card key={role.id} className="bg-card border-border hover:border-primary/30 transition-all duration-500 group shadow-card hover:shadow-premium overflow-hidden relative">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
                                <CardHeader className="p-6 relative z-10">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/5 transition-transform group-hover:scale-110 group-hover:rotate-3">
                                            <Shield className="w-5 h-5" />
                                        </div>
                                        <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border-border">
                                            {(role.permissions || []).length} PERMISSIONS
                                        </Badge>
                                    </div>
                                    <CardTitle className="text-xl font-black tracking-tight group-hover:text-primary transition-colors">{role.name}</CardTitle>
                                    <CardDescription className="text-xs font-medium leading-relaxed mt-2 italic opacity-70">
                                        {role.description || 'Global access controls for system entities.'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-6 pt-0 relative z-10">
                                    <div className="flex flex-wrap gap-1.5 mt-4 min-h-[60px]">
                                        {(role.permissions || []).slice(0, 5).map((p: any) => (
                                            <Badge key={p.id} className="bg-muted text-muted-foreground font-black text-[8px] uppercase tracking-tighter px-2 rounded-md">
                                                {p.name}
                                            </Badge>
                                        ))}
                                        {(role.permissions || []).length > 5 && (
                                            <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest align-middle pt-1 ml-1">
                                                + {(role.permissions || []).length - 5} more
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 mt-6 pt-6 border-t border-border/50">
                                        <Button
                                            variant="outline"
                                            className="flex-1 h-9 rounded-xl border-border bg-background text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-muted transition-all"
                                            onClick={() => navigate(`/roles/${role.id}/permissions`)}
                                        >
                                            <Settings className="w-3 h-3 mr-2" /> Permissions
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )) : (
                        <div className="col-span-full py-20 bg-card border border-dashed border-border rounded-3xl flex flex-col items-center gap-4 text-center">
                            <div className="p-4 rounded-full bg-muted/50 border border-border">
                                <ShieldAlert className="w-8 h-8 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">No roles configured</p>
                                <p className="text-xs text-muted-foreground/60 font-medium mt-1">Start by defining access levels for your team.</p>
                            </div>
                        </div>
                    )}
                </div>

                {roles.length > 0 && (
                    <div className="mt-8 border-t border-border pt-6">
                        <Pagination
                            total={roles.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()) || (r.description && r.description.toLowerCase().includes(searchTerm.toLowerCase()))).length}
                            offset={offset}
                            limit={limit}
                            itemName="Roles"
                            onPageChange={setOffset}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default RolesPage;
