import React, { useState, useEffect } from 'react';
import { PlayCircle, CheckCircle, XCircle, Clock, ArrowUpRight, Zap, Target, BarChart3, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import { useNamespace } from '../context/NamespaceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';

const MetricCard = ({ title, value, label, icon: Icon, color }: any) => (
    <Card className="group hover:shadow-premium transition-all duration-500 border border-border bg-card overflow-hidden relative shadow-card">
        <div className={cn("absolute top-0 right-0 w-24 h-24 blur-3xl opacity-5 rounded-full -mr-8 -mt-8 transition-opacity group-hover:opacity-10", color)} />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 relative z-10 p-4">
            <CardTitle className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-[0.15em] shrink-0">{title}</CardTitle>
            <div className={cn("p-2 rounded-lg transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-md", color.replace('bg-', 'bg-opacity-10 text-'))}>
                <Icon className="h-4 w-4" />
            </div>
        </CardHeader>
        <CardContent className="relative z-10 px-4 pb-4 pt-0">
            <div className="text-2xl font-black tracking-tighter mb-1">{value}</div>
            <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-none text-[9px] font-black px-1.5 py-0 rounded-md">
                    {label}
                </Badge>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-40">vs prev week</span>
            </div>
        </CardContent>
    </Card>
);

const Dashboard = () => {
    const { activeNamespace } = useNamespace();
    const { apiFetch } = useAuth();
    const [recentCommands, setRecentCommands] = useState<any[]>([]);

    useEffect(() => {
        const fetchRecent = async () => {
            if (!activeNamespace) return;
            try {
                const response = await apiFetch(`${API_BASE_URL}/commands?namespace_id=${activeNamespace.id}`);
                const data = await response.json();
                setRecentCommands((data || []).slice(0, 4));
            } catch (error) {
                console.error('Failed to fetch recent:', error);
            }
        };
        fetchRecent();
    }, [activeNamespace]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="flex flex-row justify-between items-center bg-card p-6 rounded-xl border border-border shadow-card relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 premium-gradient blur-[120px] opacity-10 rounded-full -mr-32 -mt-32 transition-opacity group-hover:opacity-15" />
                <div className="flex flex-col gap-0.5 relative z-10">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[8.5px] font-black text-emerald-500 tracking-widest uppercase">System: Operational • {activeNamespace?.name || 'Global'}</span>
                    </div>
                    <h1 className="text-2xl font-black tracking-tighter">Command Center</h1>
                    <p className="text-muted-foreground font-medium text-[11px]">Monitoring infrastructure health in {activeNamespace?.name || 'global'} context.</p>
                </div>
                <div className="flex gap-1.5 relative z-10">
                    <Button variant="outline" className="h-8 rounded-md border-border bg-card px-3.5 font-bold uppercase tracking-tight text-[9px] hover:bg-muted transition-all shadow-sm">
                        Export Logs
                    </Button>
                    <Button className="h-8 rounded-md premium-gradient px-3.5 font-bold uppercase tracking-tight text-[9px] shadow-premium hover:premium-gradient-hover transition-all">
                        <Zap className="w-3 h-3 mr-1" /> New Pipeline
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard title="Total Commands" value="2,482" label="+12%" icon={Activity} color="bg-indigo-500" />
                <MetricCard title="Success Rate" value="99.4%" label="+2.4%" icon={CheckCircle} color="bg-emerald-500" />
                <MetricCard title="Active Sockets" value="142" label="+4" icon={Zap} color="bg-amber-500" />
                <MetricCard title="Peak Latency" value="12ms" label="-4ms" icon={BarChart3} color="bg-violet-500" />
            </div>

            <div className="grid gap-6 lg:grid-cols-7">
                <Card className="col-span-4 bg-card border border-border group transition-all duration-500 overflow-hidden relative shadow-card">
                    <CardHeader className="p-6 pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg font-black tracking-tight">Recent Executions</CardTitle>
                                <CardDescription className="text-[10px] font-bold uppercase tracking-wider opacity-60">System-wide event logs</CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" className="h-8 text-primary font-black text-[9px] uppercase tracking-widest hover:bg-primary/5">View All</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-0">
                        <div className="space-y-6 mt-6">
                            {recentCommands.length > 0 ? recentCommands.map((cmd) => (
                                <div key={cmd.id} className="flex items-center gap-6 p-4 rounded-2xl hover:bg-muted/50 transition-all duration-300 group/item cursor-pointer border border-transparent hover:border-border/50">
                                    <div className={cn(
                                        "h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover/item:scale-110 group-hover/item:rotate-3 shadow-sm",
                                        cmd.status === 'SUCCESS' ? "bg-emerald-500/10 text-emerald-500" : "bg-indigo-500/10 text-indigo-500"
                                    )}>
                                        {cmd.status === 'SUCCESS' ? <CheckCircle className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <p className="text-sm font-bold tracking-tight">{cmd.name}</p>
                                        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide opacity-60">
                                            {cmd.status} • {cmd.last_run ? new Date(cmd.last_run).toLocaleString() : 'Never'}
                                        </p>
                                    </div>
                                    <Badge variant="secondary" className={cn(
                                        "font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-lg border-none",
                                        cmd.status === 'SUCCESS' ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600"
                                    )}>
                                        {cmd.status}
                                    </Badge>
                                </div>
                            )) : (
                                <div className="text-center py-12">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">No recent executions in this namespace</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="col-span-3 space-y-6">
                    <Card className="premium-gradient border-none shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 blur-[80px] rounded-full -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-700" />
                        <CardHeader className="p-6 pb-2 relative z-10">
                            <CardTitle className="text-lg font-black text-white tracking-tight">System Health</CardTitle>
                            <CardDescription className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Nodes & Latency Tracker</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 pt-0 relative z-10">
                            <div className="flex items-baseline gap-2 mb-4">
                                <span className="text-4xl font-black text-white tracking-tighter">99.9%</span>
                                <span className="text-white/60 text-[10px] font-black uppercase tracking-widest">Uptime</span>
                            </div>
                            <div className="space-y-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex flex-col gap-1.5">
                                        <div className="flex justify-between text-[10px] font-black text-white uppercase tracking-widest opacity-80">
                                            <span>Node 0{i}</span>
                                            <span>{80 + i * 5}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                            <div className="h-full bg-white rounded-full transition-all duration-1000" style={{ width: `${80 + i * 5}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card border border-border shadow-card overflow-hidden transition-all duration-300 hover:shadow-premium">
                        <CardHeader className="p-6 pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Quick Tools</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 pt-0 flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-white transition-all border-border bg-background font-black uppercase tracking-widest text-[8px] px-2.5 py-1 rounded-lg">SSH ACCESS</Badge>
                            <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-white transition-all border-border bg-background font-black uppercase tracking-widest text-[8px] px-2.5 py-1 rounded-lg">REDIS FLUSH</Badge>
                            <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-white transition-all border-border bg-background font-black uppercase tracking-widest text-[8px] px-2.5 py-1 rounded-lg">RESTART DOCKER</Badge>
                            <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-white transition-all border-border bg-background font-black uppercase tracking-widest text-[8px] px-2.5 py-1 rounded-lg">LOGS AGGREGATOR</Badge>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
