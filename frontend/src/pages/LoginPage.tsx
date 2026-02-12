import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Zap, Shield, Lock, User as UserIcon, ArrowRight, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const data = await response.json();
                login(data.token, data.user);
                navigate('/');
            } else {
                const data = await response.json();
                setError(data.error || 'Login failed');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
            {/* Dark background particles/gradients */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/10 blur-[120px] rounded-full -ml-64 -mb-64" />

            <div className="w-full max-w-md px-6 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="premium-gradient p-3 rounded-2xl shadow-premium rotate-3 hover:rotate-0 transition-transform duration-500">
                        <Zap className="w-8 h-8 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-3xl font-black tracking-tighter text-white">ANTIGRAVITY</h1>
                        <p className="text-[10px] font-bold text-primary tracking-[0.3em] uppercase opacity-80">Secure Control Plane</p>
                    </div>
                </div>

                <Card className="bg-[#111111] border-border/50 shadow-2xl rounded-2xl overflow-hidden backdrop-blur-xl">
                    <CardHeader className="p-8 pb-4">
                        <CardTitle className="text-xl font-black text-white">Welcome Back</CardTitle>
                        <CardDescription className="text-muted-foreground/60 font-medium pt-1">
                            Access your execution environment and nodes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 pt-4">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 ml-1">Username</label>
                                <div className="relative group">
                                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    <Input
                                        className="h-12 bg-black/40 border-border/50 rounded-xl pl-10 text-white focus-visible:ring-primary/20"
                                        placeholder="admin"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 ml-1">Password</label>
                                <div className="relative group">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    <Input
                                        type="password"
                                        className="h-12 bg-black/40 border-border/50 rounded-xl pl-10 text-white focus-visible:ring-primary/20"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
                                    <Shield className="w-4 h-4 text-destructive shrink-0" />
                                    <p className="text-[11px] font-bold text-destructive">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-12 premium-gradient shadow-premium hover:shadow-indigo-500/25 transition-all text-sm font-black uppercase tracking-widest rounded-xl gap-2 mt-4"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Authenticate"}
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </form>

                        <div className="mt-8 pt-6 border-t border-border/50 text-center">
                            <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                                Default Admin: admin / admin
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default LoginPage;
