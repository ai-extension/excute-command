export interface ExecutionHistoryEntry {
    executionId: string;
    widgetId: string;
    workflowId?: string;
    inputs: Record<string, string>;
    status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | string;
    timestamp: number;
}

const MAX_ENTRIES_PER_WIDGET = 10;

const storageKey = (slug: string) => `page-exec-history:${slug}`;

export type HistoryMap = Record<string, ExecutionHistoryEntry[]>;

export const loadHistory = (slug: string): HistoryMap => {
    if (!slug) return {};
    try {
        const raw = localStorage.getItem(storageKey(slug));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

export const saveHistory = (slug: string, map: HistoryMap) => {
    if (!slug) return;
    try {
        localStorage.setItem(storageKey(slug), JSON.stringify(map));
    } catch {
        // quota / serialization errors ignored
    }
};

export const appendEntry = (map: HistoryMap, entry: ExecutionHistoryEntry): HistoryMap => {
    const list = map[entry.widgetId] || [];
    const filtered = list.filter(e => e.executionId !== entry.executionId);
    const next = [entry, ...filtered].slice(0, MAX_ENTRIES_PER_WIDGET);
    return { ...map, [entry.widgetId]: next };
};

export const updateEntryStatus = (
    map: HistoryMap,
    widgetId: string,
    executionId: string,
    status: ExecutionHistoryEntry['status']
): HistoryMap => {
    const list = map[widgetId];
    if (!list) return map;
    let changed = false;
    const next = list.map(e => {
        if (e.executionId === executionId && e.status !== status) {
            changed = true;
            return { ...e, status };
        }
        return e;
    });
    if (!changed) return map;
    return { ...map, [widgetId]: next };
};

export const removeEntry = (map: HistoryMap, widgetId: string, executionId: string): HistoryMap => {
    const list = map[widgetId];
    if (!list) return map;
    const next = list.filter(e => e.executionId !== executionId);
    return { ...map, [widgetId]: next };
};
