import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Terminal, Settings, HelpCircle, Command as CommandIcon } from 'lucide-react';

const Sidebar = () => {
    const navItems = [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Commands', path: '/commands', icon: Terminal },
        { name: 'Settings', path: '/settings', icon: Settings },
    ];

    return (
        <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
            <div className="p-6 flex items-center gap-3">
                <CommandIcon className="w-8 h-8 text-blue-500" />
                <span className="text-xl font-bold tracking-tight">CSM Admin</span>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-2">
                {navItems.map((item) => (
                    <NavLink
                        key={item.name}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`
                        }
                    >
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.name}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-gray-800">
                <a href="#" className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white transition-colors">
                    <HelpCircle className="w-5 h-5" />
                    <span className="font-medium">Documentation</span>
                </a>
            </div>
        </div>
    );
};

export default Sidebar;
