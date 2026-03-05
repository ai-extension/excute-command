import React, { useState, useEffect } from 'react';
import {
    Key,
    Lock,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Terminal,
    Plus,
    Trash2,
    Copy,
    Check,
    Shield
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '../components/ui/dialog';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { cn } from '../lib/utils';
import { Book, Info } from 'lucide-react';

const AVAILABLE_SCOPES = [
    { id: 'workflows', name: 'Workflows' },
    { id: 'executions', name: 'Executions' },
    { id: 'servers', name: 'Servers' },
    { id: 'variables', name: 'Variables' },
    { id: 'schedules', name: 'Schedules' },
    { id: 'pages', name: 'Pages' },
    { id: 'tags', name: 'Tags' },
    { id: 'vpns', name: 'VPNs' },
];

const API_DOCS = [
    {
        title: "Authentication",
        description: "Include your token in the X-API-Key header for all requests.",
        code: "X-API-Key: [YOUR_TOKEN]"
    },
    {
        title: "Workflows",
        methods: [
            { method: "GET", path: "/api/namespaces/:ns_id/workflows", desc: "List all workflows" },
            { method: "POST", path: "/api/workflows/:id/run", desc: "Execute a workflow" }
        ]
    },
    {
        title: "Servers",
        methods: [
            { method: "GET", path: "/api/servers", desc: "List all available servers" }
        ]
    }
];

const APIKeysPage = () => {
    const { apiFetch, user } = useAuth();
    const [apiKeys, setApiKeys] = useState<any[]>([]);
    const [newKeyName, setNewKeyName] = useState('');
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isKeyLoading, setIsKeyLoading] = useState(false);
    const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
    const [isDocDialogOpen, setIsDocDialogOpen] = useState(false);

    useEffect(() => {
        if (user) {
            fetchApiKeys();
        }
    }, [user]);

    const fetchApiKeys = async () => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/me/api-keys`);
            if (response.ok) {
                const data = await response.json();
                setApiKeys(data);
            }
        } catch (err) {
            console.error("Failed to fetch API keys", err);
        }
    };

    const handleGenerateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyName.trim()) return;

        setIsKeyLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/me/api-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName, scopes: selectedScopes })
            });
            if (response.ok) {
                const data = await response.json();
                setGeneratedKey(data.key);
                setIsKeyDialogOpen(true);
                setNewKeyName('');
                setSelectedScopes([]);
                fetchApiKeys();
            }
        } catch (err) {
            console.error("Failed to generate API key", err);
        } finally {
            setIsKeyLoading(false);
        }
    };

    const handleDeleteKey = async (id: string) => {
        if (!window.confirm("Are you sure you want to revoke this access token?")) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/me/api-keys/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                fetchApiKeys();
            }
        } catch (err) {
            console.error("Failed to delete API key", err);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col gap-2">
                <h2 className="text-4xl font-black tracking-tighter bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent uppercase italic">
                    Access Tokens
                </h2>
                <p className="text-muted-foreground font-medium uppercase tracking-[0.3em] text-[10px] ml-1">
                    Manage programmatic system entry points
                </p>
            </div>

            <Card className="bg-card border-border shadow-card overflow-hidden">
                <CardHeader className="p-6 border-b border-border bg-muted/5">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <Terminal className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-black tracking-tight">System Identity Tokens</CardTitle>
                                <CardDescription className="text-[10px] font-medium uppercase tracking-wider opacity-60">Keys for external API synchronization and automation.</CardDescription>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => setIsDocDialogOpen(true)}
                            className="bg-background border-border hover:bg-muted/50 rounded-xl px-5 gap-2 text-[10px] font-black uppercase tracking-widest shadow-sm"
                        >
                            <Book className="w-3.5 h-3.5 text-indigo-500" />
                            API Documentation
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-6 border-b border-border bg-muted/2">
                    <form onSubmit={handleGenerateKey} className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Token Name</label>
                                <Input
                                    placeholder="e.g. Jenkins CI, GitHub Actions"
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    className="h-12 bg-background border-border focus:ring-2 focus:ring-primary/20 transition-all rounded-xl font-bold text-sm"
                                />
                            </div>
                            <div className="pt-6">
                                <Button
                                    type="submit"
                                    disabled={isKeyLoading || !newKeyName.trim()}
                                    className="h-12 premium-gradient rounded-xl px-8 gap-3 text-[11px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                                >
                                    {isKeyLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Initialize Protocol
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Assign API Access Scopes (Optional - Defaults to All)</label>
                                <div className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">
                                    {selectedScopes.length === 0 ? "Full Access Enabled" : `${selectedScopes.length} Scopes Restricted`}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {AVAILABLE_SCOPES.map((scope) => {
                                    const isSelected = selectedScopes.includes(scope.id);
                                    return (
                                        <button
                                            key={scope.id}
                                            type="button"
                                            onClick={() => {
                                                if (isSelected) {
                                                    setSelectedScopes(selectedScopes.filter(s => s !== scope.id));
                                                } else {
                                                    setSelectedScopes([...selectedScopes, scope.id]);
                                                }
                                            }}
                                            className={cn(
                                                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 border",
                                                isSelected
                                                    ? "bg-primary/10 border-primary text-primary shadow-sm"
                                                    : "bg-muted/10 border-border text-muted-foreground/60 hover:border-primary/30 hover:text-primary/60"
                                            )}
                                        >
                                            {scope.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </form>
                </CardContent>
                <CardContent className="p-6">
                    {apiKeys.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-30">
                            <Terminal className="w-16 h-16 stroke-[1]" />
                            <div className="space-y-1">
                                <p className="text-sm font-black uppercase tracking-widest">No Active Entry Points</p>
                                <p className="text-[10px] font-medium uppercase tracking-widest">Generate a token to begin programmatic integration</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {apiKeys.map((key) => (
                                <div key={key.id} className="group flex items-center justify-between p-5 rounded-2xl bg-muted/5 border border-border/50 hover:bg-muted/10 hover:border-primary/20 transition-all duration-300">
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-500 shadow-inner">
                                            <Key className="w-5 h-5" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <h4 className="text-base font-black tracking-tight flex items-center gap-2">
                                                {key.name}
                                                <Badge className="bg-indigo-500/10 text-indigo-500 border-none text-[8px] px-2 h-4 uppercase tracking-[0.1em] font-black">ACTIVE</Badge>
                                            </h4>
                                            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                                                <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> {key.key_prefix}••••••••</span>
                                                <span className="w-1 h-1 rounded-full bg-border" />
                                                <span>Initialized {new Date(key.created_at).toLocaleDateString()}</span>
                                                {key.last_used && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-border" />
                                                        <span className="text-emerald-500 uppercase">Last Sync {new Date(key.last_used).toLocaleString()}</span>
                                                    </>
                                                )}
                                            </div>
                                            {key.scopes && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {key.scopes.split(',').map((s: string) => (
                                                        <Badge key={s} variant="outline" className="text-[7px] px-1.5 h-3.5 bg-primary/5 border-primary/20 text-primary font-bold uppercase tracking-tighter">
                                                            {s}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeleteKey(key.id)}
                                        className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-xl w-10 h-10 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-8 rounded-3xl bg-primary/5 border border-primary/10 space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                        <Lock className="w-6 h-6" />
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-primary">Security Architecture</h4>
                        <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                            Tokens use SHA-256 irreversible hashing for storage. Once generated, the original key cannot be recovered by the system.
                        </p>
                    </div>
                </div>
                <div className="p-8 rounded-3xl bg-muted/20 border border-border space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-muted-foreground/10 flex items-center justify-center text-muted-foreground mb-2">
                        <Terminal className="w-6 h-6" />
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Header Integration</h4>
                        <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                            Invoke the system via <code className="px-1.5 py-0.5 rounded-md bg-muted/40 text-primary">X-API-Key: [your-token]</code> for all programmatic requests.
                        </p>
                    </div>
                </div>
            </div>

            {/* API Key Modal */}
            <Dialog open={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen}>
                <DialogContent className="sm:max-w-md bg-card border-border rounded-3xl overflow-hidden p-0 shadow-2xl">
                    <DialogHeader className="p-8 pb-0">
                        <div className="p-4 bg-emerald-500/10 w-fit rounded-2xl mb-6 shadow-inner">
                            <Shield className="w-8 h-8 text-emerald-500" />
                        </div>
                        <DialogTitle className="text-3xl font-black tracking-tighter italic uppercase text-emerald-500">System Entry Initialized</DialogTitle>
                        <DialogDescription className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 pt-2">
                            Secure isolation required. Protocol: Capture & Save.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8 pt-6 space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Private Access Token</label>
                            <div className="relative group">
                                <Input
                                    readOnly
                                    value={generatedKey || ''}
                                    className="pr-14 h-12 bg-muted/10 border-border rounded-xl font-mono text-sm font-bold text-primary focus:bg-muted/30 transition-all border-dashed shadow-inner"
                                />
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => copyToClipboard(generatedKey || '')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl w-10 h-10 transition-all"
                                >
                                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-amber-500 flex items-start gap-4">
                            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-[11px] font-black uppercase tracking-wide">Critical Security Warning</p>
                                <p className="text-[10px] font-bold leading-normal uppercase tracking-widest opacity-80">
                                    Final view. This key sequence will be purged from memory and is unrecoverable if lost.
                                </p>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="p-8 pt-0">
                        <Button
                            onClick={() => setIsKeyDialogOpen(false)}
                            className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl shadow-xl transition-all"
                        >
                            I have acknowledged and stored the key
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* API Documentation Modal */}
            <Dialog open={isDocDialogOpen} onOpenChange={setIsDocDialogOpen}>
                <DialogContent className="sm:max-w-2xl bg-card border-border rounded-3xl overflow-hidden p-0 shadow-2xl">
                    <DialogHeader className="p-8 pb-0">
                        <div className="p-4 bg-indigo-500/10 w-fit rounded-2xl mb-6 shadow-inner">
                            <Book className="w-8 h-8 text-indigo-500" />
                        </div>
                        <DialogTitle className="text-3xl font-black tracking-tighter italic uppercase text-indigo-500">API Documentation</DialogTitle>
                        <DialogDescription className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 pt-2">
                            Integrate your external systems with our automation protocol.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8 pt-6 max-h-[60vh] overflow-y-auto space-y-8">
                        {API_DOCS.map((doc, i) => (
                            <div key={i} className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                                    <h3 className="text-sm font-black uppercase tracking-widest">{doc.title}</h3>
                                </div>
                                {doc.description && (
                                    <p className="text-xs text-muted-foreground font-medium">{doc.description}</p>
                                )}
                                {doc.code && (
                                    <div className="p-4 rounded-xl bg-muted/20 border border-border font-mono text-xs text-primary font-bold">
                                        {doc.code}
                                    </div>
                                )}
                                {doc.methods && (
                                    <div className="space-y-3">
                                        {doc.methods.map((m, j) => (
                                            <div key={j} className="p-4 rounded-xl bg-muted/10 border border-border/50 space-y-2 group hover:bg-muted/20 transition-all">
                                                <div className="flex items-center gap-3">
                                                    <Badge className="bg-indigo-500 text-white font-black text-[9px] px-2">{m.method}</Badge>
                                                    <code className="text-[11px] font-bold text-primary">{m.path}</code>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground font-medium ml-1">{m.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <DialogFooter className="p-8 pt-0">
                        <Button
                            onClick={() => setIsDocDialogOpen(false)}
                            className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 font-black uppercase tracking-[0.2em] text-[10px] rounded-xl shadow-xl transition-all"
                        >
                            Close Documentation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default APIKeysPage;
