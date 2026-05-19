import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface PaginationProps {
    total: number;
    offset: number;
    limit: number;
    itemName?: string;
    onPageChange: (newOffset: number) => void;
}

const SIBLINGS = 1;
const BOUNDARY = 1;

const buildPageList = (current: number, totalPages: number): (number | 'ellipsis-left' | 'ellipsis-right')[] => {
    const totalNumbers = SIBLINGS * 2 + BOUNDARY * 2 + 3;
    if (totalPages <= totalNumbers) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const leftSibling = Math.max(current - SIBLINGS, BOUNDARY + 2);
    const rightSibling = Math.min(current + SIBLINGS, totalPages - BOUNDARY - 1);

    const showLeftEllipsis = leftSibling > BOUNDARY + 2;
    const showRightEllipsis = rightSibling < totalPages - BOUNDARY - 1;

    const pages: (number | 'ellipsis-left' | 'ellipsis-right')[] = [];

    for (let i = 1; i <= BOUNDARY; i++) pages.push(i);

    if (showLeftEllipsis) {
        pages.push('ellipsis-left');
    } else {
        for (let i = BOUNDARY + 1; i < leftSibling; i++) pages.push(i);
    }

    for (let i = leftSibling; i <= rightSibling; i++) pages.push(i);

    if (showRightEllipsis) {
        pages.push('ellipsis-right');
    } else {
        for (let i = rightSibling + 1; i <= totalPages - BOUNDARY; i++) pages.push(i);
    }

    for (let i = totalPages - BOUNDARY + 1; i <= totalPages; i++) pages.push(i);

    return pages;
};

export const Pagination: React.FC<PaginationProps> = ({ total, offset, limit, itemName = "items", onPageChange }) => {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(totalPages, Math.floor(offset / limit) + 1);
    const [jumpPage, setJumpPage] = useState("");

    useEffect(() => {
        setJumpPage("");
    }, [offset]);

    if (total <= 0) return null;

    const goToPage = (page: number) => {
        const safe = Math.max(1, Math.min(totalPages, page));
        onPageChange((safe - 1) * limit);
    };

    const handleJumpPage = (e: React.FormEvent) => {
        e.preventDefault();
        const page = parseInt(jumpPage, 10);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
            goToPage(page);
            setJumpPage("");
        }
    };

    const pages = buildPageList(currentPage, totalPages);
    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;

    const navBtnCls = "h-8 w-8 p-0 rounded-md border border-border bg-background hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-muted/10 border-t border-border/50 transition-all duration-300">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} {itemName}
            </div>

            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => goToPage(1)}
                        disabled={prevDisabled}
                        title="First page"
                        className={navBtnCls}
                    >
                        <ChevronsLeft className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={prevDisabled}
                        title="Previous page"
                        className={navBtnCls}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>

                    {pages.map((p, idx) => {
                        if (p === 'ellipsis-left' || p === 'ellipsis-right') {
                            return (
                                <span key={`${p}-${idx}`} className="px-1 text-[10px] font-bold text-muted-foreground/60 select-none">
                                    …
                                </span>
                            );
                        }
                        const isActive = p === currentPage;
                        return (
                            <Button
                                key={p}
                                type="button"
                                variant="ghost"
                                onClick={() => goToPage(p)}
                                className={cn(
                                    "h-8 min-w-8 px-2 rounded-md border text-[10px] font-black tracking-widest transition-colors",
                                    isActive
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary"
                                        : "bg-background border-border text-foreground hover:bg-primary/10 hover:border-primary/40 hover:text-primary"
                                )}
                            >
                                {p}
                            </Button>
                        );
                    })}

                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={nextDisabled}
                        title="Next page"
                        className={navBtnCls}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => goToPage(totalPages)}
                        disabled={nextDisabled}
                        title="Last page"
                        className={navBtnCls}
                    >
                        <ChevronsRight className="w-4 h-4" />
                    </Button>
                </div>

                {totalPages > 5 && (
                    <form onSubmit={handleJumpPage} className="flex items-center border border-border rounded-md overflow-hidden h-8 bg-background shadow-sm hover:border-primary/40 focus-within:border-primary/50 transition-colors ml-1">
                        <span className="px-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-r border-border h-full flex items-center">Go</span>
                        <Input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={jumpPage}
                            onChange={(e) => setJumpPage(e.target.value)}
                            placeholder={currentPage.toString()}
                            className="h-full w-14 px-2 text-[10px] font-bold text-center border-0 focus-visible:ring-0 rounded-none bg-transparent"
                        />
                        <Button
                            type="submit"
                            disabled={!jumpPage || parseInt(jumpPage) < 1 || parseInt(jumpPage) > totalPages}
                            variant="ghost"
                            className="h-full rounded-none border-l border-border px-3 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                            ↵
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
};
