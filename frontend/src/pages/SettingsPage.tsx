import React, { useState, useEffect } from 'react';
import {
    Settings,
    Layers,
    User,
    Plus,
    Trash2,
    Edit2,
    Save,
    X,
    AlertCircle,
    CheckCircle2,
    Shield,
    Globe,
    Lock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { cn } from '../lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";

const SettingsPage = () => {
    const { apiFetch, user } = useAuth();
    const { refreshNamespaces, namespaces } = useNamespace();
    const [activeTab, setActiveTab] = useState<'namespaces' | 'general'>('general');
    const [isLoading, setIsLoading] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedNamespace, setSelectedNamespace] = useState<any>(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // System Settings state
    const [systemSettings, setSystemSettings] = useState<Record<string, string>>({
        allow_registration: 'false'
    });
    const [isSettingsLoading, setIsSettingsLoading] = useState(false);

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<any>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchSystemSettings();
    }, []);

    const fetchSystemSettings = async () => {
        setIsSettingsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/settings`);
            if (response.ok) {
                const data = await response.json();
                setSystemSettings(data);
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        } finally {
            setIsSettingsLoading(false);
        }
    };

    const updateSetting = async (key: string, value: string) => {
        setSuccess('');
        setError('');
        try {
            const response = await apiFetch(`${API_BASE_URL}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });
            if (response.ok) {
                setSystemSettings(prev => ({ ...prev, [key]: value }));
                setSuccess('Setting updated successfully');
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError('Failed to update setting');
            }
        } catch (err) {
            setError('An error occurred');
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                await refreshNamespaces();
                setIsCreateOpen(false);
                setFormData({ name: '', description: '' });
            } else {
                const data = await response.json();
                setError(data.error || 'Failed to create namespace');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${selectedNamespace.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                await refreshNamespaces();
                setIsEditOpen(false);
            } else {
                const data = await response.json();
                setError(data.error || 'Failed to update namespace');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = (ns: any) => {
        setDeleteTarget(ns);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);

        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${deleteTarget.id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await refreshNamespaces();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete namespace');
            }
        } catch (err) {
            alert('An error occurred');
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    const openEdit = (ns: any) => {
        setSelectedNamespace(ns);
        setFormData({ name: ns.name, description: ns.description });
        setIsEditOpen(true);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-1">
                    <Settings className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Application Control</span>
                </div>
                <h1 className="text-3xl font-black tracking-tighter">System Settings</h1>
                <p className="text-muted-foreground text-sm font-medium">Manage namespaces, security policies, and application behavior.</p>
            </div>

            {/* Notification Area */}
            {(error || success) && (
                <div className={cn(
                    "p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in zoom-in duration-300",
                    error ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                )}>
                    {error ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                    <p className="text-[11px] font-black uppercase tracking-wider">{error || success}</p>
                </div>
            )}

            {/* Tabs Navigation */}
            <div className="flex items-center p-1 bg-muted/30 rounded-2xl border border-border w-fit">
                <button
                    onClick={() => setActiveTab('general')}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        activeTab === 'general' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Globe className="w-3.5 h-3.5" /> General
                </button>
                <button
                    onClick={() => setActiveTab('namespaces')}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        activeTab === 'namespaces' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Layers className="w-3.5 h-3.5" /> Logical Namespaces
                </button>
            </div>

            {/* Content Area */}
            <div className="grid gap-6">
                {activeTab === 'general' && (
                    <div className="grid gap-6">
                        <Card className="bg-card border-border shadow-card overflow-hidden">
                            <CardHeader className="border-b border-border bg-muted/10 p-6">
                                <CardTitle className="text-xl font-black tracking-tight">Identity & Access</CardTitle>
                                <CardDescription className="text-xs font-medium opacity-70">Configure how users join and access the platform.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="flex items-center justify-between p-4 bg-muted/20 border border-border/50 rounded-2xl">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="allow-registration" className="text-sm font-black tracking-tight cursor-pointer">Allow Public Registration</Label>
                                            <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border-primary/20 text-primary">Security Policy</Badge>
                                        </div>
                                        <p className="text-[10px] font-medium opacity-60">When enabled, anyone can create an account via the login page.</p>
                                    </div>
                                    <Switch
                                        id="allow-registration"
                                        checked={systemSettings.allow_registration === 'true'}
                                        onCheckedChange={(checked) => updateSetting('allow_registration', checked ? 'true' : 'false')}
                                        disabled={isSettingsLoading}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-muted/5 border border-border/50 rounded-2xl opacity-50 cursor-not-allowed">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Lock className="w-4 h-4 text-orange-500" />
                                            <h4 className="text-[10px] font-black uppercase tracking-widest">Google OAuth Provider</h4>
                                        </div>
                                        <p className="text-[10px] font-medium opacity-60 mb-3">Enable registration and login with Google Identity.</p>
                                        <Button variant="outline" className="h-8 text-[9px] font-black uppercase tracking-widest px-4 rounded-xl border-border/50" disabled>
                                            Configure Provider
                                        </Button>
                                    </div>
                                    <div className="p-4 bg-muted/5 border border-border/50 rounded-2xl opacity-50 cursor-not-allowed">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Lock className="w-4 h-4 text-blue-500" />
                                            <h4 className="text-[10px] font-black uppercase tracking-widest">Facebook OAuth Provider</h4>
                                        </div>
                                        <p className="text-[10px] font-medium opacity-60 mb-3">Enable registration and login with Facebook Login.</p>
                                        <Button variant="outline" className="h-8 text-[9px] font-black uppercase tracking-widest px-4 rounded-xl border-border/50" disabled>
                                            Configure Provider
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {activeTab === 'namespaces' && (
                    <Card className="bg-card border-border shadow-card overflow-hidden">
                        <CardHeader className="border-b border-border bg-muted/10 p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="text-xl font-black tracking-tight">Namespace Repository</CardTitle>
                                    <CardDescription className="text-xs font-medium opacity-70">Define isolated environments for your workflows and resources.</CardDescription>
                                </div>
                                <Button
                                    onClick={() => {
                                        setFormData({ name: '', description: '' });
                                        setError('');
                                        setIsCreateOpen(true);
                                    }}
                                    className="premium-gradient font-black uppercase tracking-widest text-[9px] h-9 px-4 shadow-premium rounded-xl gap-2"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Provision Namespace
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border">
                                {namespaces.map((ns) => (
                                    <div key={ns.id} className="p-6 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 group-hover:scale-110",
                                                ns.name === "Default" ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted border-border text-muted-foreground"
                                            )}>
                                                <Layers className="w-6 h-6" />
                                            </div>
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-black text-sm tracking-tight">{ns.name}</h3>
                                                    {ns.name === "Default" && (
                                                        <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border-primary/20 text-primary bg-primary/5">
                                                            CORE_SYSTEM
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-[10px] font-medium opacity-60 max-w-md">{ns.description || 'No description provided for this partition.'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-9 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest gap-2"
                                                onClick={() => openEdit(ns)}
                                            >
                                                <Edit2 className="w-3 h-3 text-muted-foreground" /> Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={cn(
                                                    "h-9 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest gap-2",
                                                    (ns.name === "Default" || namespaces.length <= 1) ? "opacity-30 cursor-not-allowed" : "text-destructive hover:bg-destructive/10"
                                                )}
                                                disabled={ns.name === "Default" || namespaces.length <= 1}
                                                onClick={() => handleDelete(ns)}
                                            >
                                                <Trash2 className="w-3 h-3" /> Terminate
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Create/Edit Dialogs */}
            <Dialog open={isCreateOpen || isEditOpen} onOpenChange={(open) => {
                if (!open) {
                    setIsCreateOpen(false);
                    setIsEditOpen(false);
                }
            }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black tracking-tighter">
                            {isCreateOpen ? 'Initialize Namespace' : 'Configure Namespace'}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-medium">
                            {isCreateOpen ? 'Deploy a new isolated partition for your operations.' : 'Modify the configuration for this operational partition.'}
                        </DialogDescription>
                    </DialogHeader>
                    {error && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 text-destructive animate-in fade-in zoom-in duration-300">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <p className="text-[10px] font-black uppercase tracking-wide">{error}</p>
                        </div>
                    )}
                    <form onSubmit={isCreateOpen ? handleCreate : handleUpdate} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Namespace Name</label>
                            <Input
                                placeholder="e.g. Production Cluster"
                                className="h-12 bg-muted/30 border-border rounded-xl font-bold text-sm"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Contextual Description</label>
                            <Input
                                placeholder="Strategic purpose of this namespace..."
                                className="h-12 bg-muted/30 border-border rounded-xl font-bold text-sm"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                        <DialogFooter className="pt-4 gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-12 flex-1 font-black uppercase tracking-widest text-[9px] rounded-xl"
                                onClick={() => {
                                    setIsCreateOpen(false);
                                    setIsEditOpen(false);
                                }}
                            >
                                ABORT_OPERATION
                            </Button>
                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="premium-gradient h-12 flex-1 font-black uppercase tracking-widest text-[9px] rounded-xl shadow-premium"
                            >
                                {isLoading ? 'PROCESSING...' : isCreateOpen ? 'INITIATE_DEPLOY' : 'SAVE_CONFIG'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title="Terminate Namespace"
                description={`Are you sure you want to delete the namespace "${deleteTarget?.name}"? All associated data, flows, and records will be permanently lost.`}
                confirmText="Confirm Termination"
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
};

export default SettingsPage;
