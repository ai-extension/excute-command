import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { AlertTriangle, Info, CheckCircle, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description?: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: ConfirmVariant;
    isLoading?: boolean;
}

const getVariantConfig = (variant: ConfirmVariant) => {
    switch (variant) {
        case 'danger':
            return {
                icon: <Trash2 className="w-6 h-6 text-destructive" />,
                bgIcon: 'bg-destructive/10 border-destructive/20',
                btnClass: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            };
        case 'warning':
            return {
                icon: <AlertTriangle className="w-6 h-6 text-amber-500" />,
                bgIcon: 'bg-amber-500/10 border-amber-500/20',
                btnClass: 'bg-amber-500 text-white hover:bg-amber-600',
            };
        case 'success':
            return {
                icon: <CheckCircle className="w-6 h-6 text-emerald-500" />,
                bgIcon: 'bg-emerald-500/10 border-emerald-500/20',
                btnClass: 'bg-emerald-500 text-white hover:bg-emerald-600',
            };
        case 'info':
        default:
            return {
                icon: <Info className="w-6 h-6 text-primary" />,
                bgIcon: 'bg-primary/10 border-primary/20',
                btnClass: 'bg-primary text-primary-foreground hover:bg-primary/90',
            };
    }
};

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'info',
    isLoading = false
}: ConfirmDialogProps) {
    const config = getVariantConfig(variant);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="flex flex-col items-center text-center gap-2 pt-4">
                    <div className={cn("p-4 rounded-full border mb-2", config.bgIcon)}>
                        {config.icon}
                    </div>
                    <DialogTitle className="text-xl">{title}</DialogTitle>
                    {description && (
                        <DialogDescription className="text-sm px-4">
                            {description}
                        </DialogDescription>
                    )}
                </DialogHeader>
                <DialogFooter className="flex w-full sm:justify-center gap-2 pt-4 pb-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 rounded-xl h-10 font-bold uppercase tracking-widest text-[10px]"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        type="button"
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={cn("flex-1 rounded-xl h-10 font-bold uppercase tracking-widest text-[10px]", config.btnClass)}
                    >
                        {isLoading ? 'Processing...' : confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
