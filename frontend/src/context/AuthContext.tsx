import React, { createContext, useContext, useState, useEffect } from 'react';

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

    const login = (newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('auth_token', newToken);
        localStorage.setItem('auth_user', JSON.stringify(newUser));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
    };

    const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const response = await fetch(input, { ...init, headers });

        if (response.status === 401) {
            const data = await response.clone().json().catch(() => ({}));
            if (data.error && (data.error.includes('expired') || data.error.includes('invalid claims'))) {
                logout();
                // Optionally redirect is handled by App.tsx's ProtectedRoute
            }
        }

        return response;
    };

    const hasPermission = (type: string, action: string, resourceId: string | null = null): boolean => {
        if (!user || !user.username) return false;
        if (user.username === 'admin') return true;

        // Flatten permissions from all roles
        const allPerms = user.roles?.flatMap(role => role.permissions || []) || [];

        return allPerms.some((rp: any) => {
            const perm = rp.permission;
            if (!perm) return false;

            if (perm.type === type && perm.action === action) {
                // Global permission
                if (!rp.resource_id) return true;
                // Specific resource permission
                if (resourceId && rp.resource_id === resourceId) return true;
            }
            return false;
        });
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, apiFetch, hasPermission }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
