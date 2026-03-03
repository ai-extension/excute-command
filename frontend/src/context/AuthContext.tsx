import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, XCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface User {
    id: string;
    username: string;
    email: string;
    roles: any[];
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
    apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    hasPermission: (type: string, action: string, resourceId?: string | null) => boolean;
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface ToastMessage {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(() => {
        const savedUser = localStorage.getItem('auth_user');
        return savedUser ? JSON.parse(savedUser) : null;
    });
    const [token, setToken] = useState<string | null>(() => {
        return localStorage.getItem('auth_token');
    });
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const login = useCallback((newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('auth_token', newToken);
        localStorage.setItem('auth_user', JSON.stringify(newUser));
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
    }, []);

    const apiFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const response = await fetch(input, { ...init, headers });

        if (!response.ok) {
            if (response.status === 401) {
                const data = await response.clone().json().catch(() => ({}));
                if (data.error && (data.error.includes('expired') || data.error.includes('invalid claims'))) {
                    logout();
                }
            } else {
                const data = await response.clone().json().catch(() => ({}));
                const message = data.error || data.message || `Error: ${response.status} ${response.statusText}`;
                showToast(message, 'error');
            }
        }

        return response;
    }, [token, logout, showToast]);

    const hasPermission = useCallback((type: string, action: string, resourceId: string | null = null): boolean => {
        if (!user || !user.username) return false;
        if (user.username === 'admin') return true;

        // Flatten permissions from all roles
        const allPerms = user.roles?.flatMap(role => role.permissions || []) || [];

        return allPerms.some((rp: any) => {
            const perm = rp.permission;
            if (!perm) return false;

            if (perm.type === type && perm.action === action) {
                // If checking for generic access (no resourceId provided), 
                // any permission entry for this type/action is sufficient.
                if (!resourceId) return true;

                // If checking for a specific resource:
                // 1. It matches if the permission is global (no rp.resource_id)
                // 2. It matches if the permission is for this specific resource
                if (!rp.resource_id || rp.resource_id === resourceId) return true;
            }
            return false;
        });
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, apiFetch, hasPermission, showToast }}>
            {children}
            {/* Custom Toast Container */}
            <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-sm">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={cn(
                            "pointer-events-auto flex items-start gap-4 p-4 rounded-2xl border shadow-2xl animate-in slide-in-from-right-full duration-500",
                            t.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                                t.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                                    "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                        )}
                    >
                        <div className="mt-0.5">
                            {t.type === 'error' ? <XCircle className="h-5 w-5" /> :
                                t.type === 'success' ? <CheckCircle className="h-5 w-5" /> :
                                    <Info className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 space-y-1">
                            <p className="text-xs font-black uppercase tracking-widest opacity-60">
                                {t.type === 'error' ? 'System Error' : t.type === 'success' ? 'Success' : 'Notification'}
                            </p>
                            <p className="text-sm font-bold leading-relaxed">{t.message}</p>
                        </div>
                        <button
                            onClick={() => removeToast(t.id)}
                            className="text-foreground/40 hover:text-foreground transition-colors p-1"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
