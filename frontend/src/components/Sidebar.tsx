import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Terminal, Settings, Box, ChevronsLeft, ChevronsRight, Zap, LogOut, Users, Shield, Server, History } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';

import NamespaceSwitcher from './NamespaceSwitcher';

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (value: boolean) => void;
}

const Sidebar = ({ isCollapsed, setIsCollapsed }: SidebarProps) => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();

    const navItems = [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Workflows', path: '/workflows', icon: Zap },
        { name: 'History', path: '/history', icon: History },
        { name: 'Servers', path: '/servers', icon: Server },
    ];

    const identityItems = [
        { name: 'Users', path: '/users', icon: Users },
        { name: 'Roles', path: '/roles', icon: Shield },
    ];

    return (
        <aside
            className={cn(
                "bg-[var(--sidebar-bg)] border-r border-border h-screen sticky top-0 shrink-0 z-40 flex flex-col transition-all duration-500 shadow-sidebar overflow-hidden",
                isCollapsed ? "w-20 p-3 items-center gap-6" : "w-72 p-4 gap-6"
            )}
        >
            <div className={cn("flex items-center gap-2.5 px-1 relative w-full mb-2", isCollapsed && "justify-center px-0")}>
                <div className="premium-gradient p-2 rounded-lg shadow-premium rotate-3 hover:rotate-0 transition-transform duration-300 shrink-0">
                    <Zap className="w-5 h-5 text-white" />
                </div>
                {!isCollapsed && (
                    <div className="flex flex-col animate-in fade-in slide-in-from-left-2 duration-500">
                        <span className="text-lg font-black tracking-tighter leading-none">ANTIGRAVITY</span>
                        <span className="text-[9px] font-bold text-primary tracking-[0.2em] uppercase mt-0.5 opacity-80">Execution Engine</span>
                    </div>
                )}
            </div>

            <NamespaceSwitcher isCollapsed={isCollapsed} />

            <div className="flex-1 flex flex-col gap-6 w-full overflow-y-auto py-4">
                <div className="w-full">
                    {!isCollapsed && (
                        <p className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4 opacity-50 animate-in fade-in duration-500">Operational</p>
                    )}
                    <nav className="flex flex-col gap-1.5 w-full">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                title={isCollapsed ? item.name : ""}
                                className={({ isActive }) =>
                                    cn(
                                        "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-300 group relative overflow-hidden",
                                        isActive
                                            ? "bg-primary text-white shadow-premium scale-[1.02]"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-1",
                                        isCollapsed && "justify-center px-0 h-11 w-11 mx-auto"
                                    )
                                }
                            >
                                <item.icon className={cn("w-4 h-4 transition-transform duration-300 group-hover:scale-110 shrink-0")} />
                                {!isCollapsed && (
                                    <span className="text-[13px] font-semibold tracking-tight animate-in fade-in slide-in-from-left-1 duration-300">{item.name}</span>
                                )}
                                {!isCollapsed && (
                                    <div className="absolute right-3 opacity-20 group-hover:opacity-100 transition-opacity">
                                        <Zap className="w-3 h-3 fill-current" />
                                    </div>
                                )}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="w-full">
                    {!isCollapsed && (
                        <p className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4 opacity-50 animate-in fade-in duration-500">Identity</p>
                    )}
                    <nav className="flex flex-col gap-1.5 w-full">
                        {identityItems.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                title={isCollapsed ? item.name : ""}
                                className={({ isActive }) =>
                                    cn(
                                        "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-300 group relative overflow-hidden",
                                        isActive
                                            ? "bg-primary text-white shadow-premium scale-[1.02]"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-1",
                                        isCollapsed && "justify-center px-0 h-11 w-11 mx-auto"
                                    )
                                }
                            >
                                <item.icon className={cn("w-4 h-4 transition-transform duration-300 group-hover:scale-110 shrink-0")} />
                                {!isCollapsed && (
                                    <span className="text-[13px] font-semibold tracking-tight animate-in fade-in slide-in-from-left-1 duration-300">{item.name}</span>
                                )}
                            </NavLink>
                        ))}
                    </nav>
                </div>
            </div>

            <div className="flex flex-col gap-2 w-full mt-auto pt-4 border-t border-border">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={cn(
                        "h-10 w-10 rounded-xl hover:bg-muted text-muted-foreground hover:text-primary transition-all duration-300 mx-auto",
                        !isCollapsed && "w-full gap-2 px-4 justify-start h-10"
                    )}
                >
                    {isCollapsed ? (
                        <ChevronsRight className="w-5 h-5" />
                    ) : (
                        <>
                            <ChevronsLeft className="w-5 h-5" />
                            <span className="text-[11px] font-black uppercase tracking-widest">Collapse Sidebar</span>
                        </>
                    )}
                </Button>
            </div>
        </aside>
    );
};

export default Sidebar;
