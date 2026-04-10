import React from 'react';
import { Terminal, CheckCircle2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
} from "../ui/dialog";
import { Badge } from '../ui/badge';
import XTerminal from '../XTerminal';
import { cn } from '../../lib/utils';
import { Server } from '../../types';

interface ServerTerminalDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    server: Server | null;
    sessionID: string | null;
    isMaximized: boolean;
    setIsMaximized: (maximized: boolean) => void;
}

export const ServerTerminalDialog: React.FC<ServerTerminalDialogProps> = ({
    isOpen,
    onOpenChange,
    server,
    sessionID,
    isMaximized,
    setIsMaximized
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className={cn(
                "bg-[#0a0b0e] border-[#1a1c23] border-2 rounded-2xl p-0 overflow-hidden shadow-2xl transition-all duration-300 [&>button]:hidden",
                isMaximized
                    ? "fixed inset-0 w-screen h-screen max-w-none rounded-none !m-0 border-0 translate-x-0 translate-y-0 left-0 top-0"
                    : "max-w-3xl h-[600px]"
            )}>
                <div className="flex items-center justify-between pl-4 pr-2 py-3 bg-[#13151b] border-b border-[#1f212a] select-none">
                    <div className="flex items-center gap-4">
                        <div className="flex gap-2 mr-1">
                            <button
                                onClick={() => onOpenChange(false)}
                                className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-inner hover:bg-[#ff5f56]/80 transition-colors cursor-pointer border border-black/10"
                                title="Close Session"
                            />
                            <button
                                onClick={() => onOpenChange(false)}
                                className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-inner hover:bg-[#ffbd2e]/80 transition-colors cursor-pointer border border-black/10"
                                title="Minimize"
                            />
                            <button
                                onClick={() => setIsMaximized(!isMaximized)}
                                className="w-3 h-3 rounded-full bg-[#27c93f] shadow-inner hover:bg-[#27c93f]/80 transition-colors cursor-pointer border border-black/10"
                                title="Toggle Fullscreen"
                            />
                        </div>
                        <div className="flex items-center gap-3 py-1 px-3 bg-black/30 rounded-full border border-white/5">
                            <Terminal className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">
                                {server?.name} <span className="text-zinc-600 mx-1">•</span> {server?.host}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 mr-2">
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                sessionID ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" : "bg-zinc-700"
                            )} />
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                                {sessionID ? 'Session Active' : 'Connecting...'}
                            </span>
                        </div>

                        <Badge variant="outline" className="text-[8px] font-black tracking-[0.2em] border-primary/20 bg-primary/5 text-primary py-0.5 px-2">
                            SSH PTY v1.0
                        </Badge>
                    </div>
                </div>

                <div className={cn(
                    "p-1 bg-[#0a0b0e] flex-1",
                    isMaximized ? "h-[calc(100vh-52px)]" : "h-[545px]"
                )}>
                    {server && sessionID ? (
                        <XTerminal
                            sessionID={sessionID}
                            isActive={isOpen}
                            className="h-full"
                        />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                                <Terminal className="w-10 h-10 text-primary relative animate-bounce" />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <p className="text-[11px] font-black uppercase tracking-[0.4em] text-zinc-600">
                                    Handshaking Interface...
                                </p>
                                <div className="w-32 h-0.5 bg-zinc-900 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary w-1/3 animate-[shimmer_2s_infinite_linear]" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
