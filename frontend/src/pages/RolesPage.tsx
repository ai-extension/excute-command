import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Plus, Lock, Settings, Trash2, ArrowRight, Check } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

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
    const { token } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [permissions, setPermissions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isPermsOpen, setIsPermsOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<any>(null);
    const [selectedPermIDs, setSelectedPermIDs] = useState<string[]>([]);
    const [newRoleData, setNewRoleData] = useState({ name: '', description: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchRoles = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/roles`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setRoles(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch roles:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPermissions = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/permissions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            setPermissions(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch permissions:', error);
        }
    };

    useEffect(() => {
        fetchRoles();
        fetchPermissions();
    }, []);

    const handleCreateRole = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
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

    const openPermsDialog = (role: any) => {
        setSelectedRole(role);
        setSelectedPermIDs((role.permissions || []).map((p: any) => p.id));
        setIsPermsOpen(true);
    };

    const handleUpdatePermissions = async () => {
        if (!selectedRole) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/roles/${selectedRole.id}/permissions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ permission_ids: selectedPermIDs })
            });
            if (response.ok) {
                await fetchRoles();
                setIsPermsOpen(false);
            }
        } catch (error) {
            console.error('Failed to update permissions:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const togglePermission = (permID: string) => {
        setSelectedPermIDs(prev =>
            prev.includes(permID)
                ? prev.filter(id => id !== permID)
                : [...prev, permID]
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Manage Permissions Dialog */}
            <Dialog open={isPermsOpen} onOpenChange={setIsPermsOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl">Policy Configuration</DialogTitle>
                        <DialogDescription>
                            Configure functional access for the <span className="text-primary font-black">{selectedRole?.name}</span> role.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 space-y-4 max-h-[400px] overflow-y-auto pr-2">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Capability Matrix</p>
                        <div className="grid gap-2">
                            {permissions.map((perm) => (
                                <button
                                    key={perm.id}
                                    onClick={() => togglePermission(perm.id)}
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 text-left group",
                                        selectedPermIDs.includes(perm.id)
                                            ? "bg-primary/5 border-primary/50 shadow-sm"
                                            : "bg-muted/30 border-border hover:border-primary/20"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0",
                                            selectedPermIDs.includes(perm.id) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/10"
                                        )}>
                                            <Settings className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-black text-sm tracking-tight">{perm.name}</p>
                                                <Badge className="text-[8px] px-1.5 h-4 bg-muted text-muted-foreground border-none font-bold uppercase">{perm.type}</Badge>
                                            </div>
                                            <p className="text-[10px] font-medium opacity-60 mt-0.5 tracking-tight uppercase">Action: {perm.action}</p>
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                                        selectedPermIDs.includes(perm.id) ? "bg-primary border-primary" : "border-border group-hover:border-primary/30"
                                    )}>
                                        {selectedPermIDs.includes(perm.id) && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={handleUpdatePermissions}
                            disabled={isSubmitting}
                            className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 w-full shadow-premium rounded-xl"
                        >
                            {isSubmitting ? "Updating Policy..." : "Enforce Capability Matrix"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {roles.length > 0 ? roles.map((role) => (
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
                                    onClick={() => openPermsDialog(role)}
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
        </div>
    );
};

export default RolesPage;
