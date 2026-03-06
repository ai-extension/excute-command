import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, XCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { TAGGABLE_RESOURCES, NAMESPACE_SCOPED_RESOURCES } from '../config/permissions';
import { API_BASE_URL } from '../lib/api';

function getCookie(name: string) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
}

interface User {
    id: string;
    username: string;
    full_name: string;
    email: string;
    roles: any[];
}

interface UserSettings {
    site_title?: string;
    site_logo?: string;
    allow_registration?: string;
    google_auth_enabled?: string;
    facebook_auth_enabled?: string;
    [key: string]: string | undefined;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    settings: UserSettings;
    refreshSettings: () => Promise<void>;
    apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    hasPermission: (type: string, action: string, resourceId?: string | null, namespaceId?: string | null, tagIds?: string[]) => boolean;
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
        return getCookie('auth_token');
    });
    const [settings, setSettings] = useState<UserSettings>({});

    const refreshSettings = useCallback(async () => {
        try {
            // First try to fetch protected settings if we have a token
            const isAuth = !!getCookie('auth_token') || !!token;
            const endpoint = isAuth ? `${API_BASE_URL}/settings` : `${API_BASE_URL}/settings/public`;
            
            const response = await fetch(endpoint, {
                headers: { 'Accept': 'application/json' },
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                // Handle both array/map from /settings and the object from /settings/public
                if (Array.isArray(data)) {
                    const mapped: UserSettings = {};
                    data.forEach((s: any) => { mapped[s.key] = s.value; });
                    setSettings(mapped);
                } else {
                    // It's already a map or object
                    setSettings(data);
                }
            }
        } catch (err) {
            console.error("Failed to fetch settings", err);
        }
    }, [token]);

    const logout = useCallback(async () => {
        // Call backend to clear the HttpOnly cookie
        try {
            await fetch(`${API_BASE_URL}/logout`, { method: 'POST' });
        } catch (e) {
            console.error("Logout request failed", e);
        }

        setToken(null);
        setUser(null);
        localStorage.removeItem('auth_user');
    }, []);

    const login = useCallback((newToken: string, newUser: User) => {
        // newToken is passed from the API response to indicate successful login.
        // The actual token is stored in the HttpOnly cookie by the browser.
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('auth_user', JSON.stringify(newUser));
    }, []);

    const [isLoading, setIsLoading] = useState(true);

    // Initial auth check on mount
    useEffect(() => {
        const verifyAuth = async () => {
            const hasCookie = !!getCookie('auth_token');
            if (hasCookie) {
                try {
                    const response = await fetch(`${API_BASE_URL}/me`, {
                        headers: { 'Accept': 'application/json' },
                        credentials: 'include'
                    });
                    if (response.ok) {
                        const userData = await response.json();
                        setUser(userData);
                        setToken('cookie_managed'); // Mark as being managed by cookies
                        localStorage.setItem('auth_user', JSON.stringify(userData));
                    } else {
                        // Cookie exists but invalid session
                        await logout();
                    }
                } catch (err) {
                    console.error("Auth verification failed", err);
                    await logout();
                }
            } else {
                // No cookie, definitely not logged in
                setUser(null);
                setToken(null);
                localStorage.removeItem('auth_user');
            }
            setIsLoading(false);
            await refreshSettings();
        };

        verifyAuth();
    }, [logout, refreshSettings]);

    // Hydrate token state on cookie changes (subset of verifyAuth logic)
    useEffect(() => {
        const cookieToken = getCookie('auth_token');
        if (cookieToken && !token) {
            setToken(cookieToken);
        } else if (!cookieToken && token) {
            setToken(null);
            setUser(null);
        }
    }, [token]);

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


    const apiFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        const currentToken = getCookie('auth_token') || token;

        if (currentToken && currentToken !== "cookie_managed" && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${currentToken}`);
        }

        const fetchInit: RequestInit = {
            ...init,
            headers,
            credentials: 'include', // Ensure cookies are sent (especially auth_token)
        };

        const response = await fetch(input, fetchInit);

        if (!response.ok) {
            if (response.status === 401) {
                const data = await response.clone().json().catch(() => ({}));
                if (data.error && (data.error.includes('expired') || data.error.includes('invalid') || data.error.includes('Authentication'))) {
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

    const hasPermission = useCallback((type: string, action: string, resourceId: string | null = null, namespaceId: string | null = null, tagIds: string[] = []): boolean => {
        if (!user || !user.username) return false;
        if (user.username === 'admin') return true;

        const allPerms = user.roles?.flatMap(role => role.permissions || []) || [];

        // 1. Item Level: Direct permission on this specific resource ID
        if (resourceId) {
            const hasItemPerm = allPerms.some((rp: any) => {
                const perm = rp.permission;
                return perm && perm.type === type && perm.action === action && rp.resource_id === resourceId;
            });
            if (hasItemPerm) return true;
        }

        // 2. Resource Level (Global): Permission on the resource type without a specific ID
        const hasGlobalPerm = allPerms.some((rp: any) => {
            const perm = rp.permission;
            return perm && perm.type === type && perm.action === action && !rp.resource_id;
        });
        if (hasGlobalPerm) return true;

        // If generic check (no resourceId), and we haven't found a global match, 
        // we still return true if ANY matching permission exists.
        // If namespaceId is provided, we prioritize matches within that namespace.
        if (!resourceId) {
            const hasAnyMatch = allPerms.some((rp: any) => {
                const perm = rp.permission;
                if (!perm) return false;

                // 1. Direct type/action match (Global or any specific item)
                if (perm.type === type && perm.action === action) return true;

                // 2. Hierarchical match via Namespace
                if (perm.type === 'namespaces' && perm.action === `RESOURCE_${action}`) {
                    // Global namespace permission or specifically for the active namespace
                    if (!rp.resource_id || (namespaceId && rp.resource_id === namespaceId)) {
                        if (NAMESPACE_SCOPED_RESOURCES.includes(type)) {
                            return true;
                        }
                    }
                }

                // 3. Hierarchical match via Tag
                if (perm.type === 'tags' && perm.action === `RESOURCE_${action}`) {
                    // Only allow tag permissions to reveal menu items for resources that actually support tags
                    // Prevent tag permissions from exposing global resources like servers, vpns, users, etc.
                    // TAGGABLE_RESOURCES is configured in src/config/permissions.ts
                    if (TAGGABLE_RESOURCES.includes(type)) {
                        return true;
                    }
                }

                return false;
            });
            if (hasAnyMatch) return true;
        }

        // 3. Tag Level: Permission via RESOURCE_* on associated tags
        if (tagIds.length > 0) {
            const hasTagPerm = allPerms.some((rp: any) => {
                const perm = rp.permission;
                return perm && perm.type === 'tags' && perm.action === `RESOURCE_${action}` && rp.resource_id && tagIds.includes(rp.resource_id);
            });
            if (hasTagPerm) return true;
        }

        // 4. Namespace Level: Permission via RESOURCE_* on the parent namespace
        if (namespaceId) {
            const hasNamespacePerm = allPerms.some((rp: any) => {
                const perm = rp.permission;
                return perm && perm.type === 'namespaces' && perm.action === `RESOURCE_${action}` && rp.resource_id === namespaceId;
            });
            if (hasNamespacePerm && NAMESPACE_SCOPED_RESOURCES.includes(type)) return true;
        }

        return false;
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading, isAuthenticated: !!token && !isLoading, settings, refreshSettings, apiFetch, hasPermission, showToast }}>
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
