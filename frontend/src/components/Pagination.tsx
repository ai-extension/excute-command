import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

interface PaginationProps {
    total: number;
    offset: number;
    limit: number;
    itemName?: string;
    onPageChange: (newOffset: number) => void;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [1];

    if (currentPage > 3) {
        pages.push('ellipsis');
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
        pages.push(i);
    }

    if (currentPage < totalPages - 2) {
        pages.push('ellipsis');
    }

    pages.push(totalPages);
    return pages;
}

export const Pagination: React.FC<PaginationProps> = ({ total, offset, limit, itemName = "items", onPageChange }) => {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(totalPages, Math.floor(offset / limit) + 1);
    const [jumpPage, setJumpPage] = useState("");

    useEffect(() => {
        setJumpPage("");
    }, [offset]);

    if (total <= 0) return null;

    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            onPageChange((page - 1) * limit);
        }
    };

    const handleJumpPage = (e: React.FormEvent) => {
        e.preventDefault();
        const page = parseInt(jumpPage, 10);
        if (!isNaN(page)) {
            goToPage(page);
            setJumpPage("");
        }
    };

    const pages = getPageNumbers(currentPage, totalPages);

    return (
        <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-t border-border/50 transition-all duration-300">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} of {total} {itemName}
            </div>

            <div className="flex items-center gap-1.5">
                {/* First page */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                </Button>

                {/* Previous */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                </Button>

                {/* Page numbers */}
                {pages.map((page, idx) =>
                    page === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} className="w-8 text-center text-[10px] font-bold text-muted-foreground/50 select-none">
                            ···
                        </span>
                    ) : (
                        <Button
                            key={page}
                            variant="ghost"
                            onClick={() => goToPage(page)}
                            className={cn(
                                "h-8 w-8 rounded-lg text-[11px] font-bold transition-all",
                                page === currentPage
                                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            {page}
                        </Button>
                    )
                )}

                {/* Next */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </Button>

                {/* Last page */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage >= totalPages}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                    <ChevronsRight className="w-3.5 h-3.5" />
                </Button>

                {/* Jump to page (only show when many pages) */}
                {totalPages > 7 && (
                    <form onSubmit={handleJumpPage} className="flex items-center border border-border rounded-lg overflow-hidden h-8 bg-background shadow-sm hover:border-primary/50 focus-within:border-primary/50 transition-colors ml-2">
                        <Input
                            type="number"
                            min={1}
                            max={Math.max(1, totalPages)}
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            placeholder="#"
                            className="h-full w-12 px-2 text-[10px] font-bold text-center border-0 focus-visible:ring-0 rounded-none bg-transparent"
                        />
                        <Button
                            type="submit"
                            disabled={!jumpPage || parseInt(jumpPage) < 1 || parseInt(jumpPage) > totalPages}
                            variant="ghost"
                            className="h-full rounded-none border-l border-border px-2 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                            Go
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
};
