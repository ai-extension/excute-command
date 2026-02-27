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
    Shield
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';
import { cn } from '../lib/utils';
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
    const [activeTab, setActiveTab] = useState<'namespaces' | 'account'>('namespaces');
    const [isLoading, setIsLoading] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedNamespace, setSelectedNamespace] = useState<any>(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [error, setError] = useState('');

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

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this namespace? All associated data will be lost.')) return;

        try {
            const response = await apiFetch(`${API_BASE_URL}/namespaces/${id}`, {
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

            {/* Tabs Navigation */}
            <div className="flex items-center p-1 bg-muted/30 rounded-2xl border border-border w-fit">
                <button
                    onClick={() => setActiveTab('namespaces')}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        activeTab === 'namespaces' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Layers className="w-3.5 h-3.5" /> Logical Namespaces
                </button>
                <button
                    onClick={() => setActiveTab('account')}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                        activeTab === 'account' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <User className="w-3.5 h-3.5" /> Account Profile
                </button>
            </div>

            {/* Content Area */}
            <div className="grid gap-6">
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
                                                onClick={() => handleDelete(ns.id)}
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

                {activeTab === 'account' && (
                    <div className="grid md:grid-cols-2 gap-6">
                        <Card className="bg-card border-border shadow-card">
                            <CardHeader className="p-6">
                                <CardTitle className="text-xl font-black tracking-tight">Identity Profile</CardTitle>
                                <CardDescription className="text-xs font-medium opacity-70">Your authenticated system credentials.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="flex items-center gap-6">
                                    <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                        <User className="w-10 h-10" />
                                    </div>
                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-black tracking-tighter uppercase">{user?.username}</h2>
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{user?.email || 'OFFLINE_IDENTITY'}</p>
                                    </div>
                                </div>
                                <div className="grid gap-3">
                                    <div className="p-4 rounded-2xl bg-muted/30 border border-border flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Shield className="w-4 h-4 text-emerald-500" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Authentication Status</span>
                                        </div>
                                        <Badge className="bg-emerald-500/10 text-emerald-500 border-none font-black text-[8px] uppercase tracking-widest">VERIFIED</Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
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
        </div>
    );
};

export default SettingsPage;
