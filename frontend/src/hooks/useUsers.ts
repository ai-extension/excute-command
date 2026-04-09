import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { User } from '../types';

export const useUsers = () => {
    const { apiFetch } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchUsers = useCallback(async (search?: string) => {
        setIsLoading(true);
        try {
            let url = `${API_BASE_URL}/users?limit=100`;
            if (search) {
                url += `&search=${encodeURIComponent(search)}`;
            }
            const response = await apiFetch(url);
            if (response.ok) {
                const data = await response.json();
                setUsers(data.items || []);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setIsLoading(false);
        }
    }, [apiFetch]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    return { users, isLoading, fetchUsers };
};
