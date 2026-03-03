import React, { useState, useEffect } from 'react';
import { Plus, Search, ChevronRight, Network, Shield, Key, Edit2, Trash2, XCircle } from 'lucide-react';
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
import { ResourceFilters } from '../components/ResourceFilters';
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
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { VpnConfig } from '../types';
import { Pagination } from '../components/Pagination';

const VpnPage = () => {
    const { apiFetch } = useAuth();
    const [vpns, setVpns] = useState<VpnConfig[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [authTypeFilter, setAuthTypeFilter] = useState<string>('ALL');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingVpn, setEditingVpn] = useState<VpnConfig | null>(null);
    const [formData, setFormData] = useState<Partial<VpnConfig>>({
        name: '',
        description: '',
        host: '',
        port: 22,
        user: '',
        auth_type: 'PASSWORD',
        password: '',
        private_key: ''
    });

    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    const fetchVpns = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let url = `${API_BASE_URL}/vpns?limit=${limit}&offset=${offset}`;
            if (authTypeFilter !== 'ALL') url += `&auth_type=${authTypeFilter}`;
            if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

            const response = await apiFetch(url);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Server error: ${response.status}`);
            }
            const data = await response.json();
            // Handle pagination wrapper if present, otherwise assume array
            const vpnItems = data.items || data || [];
            if (Array.isArray(vpnItems)) {
                setVpns(vpnItems);
                setTotal(data.total || vpnItems.length);
            } else {
                setVpns([]);
                setTotal(0);
                console.error('Unexpected vpns format:', data);
            }
        } catch (error) {
            console.error('Failed to fetch VPN configs:', error);
            setError(error instanceof Error ? error.message : 'Failed to retrieve VPN configurations');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchVpns();
    }, [offset, limit, authTypeFilter]);

    const handleApplyFilter = () => {
        setOffset(0);
        fetchVpns();
    };

    const handleOpenForm = (vpn?: VpnConfig) => {
        if (vpn) {
            setEditingVpn(vpn);
            setFormData(vpn);
        } else {
            setEditingVpn(null);
            setFormData({
                name: '',
                description: '',
                host: '',
                port: 22,
                user: '',
                auth_type: 'PASSWORD',
                password: '',
                private_key: ''
            });
        }
        setIsFormOpen(true);
    };

    const handleSaveVpn = async () => {
        try {
            const url = editingVpn
                ? `${API_BASE_URL}/vpns/${editingVpn.id}`
                : `${API_BASE_URL}/vpns`;
            const method = editingVpn ? 'PUT' : 'POST';

            const response = await apiFetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                setIsFormOpen(false);
                fetchVpns();
            }
        } catch (error) {
            console.error('Failed to save VPN config:', error);
        }
    };

    const handleDeleteVpn = async (id: string) => {
        if (!confirm('Are you sure you want to delete this VPN configuration?')) return;
        try {
            await apiFetch(`${API_BASE_URL}/vpns/${id}`, {
                method: 'DELETE'
            });
            fetchVpns();
        } catch (error) {
            console.error('Failed to delete VPN config:', error);
        }
    };

    const filteredVpns = vpns.filter(v => {
        const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.host.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesAuth = authTypeFilter === 'ALL' || v.auth_type === authTypeFilter;
        return matchesSearch && matchesAuth;
    });

    const paginatedVpns = filteredVpns.slice(offset, offset + limit);

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 px-1">
                <Network className="w-3.5 h-3.5 text-primary" />
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                    <span className="text-primary">Infrastructure</span>
                    <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                    <span className="text-muted-foreground font-black">VPN Jump Hosts</span>
                </div>
            </div>

            <ResourceFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onApply={handleApplyFilter}
                filters={{ authType: authTypeFilter }}
                onFilterChange={(key: string, val: string) => {
                    if (key === 'authType') setAuthTypeFilter(val);
                }}
                filterConfigs={[
                    {
                        key: 'authType',
                        placeholder: 'AUTH TYPE',
                        options: [
                            { label: 'ALL AUTH TYPES', value: 'ALL' },
                            { label: 'SSH PASSWORD', value: 'PASSWORD' },
                            { label: 'PUBLIC KEY', value: 'PUBLIC_KEY' }
                        ],
                        width: 'w-48'
                    }
                ]}
                searchPlaceholder="Filter by name, ip..."
                isLoading={isLoading}
                primaryAction={
                    <Button
                        onClick={() => handleOpenForm()}
                        className="h-11 px-6 rounded-xl premium-gradient font-black uppercase tracking-widest text-[10px] shadow-premium hover:shadow-indigo-500/25 transition-all gap-2"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add VPN
                    </Button>
                }
            />

            {/* Error State */}
            {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-8 text-center animate-in fade-in zoom-in-95 duration-300">
                    <div className="inline-flex p-4 rounded-2xl bg-destructive/10 text-destructive mb-4">
                        <XCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-destructive mb-2">VPN Synchronization Failed</h3>
                    <p className="text-sm font-medium text-muted-foreground mb-6 max-w-md mx-auto">
                        {error}
                    </p>
                    <Button
                        onClick={() => fetchVpns()}
                        variant="outline"
                        className="h-10 px-8 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold uppercase tracking-widest text-[10px]"
                    >
                        Retry Uplink
                    </Button>
                </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted hover:bg-muted/80 border-border">
                            <TableHead className="px-6 h-12 font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">VPN Configuration</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Authentication</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Endpoint</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground">Created By</TableHead>
                            <TableHead className="font-black uppercase tracking-[0.15em] text-[9px] text-muted-foreground text-right px-6">Operations</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {vpns.length > 0 ? vpns.map((vpn) => (
                            <TableRow key={vpn.id} className="group border-border hover:bg-muted/40 transition-colors">
                                <TableCell className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-muted/80 flex items-center justify-center border border-border group-hover:border-primary/20 group-hover:scale-110 transition-all shadow-sm">
                                            <Network className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-[13px] font-black tracking-tight">{vpn.name}</p>
                                            <p className="text-[9px] text-muted-foreground font-black uppercase tracking-tighter opacity-70">
                                                {vpn.description || 'No description provided'}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {vpn.auth_type === 'PASSWORD' ? (
                                            <Shield className="w-3.5 h-3.5 text-amber-500" />
                                        ) : (
                                            <Key className="w-3.5 h-3.5 text-indigo-500" />
                                        )}
                                        <span className="text-[11px] font-bold uppercase tracking-widest">
                                            {vpn.auth_type} ({vpn.user})
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-mono text-[11px] text-muted-foreground tracking-tight">
                                    {vpn.host}:{vpn.port}
                                </TableCell>
                                <TableCell>
                                    {vpn.created_by_username ? (
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-black text-primary uppercase shrink-0">
                                                {vpn.created_by_username[0]}
                                            </div>
                                            <span className="text-[10px] font-semibold text-muted-foreground">{vpn.created_by_username}</span>
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
                                            onClick={() => handleOpenForm(vpn)}
                                            className="h-8 w-8 rounded-lg hover:bg-muted"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeleteVpn(vpn.id)}
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
                                    {isLoading ? 'Loading VPNs...' : 'No VPN Configurations Available'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <Pagination
                total={total}
                offset={offset}
                limit={limit}
                itemName="VPN Configs"
                onPageChange={setOffset}
            />

            {/* Add/Edit Dialog */}
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="sm:max-w-[425px] bg-card border-border rounded-2xl shadow-premium">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-black uppercase tracking-widest">{editingVpn ? 'Edit VPN Config' : 'Add New VPN Config'}</DialogTitle>
                        <DialogDescription className="text-[11px] font-medium opacity-60 uppercase tracking-tighter">
                            Configure SSH proxy connection details.
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
                                placeholder="Core VPN Node"
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
                                    placeholder="vpn.example.com"
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
                                placeholder="proxy_user"
                            />
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
                            onClick={handleSaveVpn}
                            className="premium-gradient shadow-premium text-[10px] font-black uppercase tracking-widest"
                        >
                            Commit Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default VpnPage;
