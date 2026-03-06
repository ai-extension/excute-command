import React from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface PasswordProtectionProps {
    pageTitle: string;
    password: string;
    setPassword: (password: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    isVerifying: boolean;
    error: string | null;
    tokenExpired: boolean;
}

const PasswordProtection: React.FC<PasswordProtectionProps> = ({
    pageTitle,
    password,
    setPassword,
    onSubmit,
    isVerifying,
    error,
    tokenExpired
}) => {
    return (
        <div className="min-h-screen bg-[var(--sidebar-bg)] flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md bg-card border border-border rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-500">
                <div className="text-center mb-10">
                    <div className="inline-flex p-5 rounded-[2rem] bg-emerald-500/10 text-emerald-500 mb-6 ring-1 ring-emerald-500/20">
                        <ShieldCheck className="w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter uppercase mb-2">Encrypted Access</h1>
                    <p className="text-muted-foreground text-sm font-medium">Password required for <span className="text-emerald-500 font-bold">"{pageTitle}"</span></p>
                </div>

                <form onSubmit={onSubmit} className="space-y-6">
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-14 bg-background border-border rounded-2xl text-center text-xl tracking-widest font-mono"
                        autoFocus
                    />
                    {error && <p className="text-destructive text-xs font-bold text-center">{error}</p>}
                    {tokenExpired && <p className="text-amber-500 text-[10px] font-bold text-center uppercase tracking-widest">Session Expired</p>}
                    <Button
                        type="submit"
                        disabled={isVerifying || !password}
                        className="w-full h-14 rounded-2xl premium-gradient text-white shadow-premium text-[11px] font-black uppercase tracking-[0.2em]"
                    >
                        {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Unlock Interface"}
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default PasswordProtection;
