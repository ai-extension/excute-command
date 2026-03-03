import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Zap, Server, Calendar, CheckCircle2, XCircle, Clock, Play, Loader2,
    Activity, Users, TrendingUp, Shield, Globe, Tag, Network, ChevronRight,
    LayoutDashboard, ArrowUpRight, RefreshCw, Circle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useNamespace } from '../context/NamespaceContext';
import { API_BASE_URL } from '../lib/api';

// ─────────── TYPES ───────────
interface DashboardStats {
    workflows: { total: number; items: any[] };
    executions: { total: number; success: number; failed: number; running: number; items: any[] };
    schedules: { total: number; active: number; items: any[] };
    servers: { total: number; items: any[] };
    vpns: { total: number; items: any[] };
    users: { total: number; items: any[] };
}

// ─────────── MINI COMPONENTS ───────────
const StatCard = ({ icon: Icon, label, value, sub, color, onClick }: any) => (
    <Card
        onClick={onClick}
        className={cn(
            "relative overflow-hidden border border-border bg-card cursor-pointer group transition-all duration-300 hover:scale-[1.02] hover:shadow-premium hover:border-primary/30",
        )}
    >
        <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500", color)} />
        <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3", `${color}/10`)}>
                    <Icon className={cn("w-4.5 h-4.5", color.replace('bg-', 'text-'))} />
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" />
            </div>
            <div className="text-2xl font-black tracking-tighter mb-0.5">{value ?? '—'}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</div>
            {sub && <div className="text-[10px] font-medium text-muted-foreground/40 mt-1">{sub}</div>}
        </CardContent>
    </Card>
);

const statusColor = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'SUCCESS': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        case 'FAILED': return 'text-red-400 bg-red-500/10 border-red-500/20';
        case 'RUNNING': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        case 'ACTIVE': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        case 'PAUSED': return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
        default: return 'text-muted-foreground bg-muted/50 border-border';
    }
};

const StatusDot = ({ status }: { status: string }) => {
    const isRunning = status?.toUpperCase() === 'RUNNING';
    return (
        <span className={cn(
            "inline-block w-1.5 h-1.5 rounded-full shrink-0",
            status?.toUpperCase() === 'SUCCESS' || status?.toUpperCase() === 'ACTIVE' ? 'bg-emerald-400' :
                status?.toUpperCase() === 'FAILED' ? 'bg-red-400' :
                    status?.toUpperCase() === 'RUNNING' ? 'bg-blue-400 animate-pulse' :
                        'bg-slate-400'
        )} />
    );
};

const formatTime = (ts: string) => {
    if (!ts) return '—';
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
};

