import React from 'react';
import { Terminal, X, Play, Loader2, StopCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import TerminalLog from '../TerminalLog';
import { cn } from '../../lib/utils';

interface TestRunModalProps {
    isOpen: boolean;
    onClose: () => void;
    workflowID: string;
    transientID: string | null;
    groupName: string;
    isRunning: boolean;
    onComplete?: () => void;
}

export const TestRunModal: React.FC<TestRunModalProps> = ({
    isOpen,
    onClose,
    workflowID,
    transientID,
    groupName,
    isRunning,
    onComplete
}) => {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[90vw] md:max-w-[1000px] h-[85vh] flex flex-col p-0 overflow-hidden border-border bg-background shadow-xl">
                <DialogHeader className="px-6 py-4 border-b bg-muted/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center border transition-colors",
                                isRunning
                                    ? "bg-primary/10 border-primary/20 text-primary"
                                    : "bg-muted border-border text-muted-foreground"
                            )}>
                                {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                            </div>
                            <div className="flex flex-col">
                                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                                    Test Run: {groupName}
                                    {isRunning && (
                                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                    )}
                                </DialogTitle>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-mono opacity-70">
                                        ID: {transientID || 'Awaiting initialization...'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pr-10">
                            <Button
                                variant="destructive"
                                onClick={onClose}
                                disabled={!isRunning}
                                className="h-6 px-3 text-xs font-semibold gap-2 border-none shadow-lg shadow-destructive/10"
                            >
                                <StopCircle className="w-4 h-4" /> Terminate
                            </Button>

                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 bg-zinc-950 overflow-hidden flex flex-col">
                    {transientID ? (
                        <TerminalLog
                            targetID={workflowID}
                            executionID={transientID}
                            isActive={isOpen}
                            isLive={true}
                            showHeader={false}
                            onComplete={onComplete}
                            className="flex-1"
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-500">
                            <Terminal className="w-8 h-8 opacity-20" />
                            <p className="text-xs font-medium animate-pulse">
                                Connecting to execution engine...
                            </p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
