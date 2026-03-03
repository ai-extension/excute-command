import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../lib/api';

interface Namespace {
    id: string;
    name: string;
    description: string;
}

interface NamespaceContextType {
    namespaces: Namespace[];
    activeNamespace: Namespace | null;
    setActiveNamespace: (ns: Namespace) => void;
    isLoading: boolean;
    refreshNamespaces: () => Promise<void>;
}

const NamespaceContext = createContext<NamespaceContextType | undefined>(undefined);

export const NamespaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token, isAuthenticated } = useAuth();
    const [namespaces, setNamespaces] = useState<Namespace[]>([]);
    const [activeNamespace, setActiveNamespaceState] = useState<Namespace | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshNamespaces = useCallback(async () => {
        if (!isAuthenticated) {
            setIsLoading(false);
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/namespaces`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.status === 401) {
                // Token expired or invalid
                return;
            }
            const data = await response.json();
            setNamespaces(data || []);

            if (data && data.length > 0) {
                const storedId = localStorage.getItem('activeNamespaceId');
                const savedNs = data.find((n: Namespace) => n.id === storedId);
                if (savedNs) {
                    setActiveNamespaceState(savedNs);
                } else {
                    setActiveNamespaceState(data[0]);
                    localStorage.setItem('activeNamespaceId', data[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to fetch namespaces:', error);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated, token]);

    const setActiveNamespace = useCallback((ns: Namespace) => {
        setActiveNamespaceState(ns);
        localStorage.setItem('activeNamespaceId', ns.id);
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            refreshNamespaces();
        } else {
            setNamespaces([]);
            setActiveNamespaceState(null);
            setIsLoading(false);
        }
    }, [isAuthenticated, token]);

    return (
        <NamespaceContext.Provider value={{ namespaces, activeNamespace, setActiveNamespace, isLoading, refreshNamespaces }}>
            {children}
        </NamespaceContext.Provider>
    );
};

export const useNamespace = () => {
    const context = useContext(NamespaceContext);
    if (context === undefined) {
        throw new Error('useNamespace must be used within a NamespaceProvider');
    }
    return context;
};
