import type { PageWidgetSize } from '../types';

// Widget widths form a 6-column grid (row gap 20px). N/6 spans N columns plus (N-1)
// internal 20px gaps, i.e. N/6 = N×((100%-100px)/6) + (N-1)×20px; the reduced calc()
// for each is precomputed below. Class strings are written as LITERALS (never built
// dynamically) so Tailwind's JIT scanner emits the arbitrary-value width utilities.

// Selectable sizes, ordered narrow → wide, shown in the width picker.
export const PAGE_WIDGET_SIZES: PageWidgetSize[] = ['1/6', '2/6', '3/6', '4/6', '5/6', 'full'];

export const SIZE_LABELS: Record<PageWidgetSize, string> = {
    '1/6': '1/6 Width',
    '2/6': '2/6 Width',
    '3/6': '3/6 Width',
    '4/6': '4/6 Width',
    '5/6': '5/6 Width',
    full: 'Full Width',
};

// Sizes saved before the 6-col system map 1:1 onto the new grid (identical widths):
// third = 2/6, half = 3/6, two-third = 4/6.
const LEGACY_SIZE: Record<string, PageWidgetSize> = {
    third: '2/6',
    half: '3/6',
    'two-third': '4/6',
};

export const normalizeWidgetSize = (size: unknown): PageWidgetSize => {
    if (typeof size === 'string') {
        if (LEGACY_SIZE[size]) return LEGACY_SIZE[size];
        if ((PAGE_WIDGET_SIZES as string[]).includes(size)) return size as PageWidgetSize;
    }
    return 'full';
};

// Top-level / section-frame width — responsive to the viewport (md: breakpoint).
const TOP_W: Record<PageWidgetSize, string> = {
    '1/6': 'w-full md:w-[calc((100%-100px)/6)]',
    '2/6': 'w-full md:w-[calc((100%-40px)/3)]',
    '3/6': 'w-full md:w-[calc(50%-10px)]',
    '4/6': 'w-full md:w-[calc((200%-20px)/3)]',
    '5/6': 'w-full md:w-[calc((500%-20px)/6)]',
    full: 'w-full',
};

// Editor canvas top-level width — the canvas is desktop-only, so no breakpoint prefix.
const EDITOR_TOP_W: Record<PageWidgetSize, string> = {
    '1/6': 'w-[calc((100%-100px)/6)]',
    '2/6': 'w-[calc((100%-40px)/3)]',
    '3/6': 'w-[calc(50%-10px)]',
    '4/6': 'w-[calc((200%-20px)/3)]',
    '5/6': 'w-[calc((500%-20px)/6)]',
    full: 'w-full',
};

// Section child width — a sixth fraction of the SECTION's own width (the flex-wrap
// parent). `min-w-[160px]` is a floor: when a fraction resolves narrower than that (a
// small section) the item can't fit its row and flex-wrap pushes it down, so narrow
// sections stack their children instead of squeezing. Real-pixel based (no viewport /
// container-query breakpoint) so the editor canvas and the public page lay out the same.
const CHILD_MIN = 'min-w-[160px]';
const CHILD_W: Record<PageWidgetSize, string> = {
    '1/6': `w-[calc((100%-100px)/6)] ${CHILD_MIN}`,
    '2/6': `w-[calc((100%-40px)/3)] ${CHILD_MIN}`,
    '3/6': `w-[calc(50%-10px)] ${CHILD_MIN}`,
    '4/6': `w-[calc((200%-20px)/3)] ${CHILD_MIN}`,
    '5/6': `w-[calc((500%-20px)/6)] ${CHILD_MIN}`,
    full: 'w-full',
};

export const topWidthClass = (size: unknown): string => TOP_W[normalizeWidgetSize(size)];
export const editorTopWidthClass = (size: unknown): string => EDITOR_TOP_W[normalizeWidgetSize(size)];
export const childWidthClass = (size: unknown): string => CHILD_W[normalizeWidgetSize(size)];