// ─────────── MAIN DASHBOARD ───────────
const Dashboard = () => {
    const navigate = useNavigate();
    const { apiFetch } = useAuth();
    const { activeNamespace } = useNamespace();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    const fetchAll = useCallback(async () => {
        if (!activeNamespace?.id) return;
        setLoading(true);
        try {
            const nsId = activeNamespace.id;
            const [wfRes, execRes, schRes, srvRes, vpnRes, userRes] = await Promise.allSettled([
                apiFetch(`${API_BASE_URL}/namespaces/${nsId}/workflows?limit=100`),
                apiFetch(`${API_BASE_URL}/namespaces/${nsId}/executions?limit=20`),
                apiFetch(`${API_BASE_URL}/namespaces/${nsId}/schedules?limit=100`),
                apiFetch(`${API_BASE_URL}/servers?limit=100`),
                apiFetch(`${API_BASE_URL}/vpns?limit=100`),
                apiFetch(`${API_BASE_URL}/users?limit=100`),
            ]);

            const parse = async (r: PromiseSettledResult<Response>) => {
                if (r.status === 'fulfilled' && r.value.ok) {
                    return await r.value.json();
                }
                return { items: [], total: 0 };
            };

            const [wf, exec, sch, srv, vpn, usr] = await Promise.all([
                parse(wfRes), parse(execRes), parse(schRes), parse(srvRes), parse(vpnRes), parse(userRes)
            ]);

            const execItems: any[] = exec?.items || [];
            setStats({
                workflows: { total: wf?.total || 0, items: wf?.items || [] },
                executions: {
                    total: exec?.total || 0,
                    success: execItems.filter((e: any) => e.status === 'SUCCESS').length,
                    failed: execItems.filter((e: any) => e.status === 'FAILED').length,
                    running: execItems.filter((e: any) => e.status === 'RUNNING').length,
                    items: execItems,
                },
                schedules: {
                    total: sch?.total || 0,
                    active: (sch?.items || []).filter((s: any) => s.status === 'ACTIVE').length,
                    items: (sch?.items || []).slice(0, 5),
                },
                servers: { total: srv?.total || 0, items: (srv?.items || []).slice(0, 5) },
                vpns: { total: vpn?.total || 0, items: vpn?.items || [] },
                users: { total: usr?.total || 0, items: usr?.items || [] },
            });
            setLastRefresh(new Date());
        } catch (err) {
            console.error('Dashboard fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [activeNamespace?.id]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const successRate = stats && stats.executions.total > 0
        ? Math.round((stats.executions.success / (stats.executions.success + stats.executions.failed || 1)) * 100)
        : null;

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            {/* Breadcrumb */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 px-1">
                    <LayoutDashboard className="w-3.5 h-3.5 text-primary" />
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                        <span className="text-primary">{activeNamespace?.name || 'Global'}</span>
                        <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                        <span className="text-muted-foreground font-black">Command Center</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                        {loading ? 'Syncing...' : `Updated ${formatTime(lastRefresh.toISOString())}`}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchAll}
                        disabled={loading}
                        className="h-8 px-3 rounded-lg gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                        <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* ── Hero Banner ── */}
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-premium">
                <div className="absolute inset-0 premium-gradient opacity-5" />
                <div className="absolute top-0 right-0 w-80 h-80 premium-gradient blur-[100px] opacity-10 rounded-full -mr-20 -mt-20" />
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">System Operational</span>
                        </div>
                        <h1 className="text-2xl font-black tracking-tighter mb-1">Command Center</h1>
                        <p className="text-muted-foreground text-[11px] font-medium">
                            Full overview of <span className="text-primary font-black">{activeNamespace?.name}</span> workspace — workflows, infrastructure & executions.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button onClick={() => navigate('/workflows')} className="premium-gradient font-black uppercase tracking-widest text-[10px] px-4 rounded-xl shadow-premium gap-1.5">
                            <Zap className="w-3.5 h-3.5" /> New Workflow
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── Stat Grid ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard icon={Zap} label="Workflows" value={stats?.workflows.total} color="bg-indigo-500" onClick={() => navigate('/workflows')} />
                <StatCard icon={Activity} label="Executions" value={stats?.executions.total} sub="Last 20 fetched" color="bg-violet-500" onClick={() => navigate('/history')} />
                <StatCard icon={CheckCircle2} label="Success Rate" value={successRate !== null ? `${successRate}%` : '—'} color="bg-emerald-500" />
                <StatCard icon={Calendar} label="Schedules" value={stats?.schedules.total} sub={`${stats?.schedules.active || 0} active`} color="bg-amber-500" onClick={() => navigate('/schedules')} />
                <StatCard icon={Server} label="Servers" value={stats?.servers.total} color="bg-cyan-500" onClick={() => navigate('/servers')} />
                <StatCard icon={Users} label="Users" value={stats?.users.total} color="bg-pink-500" onClick={() => navigate('/users')} />
            </div>

            {/* ── Execution Status Bar ── */}
            {stats && stats.executions.total > 0 && (
                <Card className="border-border bg-card shadow-card overflow-hidden">
                    <CardHeader className="px-5 pt-4 pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Execution Health (last 20)</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/history')} className="h-7 px-2 text-[9px] font-black uppercase tracking-widest gap-1 text-muted-foreground hover:text-foreground">
                                View All <ArrowUpRight className="w-3 h-3" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                        <div className="flex gap-4 mb-3">
                            {[
                                { label: 'Success', count: stats.executions.success, color: 'text-emerald-400' },
                                { label: 'Failed', count: stats.executions.failed, color: 'text-red-400' },
                                { label: 'Running', count: stats.executions.running, color: 'text-blue-400' },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-1.5">
                                    <span className={cn("text-lg font-black tracking-tighter", s.color)}>{s.count}</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">{s.label}</span>
                                </div>
                            ))}
                        </div>
                        {/* Visual bar */}
                        <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden flex">
                            {stats.executions.success > 0 && (
                                <div className="h-full bg-emerald-500 rounded-l-full transition-all duration-700"
                                    style={{ width: `${(stats.executions.success / stats.executions.total) * 100}%` }} />
                            )}
                            {stats.executions.running > 0 && (
                                <div className="h-full bg-blue-500 animate-pulse transition-all duration-700"
                                    style={{ width: `${(stats.executions.running / stats.executions.total) * 100}%` }} />
                            )}
                            {stats.executions.failed > 0 && (
                                <div className="h-full bg-red-500 rounded-r-full transition-all duration-700"
                                    style={{ width: `${(stats.executions.failed / stats.executions.total) * 100}%` }} />
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Two Column: Recent Executions + Schedules ── */}
            <div className="grid lg:grid-cols-5 gap-4">
                {/* Recent Executions */}
                <Card className="lg:col-span-3 border-border bg-card shadow-card overflow-hidden">
                    <CardHeader className="px-5 pt-4 pb-3 border-b border-border/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-black tracking-tight">Recent Executions</CardTitle>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">Latest workflow runs</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/history')} className="h-7 px-2 text-[9px] font-black uppercase tracking-widest gap-1 text-muted-foreground hover:text-foreground">
                                View All <ArrowUpRight className="w-3 h-3" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground/40">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Loading...</span>
                            </div>
                        ) : stats?.executions.items.length ? (
                            <div className="divide-y divide-border/30">
                                {stats.executions.items.slice(0, 8).map((exec: any) => (
                                    <div key={exec.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors group">
                                        <StatusDot status={exec.status} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black tracking-tight truncate text-foreground/80">{exec.workflow?.name || exec.workflow_id?.substring(0, 8) || 'Unknown'}</p>
                                            <p className="text-[9px] text-muted-foreground/40 font-medium">{formatTime(exec.started_at)}</p>
                                        </div>
                                        <Badge className={cn("text-[8px] font-black uppercase tracking-wider px-1.5 py-0 border rounded", statusColor(exec.status))}>
                                            {exec.status}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-30">
                                <Activity className="w-8 h-8" />
                                <p className="text-[10px] font-black uppercase tracking-widest">No executions yet</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Schedules */}
                <Card className="lg:col-span-2 border-border bg-card shadow-card overflow-hidden">
                    <CardHeader className="px-5 pt-4 pb-3 border-b border-border/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-black tracking-tight">Active Schedules</CardTitle>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">
                                    {stats?.schedules.active || 0} of {stats?.schedules.total || 0} running
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/schedules')} className="h-7 px-2 text-[9px] font-black uppercase tracking-widest gap-1 text-muted-foreground hover:text-foreground">
                                View All <ArrowUpRight className="w-3 h-3" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground/40">
                                <Loader2 className="w-4 h-4 animate-spin" />
                            </div>
                        ) : stats?.schedules.items.length ? (
                            <div className="divide-y divide-border/30">
                                {stats.schedules.items.map((s: any) => (
                                    <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", s.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground/40')}>
                                            <Calendar className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black tracking-tight truncate">{s.name}</p>
                                            <p className="text-[9px] text-muted-foreground/40 font-medium uppercase tracking-widest">
                                                {s.type === 'RECURRING' ? s.cron_expression || 'Recurring' : 'One-time'}
                                            </p>
                                        </div>
                                        <StatusDot status={s.status} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-30">
                                <Calendar className="w-8 h-8" />
                                <p className="text-[10px] font-black uppercase tracking-widest">No schedules</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Bottom Row: Servers + Quick Links ── */}
            <div className="grid lg:grid-cols-5 gap-4">
                {/* Servers */}
                <Card className="lg:col-span-3 border-border bg-card shadow-card overflow-hidden">
                    <CardHeader className="px-5 pt-4 pb-3 border-b border-border/30">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-black tracking-tight">Node Fleet</CardTitle>
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">{stats?.servers.total || 0} registered servers</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/servers')} className="h-7 px-2 text-[9px] font-black uppercase tracking-widest gap-1 text-muted-foreground hover:text-foreground">
                                View All <ArrowUpRight className="w-3 h-3" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground/40">
                                <Loader2 className="w-4 h-4 animate-spin" />
                            </div>
                        ) : stats?.servers.items.length ? (
                            <div className="divide-y divide-border/30">
                                {stats.servers.items.slice(0, 5).map((srv: any) => (
                                    <div key={srv.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 text-cyan-400">
                                            <Server className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black tracking-tight truncate">{srv.name}</p>
                                            <p className="text-[9px] text-muted-foreground/40 font-medium">{srv.ip_address || srv.host}</p>
                                        </div>
                                        <Badge variant="outline" className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0 border-border bg-background">
                                            {srv.auth_type || 'SSH'}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-30">
                                <Server className="w-8 h-8" />
                                <p className="text-[10px] font-black uppercase tracking-widest">No servers</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Navigation */}
                <Card className="lg:col-span-2 border-border bg-card shadow-card overflow-hidden">
                    <CardHeader className="px-5 pt-4 pb-3 border-b border-border/30">
                        <CardTitle className="text-sm font-black tracking-tight">Quick Access</CardTitle>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">Navigate to sections</p>
                    </CardHeader>
                    <CardContent className="p-3">
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { icon: Zap, label: 'Workflows', path: '/workflows', color: 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20' },
                                { icon: Activity, label: 'History', path: '/history', color: 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20' },
                                { icon: Calendar, label: 'Schedules', path: '/schedules', color: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' },
                                { icon: Server, label: 'Servers', path: '/servers', color: 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20' },
                                { icon: Network, label: 'VPNs', path: '/vpns', color: 'bg-teal-500/10 text-teal-400 hover:bg-teal-500/20' },
                                { icon: Users, label: 'Users', path: '/users', color: 'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20' },
                                { icon: Shield, label: 'Roles', path: '/roles', color: 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20' },
                                { icon: Globe, label: 'Variables', path: '/global-variables', color: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' },
                            ].map(item => (
                                <button
                                    key={item.path}
                                    onClick={() => navigate(item.path)}
                                    className={cn(
                                        "flex items-center gap-2 p-2.5 rounded-xl font-black uppercase tracking-wider text-[9px] transition-all duration-200 group",
                                        item.color
                                    )}
                                >
                                    <item.icon className="w-3.5 h-3.5 shrink-0" />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Workflow List ── */}
            <Card className="border-border bg-card shadow-card overflow-hidden">
                <CardHeader className="px-5 pt-4 pb-3 border-b border-border/30">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-black tracking-tight">Workflows</CardTitle>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">
                                {stats?.workflows.total || 0} automations in {activeNamespace?.name}
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => navigate('/workflows')} className="h-7 px-2 text-[9px] font-black uppercase tracking-widest gap-1 text-muted-foreground hover:text-foreground">
                            View All <ArrowUpRight className="w-3 h-3" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground/40">
                            <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                    ) : stats?.workflows.items.length ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 divide-x divide-y divide-border/30">
                            {stats.workflows.items.slice(0, 6).map((wf: any) => (
                                <div
                                    key={wf.id}
                                    onClick={() => navigate(`/workflows/${wf.id}`)}
                                    className="flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors cursor-pointer group"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                                        <Zap className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-black tracking-tight truncate">{wf.name}</p>
                                        <p className="text-[9px] text-muted-foreground/40 font-medium">{wf.groups?.length || 0} groups</p>
                                    </div>
                                    <ArrowUpRight className="w-3 h-3 text-muted-foreground/20 group-hover:text-primary/60 ml-auto shrink-0 transition-colors" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-30">
                            <Zap className="w-8 h-8" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No workflows</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Dashboard;
