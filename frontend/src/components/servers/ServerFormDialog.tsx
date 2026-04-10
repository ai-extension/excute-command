import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { SearchableSelect } from '../SearchableSelect';
import { Server, VpnConfig } from '../../types';

interface ServerFormDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    editingServer: Server | null;
    formData: Partial<Server>;
    setFormData: (data: Partial<Server>) => void;
    onSave: () => void;
    vpns: VpnConfig[];
}

export const ServerFormDialog: React.FC<ServerFormDialogProps> = ({
    isOpen,
    onOpenChange,
    editingServer,
    formData,
    setFormData,
    onSave,
    vpns
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] bg-card border-border rounded-2xl shadow-premium">
                <DialogHeader>
                    <DialogTitle className="text-sm font-black uppercase tracking-widest">{editingServer ? 'Edit Host Configuration' : 'Register New Host'}</DialogTitle>
                    <DialogDescription className="text-[11px] font-medium opacity-60 uppercase tracking-tighter">
                        Configure SSH connectivity for direct command execution.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right text-[10px] font-black uppercase opacity-60">Identity</Label>
                        <Input
                            id="name"
                            value={formData.name || ''}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="col-span-3 text-xs font-bold bg-background border-border"
                            placeholder="Prod Server 01"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="host" className="text-right text-[10px] font-black uppercase opacity-60">Endpoint</Label>
                        <div className="col-span-3 flex gap-2">
                            <Input
                                id="host"
                                value={formData.host || ''}
                                onChange={e => setFormData({ ...formData, host: e.target.value })}
                                className="flex-1 text-xs font-bold bg-background border-border"
                                placeholder="192.168.1.100"
                            />
                            <Input
                                type="number"
                                value={formData.port || 22}
                                onChange={e => setFormData({ ...formData, port: parseInt(e.target.value) })}
                                className="w-20 text-xs font-bold bg-background border-border"
                                placeholder="22"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="user" className="text-right text-[10px] font-black uppercase opacity-60">User</Label>
                        <Input
                            id="user"
                            value={formData.user || ''}
                            onChange={e => setFormData({ ...formData, user: e.target.value })}
                            className="col-span-3 text-xs font-bold bg-background border-border"
                            placeholder="root"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right text-[10px] font-black uppercase opacity-60">VPN Proxy</Label>
                        <SearchableSelect
                            options={[
                                { label: 'Direct Connection (No VPN)', value: 'none' },
                                ...vpns.map(v => ({ label: v.name.toUpperCase(), value: v.id }))
                            ]}
                            value={(formData.vpn_id || "none") as string}
                            onValueChange={(val) => setFormData({ ...formData, vpn_id: val })}
                            isSearchable
                            placeholder="Direct Connection (No VPN)"
                            triggerClassName="col-span-3 text-xs font-bold bg-background border-border"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right text-[10px] font-black uppercase opacity-60">Protocol</Label>
                        <SearchableSelect
                            options={[
                                { label: 'SSH PASSWORD', value: 'PASSWORD' },
                                { label: 'PUBLIC KEY (RSA/ED25519)', value: 'PUBLIC_KEY' }
                            ]}
                            value={formData.auth_type || "PASSWORD"}
                            onValueChange={(val) => setFormData({ ...formData, auth_type: val as 'PASSWORD' | 'PUBLIC_KEY' })}
                            triggerClassName="col-span-3 text-xs font-bold bg-background border-border"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right text-[10px] font-black uppercase opacity-60">
                            {formData.auth_type === 'PASSWORD' ? 'Secret' : 'Priv Key'}
                        </Label>
                        {formData.auth_type === 'PASSWORD' ? (
                            <Input
                                type="password"
                                value={formData.password || ''}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="col-span-3 text-xs font-bold bg-background border-border"
                                placeholder="••••••••"
                            />
                        ) : (
                            <Textarea
                                value={formData.private_key || ''}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, private_key: e.target.value })}
                                className="col-span-3 text-xs font-mono bg-background border-border resize-none h-24"
                                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                            />
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="text-[10px] font-black uppercase tracking-widest border-border"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={onSave}
                        className="premium-gradient shadow-premium text-[10px] font-black uppercase tracking-widest"
                    >
                        Commit Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
