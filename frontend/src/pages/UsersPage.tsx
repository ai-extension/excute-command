import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Mail, MoreHorizontal, Search, ShieldCheck } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Pagination } from '../components/Pagination';

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

const UsersPage = () => {
    const { apiFetch } = useAuth();
    const [users, setUsers] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isRolesOpen, setIsRolesOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [selectedRoleIDs, setSelectedRoleIDs] = useState<string[]>([]);
    const [newUserData, setNewUserData] = useState({ username: '', password: '', email: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    const fetchUsers = async () => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/users`);
            const data = await response.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchRoles = async () => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/roles`);
            const data = await response.json();
            setRoles(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch roles:', error);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchRoles();
    }, []);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newUserData)
            });
            if (response.ok) {
                await fetchUsers();
                setIsCreateOpen(false);
                setNewUserData({ username: '', password: '', email: '' });
            }
        } catch (error) {
            console.error('Failed to create user:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const openRolesDialog = (user: any) => {
        setSelectedUser(user);
        setSelectedRoleIDs((user.roles || []).map((r: any) => r.id));
        setIsRolesOpen(true);
    };

    const handleUpdateRoles = async () => {
        if (!selectedUser) return;
        setIsSubmitting(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/users/${selectedUser.id}/roles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ role_ids: selectedRoleIDs })
            });
            if (response.ok) {
                await fetchUsers();
                setIsRolesOpen(false);
            }
        } catch (error) {
            console.error('Failed to update roles:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleRole = (roleID: string) => {
        setSelectedRoleIDs(prev =>
            prev.includes(roleID)
                ? prev.filter(id => id !== roleID)
                : [...prev, roleID]
        );
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.roles && u.roles.some((r: any) => r.name.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    const paginatedUsers = filteredUsers.slice(offset, offset + limit);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Manage Roles Dialog */}
            <Dialog open={isRolesOpen} onOpenChange={setIsRolesOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl">Modify Authorization</DialogTitle>
                        <DialogDescription>
                            Assign security roles to <span className="text-primary font-black">{selectedUser?.username}</span>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Available Roles</p>
                        <div className="grid gap-2">
                            {roles.map((role) => (
                                <button
                                    key={role.id}
                                    onClick={() => toggleRole(role.id)}
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 text-left group",
                                        selectedRoleIDs.includes(role.id)
                                            ? "bg-primary/10 border-primary shadow-sm"
                                            : "bg-muted/30 border-border hover:border-primary/30"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                            selectedRoleIDs.includes(role.id) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/20"
                                        )}>
                                            <Shield className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-black text-sm tracking-tight">{role.name}</p>
                                            <p className="text-[10px] font-medium opacity-60 mt-0.5">{role.description || 'No description'}</p>
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                                        selectedRoleIDs.includes(role.id) ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                                    )}>
                                        {selectedRoleIDs.includes(role.id) && <ShieldCheck className="w-3 h-3 text-white" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={handleUpdateRoles}
                            disabled={isSubmitting}
                            className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 w-full shadow-premium rounded-xl"
                        >
                            {isSubmitting ? "Applying Changes..." : "Enforce Authorization"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="flex flex-row justify-between items-end">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Identity & Access</span>
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter">User Directory</h1>
                    <p className="text-muted-foreground text-sm font-medium">Manage system access and account security.</p>
                </div>

                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="premium-gradient font-black uppercase tracking-widest text-[10px] h-11 px-6 shadow-premium rounded-xl gap-2">
                            <UserPlus className="w-4 h-4" /> Add New User
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle className="text-2xl">Create New Identity</DialogTitle>
                            <DialogDescription>
                                Establish a new system user with secure credentials.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateUser} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="username" className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Username</Label>
                                <Input
                                    id="username"
                                    placeholder="e.g. jdoe"
                                    className="h-12 bg-muted/30 border-border rounded-xl font-semibold"
                                    value={newUserData.username}
                                    onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="jdoe@example.com"
                                    className="h-12 bg-muted/30 border-border rounded-xl font-semibold"
                                    value={newUserData.email}
                                    onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-1">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    className="h-12 bg-muted/30 border-border rounded-xl font-semibold"
                                    value={newUserData.password}
                                    onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                                    required
                                />
                            </div>
                            <DialogFooter className="pt-4">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 w-full shadow-premium rounded-xl"
                                >
                                    {isSubmitting ? "Provisioning..." : "Create Identity"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex items-center gap-4 bg-card p-3 rounded-2xl border border-border shadow-card">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-all group-focus-within:text-primary" />
                    <Input
                        placeholder="Search by name, email, or role..."
                        className="pl-11 h-11 bg-background border-border rounded-xl font-semibold text-sm transition-all focus:bg-muted/30"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Card className="border-border bg-card shadow-premium overflow-hidden rounded-2xl">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 border-border hover:bg-muted/50">
                            <TableHead className="w-[300px] h-14 font-black uppercase tracking-widest text-[9px] px-8">Identity</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Authorization Roles</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Last Activity</TableHead>
                            <TableHead className="font-black uppercase tracking-widest text-[9px]">Status</TableHead>
                            <TableHead className="text-right h-14 px-8 font-black uppercase tracking-widest text-[9px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredUsers.length > 0 ? paginatedUsers.map((u) => (
                            <TableRow key={u.id} className="group border-border hover:bg-muted/30 transition-all duration-200">
                                <TableCell className="px-8 py-5">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-indigo-500/20 flex items-center justify-center border border-primary/10 shadow-sm shrink-0">
                                            <span className="text-xs font-black text-primary uppercase">{u.username.substring(0, 2)}</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-black tracking-tight flex items-center gap-2">
                                                {u.username}
                                                {u.username === 'admin' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5">
                                                <Mail className="w-3 h-3 opacity-50" /> {u.email || 'no-email@example.com'}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(u.roles || []).map((role: any) => (
                                            <Badge key={role.id} variant="secondary" className="bg-primary/5 text-primary border-primary/20 font-black text-[9px] px-2.5 py-1 rounded-lg">
                                                {role.name.toUpperCase()}
                                            </Badge>
                                        ))}
                                        {(!u.roles || u.roles.length === 0) && <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest italic">Default User</span>}
                                    </div>
                                </TableCell>
                                <TableCell className="text-[11px] font-bold text-muted-foreground/60 italic">
                                    {u.updated_at ? new Date(u.updated_at).toLocaleDateString() : 'Never'}
                                </TableCell>
                                <TableCell>
                                    <Badge className="bg-emerald-500/10 text-emerald-500 border-none font-black text-[9px] px-2.5 py-1 rounded-lg shadow-none">
                                        ACTIVE
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right px-8">
                                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all duration-300">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 rounded-xl hover:bg-primary/10 hover:text-primary transition-colors"
                                            onClick={() => openRolesDialog(u)}
                                        >
                                            <Shield className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-muted text-muted-foreground">
                                            <MoreHorizontal className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center">
                                    <div className="flex flex-col items-center gap-3 opacity-40">
                                        <Users className="w-8 h-8" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">Synchronizing user registry...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                <Pagination
                    total={filteredUsers.length}
                    offset={offset}
                    limit={limit}
                    itemName="Users"
                    onPageChange={setOffset}
                />
            </Card>
        </div>
    );
};

export default UsersPage;
