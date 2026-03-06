import React from 'react';
import { Zap, Play, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { PageWidget } from '../../types';

interface EndpointWidgetProps {
    widget: PageWidget;
    isRunning: boolean;
    result: { success: boolean, message: string } | undefined;
    onRun: (widget: PageWidget) => void;
}

const EndpointWidget: React.FC<EndpointWidgetProps> = ({
    widget,
    isRunning,
    result,
    onRun
}) => {
    return (
        <div className={cn(
            "p-10 bg-card border border-border rounded-[3rem] shadow-xl flex flex-col justify-between min-h-[260px] transition-all hover:border-primary/50 group",
            widget.size === 'full' ? "w-full" : "w-full md:w-[calc(50%-16px)]"
        )}>
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-5">
                        <div className="p-4 rounded-[1.5rem] bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:bg-primary group-hover:text-white transition-all duration-300">
                            <Zap className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black tracking-tight uppercase leading-tight">{widget.title}</h3>
                            <Badge variant="outline" className="text-[8px] font-black uppercase tracking-[0.25em] px-2 h-5 mt-1.5 border-primary/30 text-primary/70">Terminal Access Port</Badge>
                        </div>
                    </div>
                </div>
                <p className="text-[13px] font-medium text-muted-foreground mt-6 opacity-60 leading-relaxed max-w-[90%]">
                    {widget.description || "Launch automated system orchestration pipeline with real-time feedback loop."}
                </p>
            </div>

            <div className="pt-10">
                <Button
                    onClick={() => onRun(widget)}
                    disabled={isRunning}
                    className={cn(
                        "w-full h-16 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[11px] shadow-premium transition-all active:scale-[0.98]",
                        result ? (result.success ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-rose-500 hover:bg-rose-600 text-white") : (widget.style || "premium-gradient")
                    )}
                >
                    {isRunning ? (
                        <div className="flex items-center gap-3">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span>Running...</span>
                        </div>
                    ) : result ? (
                        <div className="flex items-center gap-2">
                            {result.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                            <span>{result.message}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <Play className="w-5 h-5 fill-current" />
                            <span>{widget.label || 'Initiate'}</span>
                        </div>
                    )}
                </Button>
            </div>
        </div>
    );
};

export default EndpointWidget;
