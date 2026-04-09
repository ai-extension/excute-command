import React, { useState, useEffect } from 'react';
import { 
    Activity, 
    User, 
    Globe, 
    Eye,
    History as HistoryIcon,
    AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { format } from 'date-fns';
import { API_BASE_URL } from '../lib/api';
import { AuditLog } from '../types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';

interface ResourceHistoryTabProps {
    resourceType: string;
    resourceId: string;
}

const ResourceHistoryTab = ({ resourceType, resourceId }: ResourceHistoryTabProps) => {
    const { apiFetch } = useAuth();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    useEffect(() => {
        fetchLogs();
    }, [resourceType, resourceId]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const url = `${API_BASE_URL}/audit-logs/resource/${resourceType}/${resourceId}`;
            const response = await apiFetch(url);
            if (response.ok) {
                const data = await response.json();
                // If the response is a direct array of logs
                setLogs(Array.isArray(data) ? data : (data.items || []));
            }
        } catch (error) {
            console.error('Failed to fetch resource logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        return status === 'SUCCESS' ? (
            <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px] font-black tracking-widest px-2 py-0">SUCCESS</Badge>
        ) : (
            <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[9px] font-black tracking-widest px-2 py-0">FAILED</Badge>
        );
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center gap-2 mb-4">
                <HistoryIcon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground/80">Modification History</h3>
            </div>

            <Card className="bg-card/30 backdrop-blur-md border border-border p-0 overflow-hidden shadow-premium">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-slate-500/5">
                                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Time</th>
                                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">User</th>
                                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Action</th>
                                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-center">Status</th>
                                <th className="px-5 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right">Detail</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-10 text-center">
                                        <Activity className="w-4 h-4 animate-spin mx-auto text-primary" />
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-10 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground italic">
                                        No modifications recorded for this item.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-500/5 transition-colors group">
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col leading-none">
                                                <span className="text-[10px] font-extrabold">{format(new Date(log.timestamp), 'MMM dd')}</span>
                                                <span className="text-[8px] text-muted-foreground font-bold uppercase mt-0.5">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-[11px] font-semibold">{log.username || 'System'}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">{log.action}</span>
                                        </td>
                                        <td className="px-5 py-3 text-center">{getStatusBadge(log.status)}</td>
                                        <td className="px-5 py-3 text-right">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => setSelectedLog(log)}
                                            >
                                                <Eye className="w-3 h-3 text-muted-foreground" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                <DialogContent className="max-w-3xl bg-background/95 backdrop-blur-xl border-border rounded-[2rem] p-6 shadow-2xl overflow-hidden">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-primary" />
                            <span className="text-sm font-black uppercase tracking-widest">Metadata Explorer</span>
                        </DialogTitle>
                    </DialogHeader>
                    
                    {selectedLog && (
                        <div className="space-y-4">
                            <div className="bg-slate-950/50 rounded-2xl p-4 overflow-auto max-h-[450px] border border-white/5 w-full">
                                <pre className="text-[11px] font-mono text-blue-400 leading-relaxed whitespace-pre w-full">
                                    {selectedLog.metadata ? JSON.stringify(JSON.parse(selectedLog.metadata), null, 4) : 'No extra data'}
                                </pre>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                <Globe className="w-3 h-3" />
                                Origin IP: {selectedLog.ip_address}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ResourceHistoryTab;
