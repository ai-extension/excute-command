import React from 'react';
import { X, ChevronDown, Maximize2, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import AnsiText from '../AnsiText';

interface PageExecutionTerminalProps {
    activeExecutionId: string | null;
    executionStatus: string | null;
    executionLogs: string;
    terminalState: 'normal' | 'minimized' | 'maximized';
    setTerminalState: (state: 'normal' | 'minimized' | 'maximized') => void;
    onClose: () => void;
}

const PageExecutionTerminal: React.FC<PageExecutionTerminalProps> = ({
    activeExecutionId,
    executionStatus,
    executionLogs,
    terminalState,
    setTerminalState,
    onClose
}) => {
    if (!activeExecutionId) return null;

    return (
        <div className={cn(
            "fixed z-[110] transition-all duration-500 ease-in-out",
            terminalState === 'minimized' ? "bottom-8 right-8 w-[300px] h-[64px]" :
                terminalState === 'maximized' ? "inset-8 w-auto h-auto" :
                    "bottom-8 right-8 w-full max-w-2xl h-[450px]"
        )}>
            <div className="w-full h-full bg-[#0a0a0c] border border-white/10 rounded-[2rem] shadow-[0_24px_80px_rgba(0,0,0,0.8),0_0_20px_rgba(var(--primary-rgb),0.1)] overflow-hidden flex flex-col animate-in slide-in-from-right-16 duration-500">
                {/* Terminal Header */}
                <div className="bg-white/5 px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Traffic Light Controls */}
                        <div className="flex gap-1 mr-2">
                            <button
                                onClick={onClose}
                                className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] border border-[#e0443e] hover:bg-[#ff5f56]/80 transition-all flex items-center justify-center group/btn"
                            >
                                <X className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                            </button>
                            <button
                                onClick={() => setTerminalState('minimized')}
                                className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123] hover:bg-[#ffbd2e]/80 transition-all flex items-center justify-center group/btn"
                            >
                                <ChevronDown className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                            </button>
                            <button
                                onClick={() => setTerminalState(terminalState === 'maximized' ? 'normal' : 'maximized')}
                                className="w-2.5 h-2.5 rounded-full bg-[#27c93f] border border-[#1aab29] hover:bg-[#27c93f]/80 transition-all flex items-center justify-center group/btn"
                            >
                                <Maximize2 className="w-1.5 h-1.5 text-black opacity-0 group-hover/btn:opacity-100" />
                            </button>
                        </div>
                        <div className="flex items-center gap-2" onClick={() => terminalState === 'minimized' && setTerminalState('normal')}>
                            <div className={cn("w-1.5 h-1.5 rounded-full",
                                executionStatus === 'RUNNING' ? "bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary-rgb),0.8)]" :
                                    executionStatus === 'SUCCESS' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" :
                                        "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]")} />
                            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">Trace: {executionStatus || 'POLLING'}</h3>
                        </div>
                    </div>
                    {terminalState === 'minimized' && (
                        <button onClick={() => setTerminalState('normal')} className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 transition-all">
                            <ChevronUp className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Terminal Body */}
                {terminalState !== 'minimized' && (
                    <div className="flex-1 flex flex-col min-h-0 bg-black/40">
                        <div className="flex-1 overflow-y-auto p-8 font-mono text-[12px] leading-relaxed scrollbar-thin selection:bg-primary/40 selection:text-white">
                            {executionLogs ? executionLogs.split('\n').filter((l, i, arr) => l !== '' || i < arr.length - 1).map((line, i) => (
                                <div key={i} className="whitespace-pre-wrap min-h-[1.2rem]">
                                    <AnsiText text={line} />
                                </div>
                            )) : <div className="text-zinc-700 animate-pulse">Waiting for system buffer...</div>}
                            <div className="h-4" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PageExecutionTerminal;
