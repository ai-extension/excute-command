import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Moon, Sun, Command as CmdIcon, Search, LogOut, User as UserIcon, Settings, Key } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const Layout = () => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const [isDark, setIsDark] = useState(true); // Default to dark for premium feel
    const [isCollapsed, setIsCollapsed] = useState(false);
    const location = useLocation();

    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    const getPageTitle = () => {
        const path = location.pathname;
        if (path === '/') return 'Control Dashboard';
        if (path === '/workflows') return 'Blueprint Editor';
        if (path === '/history') return 'Audit Discovery';
        if (path === '/servers') return 'Node Repository';
        if (path === '/vpns') return 'Network Transit';
        if (path === '/users') return 'Identity Management';
        if (path === '/roles') return 'Access Policies';
        if (path === '/variables') return 'Registry Explorer';
        if (path === '/tags') return 'Metadata Labels';
        if (path === '/schedules') return 'Temporal Engine';
        if (path === '/settings') return 'System Configuration';
        if (path === '/profile') return 'Identity Vault';
        return 'Control Center';
    };

    return (
        <div className="flex min-h-screen bg-background text-foreground transition-colors duration-500 font-sans selection:bg-primary/20">
            <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-16 border-b border-border bg-[var(--header-bg)] backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between px-6 gap-6">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 rounded-md border border-border/50 text-muted-foreground/60 focus-within:bg-muted/60 transition-all duration-300">
                            <Search className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold uppercase tracking-widest leading-none">Global Search</span>
                            <div className="ml-4 flex items-center gap-1 opacity-40">
                                <div className="px-1 border border-current rounded text-[9px] font-black italic">cmd</div>
                                <div className="px-1 border border-current rounded text-[9px] font-black">K</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-1.5">

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsDark(!isDark)}
                                className="rounded-xl hover:bg-muted text-foreground/60 hover:text-foreground transition-all"
                            >
                                {isDark ? (
                                    <Sun className="h-4.5 w-4.5 text-amber-500" />
                                ) : (
                                    <Moon className="h-4.5 w-4.5 text-indigo-600" />
                                )}
                            </Button>
                        </div>

                        <div className="h-8 w-[1px] bg-border/50" />

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-3 hover:opacity-80 transition-opacity outline-none group text-left">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[11px] font-black text-foreground tracking-tight uppercase group-hover:text-primary transition-colors">{user?.username || 'Identity'}</span>
                                        <span className="text-[9px] font-bold text-green-500 uppercase tracking-widest">v4.2-stable</span>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl premium-gradient p-[1px] shadow-lg shadow-indigo-500/10 group-hover:scale-105 transition-transform">
                                        <div className="w-full h-full rounded-2xl bg-card flex items-center justify-center font-black text-xs uppercase">
                                            {user?.username ? user.username.substring(0, 2) : '??'}
                                        </div>
                                    </div>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-2xl border-border bg-card shadow-premium p-2 animate-in fade-in zoom-in-95 duration-200">
                                <DropdownMenuLabel className="px-3 py-2">
                                    <div className="flex flex-col gap-0.5">
                                        <p className="text-xs font-black uppercase tracking-widest opacity-40">User Profile</p>
                                        <p className="text-sm font-bold truncate">{user?.username}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-border/50 my-1" />
                                <DropdownMenuItem
                                    onClick={() => navigate('/profile')}
                                    className="rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer focus:bg-primary/10 transition-colors"
                                >
                                    <UserIcon className="w-4 h-4 text-primary" />
                                    <span className="text-sm font-semibold">Account Detail</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => navigate('/api-keys')}
                                    className="rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer focus:bg-primary/10 transition-colors"
                                >
                                    <Key className="w-4 h-4 text-primary" />
                                    <span className="text-sm font-semibold">API Keys</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-border/50 my-1" />
                                <DropdownMenuItem
                                    onClick={logout}
                                    className="rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer focus:bg-destructive/10 text-destructive transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span className="text-sm font-black uppercase tracking-widest text-[10px]">Sign Out System</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                <main className="p-6 flex-1 overflow-y-auto bg-background/50">
                    <div className="max-w-[1400px] mx-auto h-full">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Layout;
