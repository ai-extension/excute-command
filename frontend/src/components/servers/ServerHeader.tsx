import React from 'react';
import { Plus, Server as ServerIcon, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { ResourceFilters } from '../ResourceFilters';
import { VpnConfig } from '../../types';

interface ServerHeaderProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    authTypeFilter: string;
    vpnFilter: string;
    vpns: VpnConfig[];
    isLoading: boolean;
    onApplyFilter: (search: string, filters: { [key: string]: any }) => void;
    onNewServer: () => void;
    onFetchVpns: (query?: string) => void;
    selectedUser?: string;
    availableUsers: any[];
    onFetchUsers: (query: string) => Promise<void>;
    onReset?: () => void;
}

export const ServerHeader: React.FC<ServerHeaderProps> = ({
    searchTerm,
    setSearchTerm,
    authTypeFilter,
    vpnFilter,
    vpns,
    isLoading,
    onApplyFilter,
    onNewServer,
    onFetchVpns,
    selectedUser,
    availableUsers,
    onFetchUsers,
    onReset
}) => {
    return (
        <>
            <div className="flex items-center gap-2 px-1">
                <ServerIcon className="w-3.5 h-3.5 text-primary" />
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em]">
                    <span className="text-primary">Infrastructure</span>
                    <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30" />
                    <span className="text-muted-foreground font-black">Node Fleet</span>
                </div>
            </div>

            <ResourceFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onApply={onApplyFilter}
                onReset={onReset}
                filters={{ authType: authTypeFilter, vpn: vpnFilter, user: selectedUser }}
                filterConfigs={[
                    {
                        key: 'authType',
                        placeholder: 'ALL AUTH',
                        options: [
                            { label: 'ALL AUTH', value: 'ALL' },
                            { label: 'PASSWORD', value: 'PASSWORD' },
                            { label: 'PUB KEY', value: 'PUBLIC_KEY' }
                        ],
                        width: 'w-32',
                        isSearchable: true
                    },
                    {
                        key: 'vpn',
                        placeholder: 'ALL NETS',
                        options: [
                            { label: 'ALL NETS', value: 'ALL' },
                            { label: 'DIRECT', value: 'NONE' },
                            ...vpns.map(v => ({ label: v.name.toUpperCase(), value: v.id }))
                        ],
                        width: 'w-40',
                        isSearchable: true,
                        onSearch: onFetchVpns
                    },
                    {
                        key: 'user',
                        placeholder: 'USER',
                        type: 'single',
                        isSearchable: true,
                        onSearch: onFetchUsers,
                        options: [
                            { label: 'ALL USERS', value: '' },
                            ...availableUsers.map(u => ({ label: u.username.toUpperCase(), value: u.id }))
                        ],
                        width: 'w-48'
                    }
                ]}
                searchPlaceholder="Filter by name, ip, or credentials..."
                isLoading={isLoading}
                primaryAction={
                    <Button
                        onClick={onNewServer}
                        className="px-4 rounded-xl premium-gradient font-black uppercase tracking-widest text-[10px] shadow-premium hover:shadow-indigo-500/25 transition-all gap-2"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Deploy Host
                    </Button>
                }
            />
        </>
    );
};
