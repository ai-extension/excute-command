import React, { useState, useEffect } from 'react';
import {
    ShieldCheck,
    Search,
    Filter,
    Calendar,
    User,
    ChevronLeft,
    ChevronRight,
    Eye,
    Type,
    Activity,
    Globe,
    AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { format } from 'date-fns';
import { API_BASE_URL } from '../lib/api';
import { AuditLog } from '../types';
import { Pagination } from '../components/Pagination';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';

const AuditLogPage = () => {
    const { apiFetch } = useAuth();
    const { namespaces, activeNamespace } = useNamespace();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const limit = 20;

    // Filters
    const [resourceType, setResourceType] = useState('');
    const [resourceID, setResourceID] = useState('');
    const [action, setAction] = useState('');
    const [username, setUsername] = useState('');
    const [status, setStatus] = useState('');
    const [namespaceID, setNamespaceID] = useState('');

    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    const safeFormatDate = (dateStr: string, formatStr: string) => {
        try {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'INVALID';
            return format(date, formatStr);
        } catch (e) {
            return 'ERROR';
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [offset, resourceType, resourceID, action, username, status, namespaceID]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let url = `${API_BASE_URL}/audit-logs?limit=${limit}&offset=${offset}`;
            if (namespaceID) url += `&namespace_id=${namespaceID}`; // Use local state
            if (resourceType) url += `&resource_type=${resourceType}`;
            if (resourceID) url += `&resource_id=${resourceID}`;
            if (action) url += `&action=${action}`;
            if (status) url += `&status=${status}`;
            if (username) url += `&username=${encodeURIComponent(username)}`;
            
            const response = await apiFetch(url);
            if (response.ok) {
                const data = await response.json();
                const items = Array.isArray(data) ? data : (data.items || []);
                setLogs(items);
                setTotal(Array.isArray(data) ? data.length : (data.total || 0));
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        return status === 'SUCCESS' ? (
            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">SUCCESS</Badge>
        ) : (
            <Badge className="bg-red-500/10 text-red-500 border-red-500/20">FAILED</Badge>
        );
    };

    const getActionColor = (action: string) => {
        if (action.includes('CREATE')) return 'text-blue-500';
        if (action.includes('DELETE')) return 'text-red-500';
        if (action.includes('UPDATE')) return 'text-amber-500';
        if (action.includes('EXECUTE')) return 'text-purple-500';
        return 'text-foreground';
    };

    return (
        <div className="flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <div className="flex flex-col">
                        <h1 className="text-lg font-black uppercase tracking-widest">Audit Logs</h1>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Security & Operational Traceability</p>
                    </div>
                </div>
                {namespaceID && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 animate-in zoom-in duration-300">
                        <Activity className="w-3 h-3 text-primary" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                            Filtered by Namespace
                        </span>
                    </div>
                )}
            </div>

            {/* Filters */}
            <Card className="bg-card/30 backdrop-blur-md border-border p-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="RESOURCE TYPE (e.g. WORKFLOW)"
                            value={resourceType}
                            onChange={(e) => setResourceType(e.target.value.toUpperCase())}
                            className="pl-9 h-9 text-[10px] font-bold uppercase tracking-wider"
                        />
                    </div>
                    <div className="relative">
                        <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="RESOURCE ID"
                            value={resourceID}
                            onChange={(e) => setResourceID(e.target.value)}
                            className="pl-9 h-9 text-[10px] font-bold uppercase tracking-wider"
                        />
                    </div>
                    <div className="relative">
                        <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="ACTION (e.g. CREATE)"
                            value={action}
                            onChange={(e) => setAction(e.target.value.toUpperCase())}
                            className="pl-9 h-9 text-[10px] font-bold uppercase tracking-wider"
                        />
                    </div>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="USERNAME"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="pl-9 h-9 text-[10px] font-bold uppercase tracking-wider"
                        />
                    </div>
                    <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <select
                            value={namespaceID}
                            onChange={(e) => setNamespaceID(e.target.value)}
                            className="w-full pl-9 h-9 text-[10px] font-bold uppercase tracking-wider bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
                        >
                            <option value="" className="text-black">GLOBAL (ALL WORKSPACES)</option>
                            {namespaces.map(ns => (
                                <option key={ns.id} value={ns.id} className="text-black">
                                    {ns.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <Button 
                            variant="outline" 
                            className="w-full h-9 text-[10px] font-bold uppercase tracking-wider"
                            onClick={() => {
                                setResourceType('');
                                setResourceID('');
                                setAction('');
                                setUsername('');
                                setStatus('');
                                setNamespaceID('');
                                setOffset(0);
                            }}
                        >
                            Reset Filters
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Table */}
            <div className="flex-1 bg-card/30 backdrop-blur-md rounded-3xl border border-border shadow-premium overflow-hidden flex flex-col min-h-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-slate-500/5">
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Timestamp</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">User</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Action</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Resource</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">IP Address</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center">
                                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                            <Activity className="w-4 h-4 animate-spin" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest italic">Scanning logs...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground font-medium italic text-sm">
                                        No audit logs found.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-500/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold tracking-tight">{safeFormatDate(log.timestamp, 'MMM dd, yyyy')}</span>
                                                <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">{safeFormatDate(log.timestamp, 'HH:mm:ss')}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <User className="w-3 h-3 text-primary" />
                                                </div>
                                                <span className="text-xs font-semibold">{log.username || 'System'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${getActionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-foreground/70">{log.resource_type}</span>
                                                <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[120px]">{log.resource_id || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">{getStatusBadge(log.status)}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-medium font-mono">
                                                <Globe className="w-3 h-3" />
                                                {log.ip_address}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-7 w-7 p-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => setSelectedLog(log)}
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination */}
                <div className="mt-auto border-t border-border p-4 bg-slate-500/5">
                    <Pagination
                        total={total}
                        limit={limit}
                        offset={offset}
                        onPageChange={setOffset}
                    />
                </div>
            </div>

            {/* Metadata Detail Dialog */}
            <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                <DialogContent className="max-w-3xl bg-background/95 backdrop-blur-xl border-border rounded-[2rem] p-6 shadow-2xl overflow-hidden">
                    <DialogHeader className="mb-6">
                        <DialogTitle className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-lg font-black uppercase tracking-widest">Action Metadata</span>
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">Log ID: {selectedLog?.id}</span>
                            </div>
                        </DialogTitle>
                    </DialogHeader>
                    
                    {selectedLog && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-2xl bg-slate-500/5 border border-border/50">
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-1">User</span>
                                    <span className="text-sm font-bold">{selectedLog.username}</span>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-500/5 border border-border/50">
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-1">Action</span>
                                    <span className={`text-sm font-bold ${getActionColor(selectedLog.action)}`}>{selectedLog.action}</span>
                                </div>
                            </div>

                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 block">Metadata Payload</span>
                                <div className="bg-slate-950/50 rounded-2xl p-4 overflow-auto max-h-[450px] border border-white/5 w-full">
                                    <pre className="text-[11px] font-mono text-blue-400 leading-relaxed whitespace-pre w-full">
                                        {selectedLog.metadata ? JSON.stringify(JSON.parse(selectedLog.metadata), null, 4) : 'No metadata available'}
                                    </pre>
                                </div>
                            </div>

                            <Button 
                                className="w-full h-11 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                                onClick={() => setSelectedLog(null)}
                            >
                                Close Details
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AuditLogPage;
