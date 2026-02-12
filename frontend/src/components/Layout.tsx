import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = () => {
    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                <header className="h-16 bg-white border-b flex items-center px-8 shadow-sm">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                        Command Step Manager
                    </h2>
                </header>
                <div className="p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
