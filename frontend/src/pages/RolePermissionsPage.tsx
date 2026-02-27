import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Save, Loader2, List, Settings2 } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export default function RolePermissionsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { apiFetch } = useAuth();
    const [role, setRole] = useState<any>(null);
    const [permissions, setPermissions] = useState<any[]>([]);
    const [resources, setResources] = useState<any>({ workflows: [] }); // We can add more resource types later
    const [rolePerms, setRolePerms] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [currentNamespaceId, setCurrentNamespaceId] = useState<string | null>(null);

    useEffect(() => {
        const fetchRoleData = async () => {
            try {
                // Fetch the role details
                const roleRes = await apiFetch(`${API_BASE_URL}/roles`);
                const rolesData = await roleRes.json();
                const currentRole = rolesData.find((r: any) => r.id === id);
                if (currentRole) {
                    setRole(currentRole);
                    setRolePerms(currentRole.permissions || []);
                }

                // Fetch all available permissions
                const permsRes = await apiFetch(`${API_BASE_URL}/permissions`);
                const permsData = await permsRes.json();
                setPermissions(permsData);

                // Assuming namespace context for workflows (fetch default or first available)
                const nsRes = await apiFetch(`${API_BASE_URL}/namespaces`);
                const nsData = await nsRes.json();
                if (nsData && nsData.length > 0) {
                    const nsId = nsData[0].id;
                    setCurrentNamespaceId(nsId);
                    // Fetch workflows to use as resources
                    const wfRes = await apiFetch(`${API_BASE_URL}/namespaces/${nsId}/workflows`);
                    const wfData = await wfRes.json();
                    setResources({ workflows: wfData || [] });
                }

            } catch (error) {
                console.error('Failed to load role data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (id) {
            fetchRoleData();
        }
    }, [id, apiFetch]);

    const handleTogglePermission = (permId: string, isChecked: boolean) => {
        if (isChecked) {
            // Give "All" access by default when checking a new permission
            setRolePerms(prev => [...prev, { permission_id: permId, resource_id: null }]);
        } else {
            // Remove all entries for this permission
            setRolePerms(prev => prev.filter(rp => rp.permission_id !== permId));
        }
    };

    const handleResourceChange = (permId: string, resourceId: string) => {
        setRolePerms(prev => {
            // First remove existing entry for this permission
            const filtered = prev.filter(rp => rp.permission_id !== permId);
            // Then add the newly selected resource scope
            return [...filtered, { permission_id: permId, resource_id: resourceId === 'ALL' ? null : resourceId }];
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = {
                permissions: rolePerms.map(rp => ({
                    permission_id: rp.permission_id || rp.permission?.id, // Handle fresh objects vs existing DB objects
                    resource_id: rp.resource_id
                }))
            };

            const res = await apiFetch(`${API_BASE_URL}/roles/${id}/permissions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                navigate('/roles');
            } else {
                console.error("Failed to save permissions", await res.text());
            }
        } catch (error) {
            console.error('Error saving permissions:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!role) {
        return <div className="p-10 text-center">Role not found</div>;
    }

    const groupedPermissions = permissions.reduce((acc: any, perm: any) => {
        acc[perm.type] = acc[perm.type] || [];
        acc[perm.type].push(perm);
        return acc;
    }, {});

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between bg-card p-6 rounded-3xl border border-border shadow-soft">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/roles')} className="rounded-xl mr-2">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="p-3 bg-primary/10 rounded-2xl">
                        <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter">{role.name} Policies</h1>
                        <p className="text-muted-foreground text-sm font-medium mt-1">Configure fine-grained access control.</p>
                    </div>
                </div>
                <Button onClick={handleSave} disabled={isSaving} className="premium-gradient font-black uppercase tracking-widest text-[10px] h-12 px-8 shadow-premium rounded-xl gap-2">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Policies
                </Button>
            </div>

            <div className="grid gap-6">
                {Object.entries(groupedPermissions).map(([type, perms]: [string, any]) => (
                    <Card key={type} className="border-border shadow-card overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b border-border p-6 flex flex-row items-center gap-3">
                            {type === 'RESOURCE' ? <List className="w-5 h-5 text-primary" /> : <Settings2 className="w-5 h-5 text-primary" />}
                            <div>
                                <CardTitle className="text-lg font-black tracking-tight">{type} Capabilities</CardTitle>
                                <CardDescription className="text-xs mt-1">Manage access to {type.toLowerCase()} entities.</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ul className="divide-y divide-border">
                                {perms.map((perm: any) => {
                                    // Check if this permission is currently assigned
                                    const assignedPerm = rolePerms.find(rp => (rp.permission_id === perm.id) || (rp.permission?.id === perm.id));
                                    const isEnabled = !!assignedPerm;

                                    // Determine if this permission is resource-specific. (e.g., executing a workflow)
                                    // Normally you'd rely on an attribute from the DB, but we can infer for workflows for now.
                                    const isResourceSpecific = perm.name.toLowerCase().includes('workflow');

                                    return (
                                        <li key={perm.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-muted/10 transition-colors">
                                            <div className="flex flex-col gap-2 flex-grow">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Label className="text-base font-bold cursor-pointer" htmlFor={`perm-${perm.id}`}>
                                                            {perm.name}
                                                        </Label>
                                                        <Badge variant="outline" className="text-[10px] uppercase font-black bg-background border-border text-muted-foreground">
                                                            {perm.action}
                                                        </Badge>
                                                    </div>
                                                    <Switch
                                                        id={`perm-${perm.id}`}
                                                        checked={isEnabled}
                                                        onCheckedChange={(checked) => handleTogglePermission(perm.id, checked)}
                                                        className="data-[state=checked]:bg-primary"
                                                    />
                                                </div>

                                                {isEnabled && isResourceSpecific && (
                                                    <div className="mt-4 p-4 rounded-2xl bg-muted/40 border border-border/50 flex items-center gap-4 animate-in slide-in-from-top-2">
                                                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground w-1/4">Resource Scope:</p>
                                                        <div className="flex-1">
                                                            <Select
                                                                value={assignedPerm.resource_id || 'ALL'}
                                                                onValueChange={(val: string) => handleResourceChange(perm.id, val)}
                                                            >
                                                                <SelectTrigger className="w-full h-10 rounded-xl bg-background border-border font-medium">
                                                                    <SelectValue placeholder="Select resource scope..." />
                                                                </SelectTrigger>
                                                                <SelectContent className="rounded-xl border-border">
                                                                    <SelectItem value="ALL" className="font-bold">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2 h-2 rounded-full bg-primary" />
                                                                            All Resources
                                                                        </div>
                                                                    </SelectItem>
                                                                    {resources.workflows.map((wf: any) => (
                                                                        <SelectItem key={wf.id} value={wf.id} className="font-medium">
                                                                            {wf.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
