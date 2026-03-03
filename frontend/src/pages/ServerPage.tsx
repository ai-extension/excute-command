import React, { useState, useEffect } from 'react';
import { Plus, Search, ChevronRight, Server as ServerIcon, Shield, Key, Terminal, MoreHorizontal, Settings, Trash2, Edit2, Play, CheckCircle2, XCircle, Network } from 'lucide-react';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import TerminalLog from '../components/TerminalLog';
import XTerminal from '../components/XTerminal';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Server, VpnConfig } from '../types';
import { Pagination } from '../components/Pagination';

const ServerPage = () => {
    const { apiFetch } = useAuth();
    const [servers, setServers] = useState<Server[]>([]);
    const [total, setTotal] = useState(0);
    const [vpns, setVpns] = useState<VpnConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingServer, setEditingServer] = useState<Server | null>(null);
    const [formData, setFormData] = useState<Partial<Server>>({
        name: '',
        description: '',
        host: '',
        port: 22,
        user: '',
        auth_type: 'PASSWORD',
        password: '',
        private_key: '',
    });
    const [authTypeFilter, setAuthTypeFilter] = useState<string>('ALL');
    const [vpnFilter, setVpnFilter] = useState<string>('ALL');

    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    const [terminalOpen, setTerminalOpen] = useState(false);
    const [activeTerminalServer, setActiveTerminalServer] = useState<Server | null>(null);
    const [terminalSessionID, setTerminalSessionID] = useState<string | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);

    const fetchServers = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let url = `${API_BASE_URL}/servers?limit=${limit}&offset=${offset}`;
            if (authTypeFilter !== 'ALL') url += `&auth_type=${authTypeFilter}`;
            if (vpnFilter !== 'ALL') {
                if (vpnFilter === 'NONE') {
                    url += `&vpn_id=00000000-0000-0000-0000-000000000000`;
                } else {
                    url += `&vpn_id=${vpnFilter}`;
                }
            }
            if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

            const response = await apiFetch(url);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Server error: ${response.status}`);
            }
            const data = await response.json();
            setServers(data.items || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            setError(error instanceof Error ? error.message : 'Failed to connect to the fleet orchestrator');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchVpns = async () => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/vpns`);
            if (!response.ok) {
                console.error(`Failed to fetch vpns: ${response.status}`);
                return;
            }
            const data = await response.json();
            // Handle pagination wrapper if present, otherwise assume array
            const vpnItems = data.items || data || [];
            if (Array.isArray(vpnItems)) {
                setVpns(vpnItems);
            } else {
                setVpns([]);
                console.error('Unexpected vpns format:', data);
            }
        } catch (error) {
            console.error('Failed to fetch vpns:', error);
        }
    };

    useEffect(() => {
        fetchVpns();
    }, []);

    useEffect(() => {
        fetchServers();
    }, [offset, limit, authTypeFilter, vpnFilter]);

    const handleApplyFilter = () => {
        setOffset(0);
        fetchServers();
    };

    const handleOpenForm = (server?: Server) => {
        if (server) {
            setEditingServer(server);
            setFormData({ ...server, vpn_id: server.vpn_id || 'none' });
        } else {
            setEditingServer(null);
            setFormData({
                name: '',
                description: '',
                host: '',
                port: 22,
                user: '',
                auth_type: 'PASSWORD',
                password: '',
                private_key: '',
                vpn_id: 'none'
            });
        }
        setIsFormOpen(true);
    };

    const handleSaveServer = async () => {
        try {
            const url = editingServer
                ? `${API_BASE_URL}/servers/${editingServer.id}`
                : `${API_BASE_URL}/servers`;
            const method = editingServer ? 'PUT' : 'POST';

            const payload = { ...formData };
            if (payload.vpn_id === 'none' || payload.vpn_id === '') {
                payload.vpn_id = undefined;
            }

            const response = await apiFetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setIsFormOpen(false);
                fetchServers();
            }
        } catch (error) {
            console.error('Failed to save server:', error);
        }
    };

    const handleDeleteServer = async (id: string) => {
        if (!confirm('Are you sure you want to delete this server?')) return;
        try {
            await apiFetch(`${API_BASE_URL}/servers/${id}`, {
                method: 'DELETE'
            });
            fetchServers();
        } catch (error) {
            console.error('Failed to delete server:', error);
        }
    };

    const handleOpenTerminal = async (server: Server) => {
        setActiveTerminalServer(server);
        setTerminalOpen(true);
        setTerminalSessionID(null);
        setIsMaximized(false);

        // Automatically start interactive session
        try {
            const response = await apiFetch(`${API_BASE_URL}/servers/${server.id}/terminal`, {
                method: 'POST'
            });
            const data = await response.json();
            if (response.ok) {
                setTerminalSessionID(data.session_id);
            }
        } catch (error) {
            console.error('Failed to start terminal session:', error);
        }
    };



    const filteredServers = servers.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.host.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.user && s.user.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesAuth = authTypeFilter === 'ALL' || s.auth_type === authTypeFilter;
        const matchesVpn = vpnFilter === 'ALL' ||
            (vpnFilter === 'NONE' && !s.vpn_id) ||
            (s.vpn_id === vpnFilter);
        return matchesSearch && matchesAuth && matchesVpn;
    });

    const paginatedServers = filteredServers.slice(offset, offset + limit);

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 px-1">
                <ServerIcon className="w-3.5 h-3.5 text-primary" />
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                    <span className="text-primary">Infrastructure</span>
                    <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                    <span className="text-muted-foreground font-black">Node Fleet</span>
                </div>
            </div>

            {/* Header / Search */}
            <div className="flex items-center justify-between gap-3 bg-card p-2.5 rounded-xl border border-border shadow-card">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground transition-all group-focus-within:text-primary group-focus-within:scale-110" />
                    <Input
                        placeholder="Filter by name, ip, or credentials..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
                        className="pl-11 h-9 bg-background border-border rounded-lg focus-visible:ring-primary/20 placeholder:text-muted-foreground/50 font-semibold text-xs transition-all focus:bg-muted/30"
                    />
                </div>

                <Button
                    onClick={handleApplyFilter}
                    className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-[9px] shadow-lg shadow-emerald-500/20"
                >
                    Apply Filter
                </Button>

                <Select value={authTypeFilter} onValueChange={setAuthTypeFilter}>
                    <SelectTrigger className="w-32 h-9 bg-background border-border rounded-lg text-[10px] font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-primary/20">
                        <SelectValue placeholder="AUTH" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                        <SelectItem value="ALL">ALL AUTH</SelectItem>
                        <SelectItem value="PASSWORD">PASSWORD</SelectItem>
                        <SelectItem value="PUBLIC_KEY">PUB KEY</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={vpnFilter} onValueChange={setVpnFilter}>
                    <SelectTrigger className="w-40 h-9 bg-background border-border rounded-lg text-[10px] font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-primary/20">
                        <SelectValue placeholder="NETWORK" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                        <SelectItem value="ALL">ALL NETS</SelectItem>
                        <SelectItem value="NONE">DIRECT</SelectItem>
                        {vpns.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name.toUpperCase()}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="flex gap-1.5 items-center">
                    <Button
                        onClick={() => handleOpenForm()}
                        className="h-9 px-5 rounded-lg premium-gradient font-black uppercase tracking-widest text-[9px] shadow-premium hover:shadow-indigo-500/25 transition-all gap-2"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Deploy Host
                    </Button>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-8 text-center animate-in fade-in zoom-in-95 duration-300">
                    <div className="inline-flex p-4 rounded-2xl bg-destructive/10 text-destructive mb-4">
                        <XCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-destructive mb-2">Fleet Synchronization Failed</h3>
                    <p className="text-sm font-medium text-muted-foreground mb-6 max-w-md mx-auto">
                        {error}
                    </p>
                    <Button
                        onClick={() => fetchServers()}
                        variant="outline"
                        className="h-10 px-8 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold uppercase tracking-widest text-[10px]"
                    >
                        Retry Uplink
                    </Button>
                </div>
            )}

            {/* Server Grid/Table */}
            <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted hover:bg-muted/80 border-border">
                            <TableHead className="px-6 h-12 font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Managed Host</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Authentication</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Endpoint</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Created By</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground text-right px-6">Operations</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {servers.length > 0 ? servers.map((server) => (
                            <TableRow key={server.id} className="group border-border hover:bg-muted/40 transition-colors">
                                <TableCell className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-muted/80 flex items-center justify-center border border-border group-hover:border-primary/20 group-hover:scale-110 transition-all shadow-sm">
                                            <ServerIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-[13px] font-black tracking-tight">{server.name}</p>
                                            <p className="text-[9px] text-muted-foreground font-black uppercase tracking-tighter opacity-70">
                                                {server.description || 'No description provided'}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {server.auth_type === 'PASSWORD' ? (
                                            <Shield className="w-3.5 h-3.5 text-amber-500" />
                                        ) : (
                                            <Key className="w-3.5 h-3.5 text-indigo-500" />
                                        )}
                                        <span className="text-[11px] font-bold uppercase tracking-widest">
                                            {server.auth_type} ({server.user})
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-mono text-[11px] text-muted-foreground tracking-tight">
                                    <div className="flex flex-col gap-1">
                                        <span>{server.host}:{server.port}</span>
                                        {server.vpn_id && (
                                            <span className="text-[9px] text-primary/70 font-bold uppercase tracking-widest flex items-center gap-1">
                                                <Network className="w-3 h-3" /> via {server.vpn?.name || 'VPN'}
                                            </span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {server.created_by_username ? (
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-black text-primary uppercase shrink-0">
                                                {server.created_by_username[0]}
                                            </div>
                                            <span className="text-[10px] font-semibold text-muted-foreground">{server.created_by_username}</span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] text-muted-foreground/40 italic">—</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right px-6">
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleOpenTerminal(server)}
                                            className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary"
                                        >
                                            <Terminal className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleOpenForm(server)}
                                            className="h-8 w-8 rounded-lg hover:bg-muted"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeleteServer(server.id)}
                                            className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground/40 font-black uppercase tracking-[0.2em] text-[10px]">
                                    {isLoading ? 'Synchronizing Node Records...' : 'No Hosts Registered in Fleet'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                <Pagination
                    total={total}
                    offset={offset}
                    limit={limit}
                    itemName="Servers"
                    onPageChange={setOffset}
                />
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="sm:max-w-[425px] bg-card border-border rounded-2xl shadow-premium">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest">{editingServer ? 'Edit Host Configuration' : 'Register New Host'}</DialogTitle>
                        <DialogDescription className="text-[11px] font-medium opacity-60 uppercase tracking-tighter">
                            Configure SSH connectivity for direct command execution.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right text-[10px] font-black uppercase opacity-60">Identity</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="col-span-3 text-xs font-bold bg-background border-border"
                                placeholder="Prod Server 01"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="host" className="text-right text-[10px] font-black uppercase opacity-60">Endpoint</Label>
                            <div className="col-span-3 flex gap-2">
                                <Input
                                    id="host"
                                    value={formData.host}
                                    onChange={e => setFormData({ ...formData, host: e.target.value })}
                                    className="flex-1 text-xs font-bold bg-background border-border"
                                    placeholder="192.168.1.100"
                                />
                                <Input
                                    type="number"
                                    value={formData.port}
                                    onChange={e => setFormData({ ...formData, port: parseInt(e.target.value) })}
                                    className="w-20 text-xs font-bold bg-background border-border"
                                    placeholder="22"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="user" className="text-right text-[10px] font-black uppercase opacity-60">User</Label>
                            <Input
                                id="user"
                                value={formData.user}
                                onChange={e => setFormData({ ...formData, user: e.target.value })}
                                className="col-span-3 text-xs font-bold bg-background border-border"
                                placeholder="root"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-[10px] font-black uppercase opacity-60">VPN Proxy</Label>
                            <Select
                                value={formData.vpn_id || 'none'}
                                onValueChange={(val: any) => setFormData({ ...formData, vpn_id: val })}
                            >
                                <SelectTrigger className="col-span-3 text-xs font-bold bg-background border-border">
                                    <SelectValue placeholder="Direct Connection (No VPN)" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="none">Direct Connection (No VPN)</SelectItem>
                                    {vpns.map(v => (
                                        <SelectItem key={v.id} value={v.id}>
                                            <div className="flex items-center gap-2">
                                                <Network className="w-3.5 h-3.5" />
                                                <span>{v.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-[10px] font-black uppercase opacity-60">Protocol</Label>
                            <Select
                                value={formData.auth_type}
                                onValueChange={(val: any) => setFormData({ ...formData, auth_type: val })}
                            >
                                <SelectTrigger className="col-span-3 text-xs font-bold bg-background border-border">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                    <SelectItem value="PASSWORD">SSH Password</SelectItem>
                                    <SelectItem value="PUBLIC_KEY">Public Key (RSA/Ed25519)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-[10px] font-black uppercase opacity-60">
                                {formData.auth_type === 'PASSWORD' ? 'Secret' : 'Priv Key'}
                            </Label>
                            {formData.auth_type === 'PASSWORD' ? (
                                <Input
                                    type="password"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    className="col-span-3 text-xs font-bold bg-background border-border"
                                    placeholder="••••••••"
                                />
                            ) : (
                                <Textarea
                                    value={formData.private_key}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, private_key: e.target.value })}
                                    className="col-span-3 text-xs font-mono bg-background border-border resize-none h-24"
                                    placeholder="-----BEGIN RSA PRIVATE KEY-----"
                                />
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsFormOpen(false)}
                            className="text-[10px] font-black uppercase tracking-widest border-border"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveServer}
                            className="premium-gradient shadow-premium text-[10px] font-black uppercase tracking-widest"
                        >
                            Commit Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Terminal Dialog */}
            <Dialog open={terminalOpen} onOpenChange={setTerminalOpen}>
                <DialogContent className={cn(
                    "bg-[#0a0b0e] border-[#1a1c23] border-2 rounded-2xl p-0 overflow-hidden shadow-2xl transition-all duration-300 [&>button]:hidden",
                    isMaximized
                        ? "fixed inset-0 w-screen h-screen max-w-none rounded-none !m-0 border-0 translate-x-0 translate-y-0 left-0 top-0"
                        : "max-w-3xl h-[600px]"
                )}>
                    <div className="flex items-center justify-between pl-4 pr-2 py-3 bg-[#13151b] border-b border-[#1f212a] select-none">
                        <div className="flex items-center gap-4">
                            <div className="flex gap-2 mr-1">
                                <button
                                    onClick={() => setTerminalOpen(false)}
                                    className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-inner hover:bg-[#ff5f56]/80 transition-colors cursor-pointer border border-black/10"
                                    title="Close Session"
                                />
                                <button
                                    onClick={() => setTerminalOpen(false)}
                                    className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-inner hover:bg-[#ffbd2e]/80 transition-colors cursor-pointer border border-black/10"
                                    title="Minimize"
                                />
                                <button
                                    onClick={() => setIsMaximized(!isMaximized)}
                                    className="w-3 h-3 rounded-full bg-[#27c93f] shadow-inner hover:bg-[#27c93f]/80 transition-colors cursor-pointer border border-black/10"
                                    title="Toggle Fullscreen"
                                />
                            </div>
                            <div className="flex items-center gap-3 py-1 px-3 bg-black/30 rounded-full border border-white/5">
                                <Terminal className="w-3.5 h-3.5 text-primary" />
                                <span className="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">
                                    {activeTerminalServer?.name} <span className="text-zinc-600 mx-1">•</span> {activeTerminalServer?.host}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 mr-2">
                                <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    terminalSessionID ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" : "bg-zinc-700"
                                )} />
                                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                                    {terminalSessionID ? 'Session Active' : 'Connecting...'}
                                </span>
                            </div>

                            <Badge variant="outline" className="text-[8px] font-black tracking-[0.2em] border-primary/20 bg-primary/5 text-primary py-0.5 px-2">
                                SSH PTY v1.0
                            </Badge>
                        </div>
                    </div>

                    <div className={cn(
                        "p-1 bg-[#0a0b0e] flex-1",
                        isMaximized ? "h-[calc(100vh-52px)]" : "h-[545px]"
                    )}>
                        {activeTerminalServer && terminalSessionID ? (
                            <XTerminal
                                sessionID={terminalSessionID}
                                isActive={terminalOpen}
                                className="h-full"
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center gap-4">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                                    <Terminal className="w-10 h-10 text-primary relative animate-bounce" />
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-zinc-600">
                                        Handshaking Interface...
                                    </p>
                                    <div className="w-32 h-0.5 bg-zinc-900 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary w-1/3 animate-[shimmer_2s_infinite_linear]" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Footer Status */}
            <div className="flex justify-center pt-8 border-t border-border mt-auto">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.4em] opacity-40">
                    Fleet Management v2.1.0 • ANTIGRAVITY ENGINE
                </p>
            </div>
        </div>
    );
};

export default ServerPage;
