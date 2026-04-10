import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface PaginationProps {
    total: number;
    offset: number;
    limit: number;
    itemName?: string;
    onPageChange: (newOffset: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ total, offset, limit, itemName = "items", onPageChange }) => {
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;
    const [jumpPage, setJumpPage] = useState("");

    // Reset jumpPage when offset changes externally
    useEffect(() => {
        setJumpPage("");
    }, [offset]);

    if (total <= 0) return null;

    const handleJumpPage = (e: React.FormEvent) => {
        e.preventDefault();
        const page = parseInt(jumpPage, 10);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
            onPageChange((page - 1) * limit);
            setJumpPage("");
        }
    };

    return (
        <div className="flex items-center justify-between px-4 py-4 bg-muted/10 border-t border-border/50 transition-all duration-300">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Showing {total === 0 ? 0 : offset + 1} to {Math.min(offset + limit, total)} of {total} {itemName}
            </div>
            <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-muted-foreground tracking-tight">
                    Page {currentPage} of {Math.max(1, totalPages)}
                </span>

                <form onSubmit={handleJumpPage} className="flex items-center border border-border rounded-lg overflow-hidden h-8 bg-background shadow-sm hover:border-primary/50 focus-within:border-primary/50 transition-colors">
                    <Input
                        type="number"
                        min={1}
                        max={Math.max(1, totalPages)}
                        value={jumpPage}
                        onChange={(e) => setJumpPage(e.target.value)}
                        placeholder={currentPage.toString()}
                        className="h-full w-14 px-2 text-[10px] font-bold text-center border-0 focus-visible:ring-0 rounded-none bg-transparent"
                    />
                    <Button
                        type="submit"
                        disabled={!jumpPage || parseInt(jumpPage) < 1 || parseInt(jumpPage) > totalPages}
                        variant="ghost"
                        className="h-full rounded-none border-l border-border px-3 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                        Go
                    </Button>
                </form>
            </div>
        </div>
    );
};
