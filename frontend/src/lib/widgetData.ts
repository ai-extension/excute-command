import { PageWidget, DatasetSource } from '../types';
import { AggregateBucket } from '../components/page-designer/useDatasetAggregate';

// Shared helpers for dataset-backed single-value / series widgets (METRIC, GAUGE,
// PROGRESS, STAT_GRID, SPARKLINE). Keeps value extraction + number formatting in one place.

export const EMPTY_KEY_LABEL = '(empty)';

export const formatMetric = (n: number, fmt: PageWidget['metric_format']): string => {
    if (!Number.isFinite(n)) return '—';
    switch (fmt) {
        case 'percent':
            return `${(n * 100).toFixed(1)}%`;
        case 'currency':
            return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
        default:
            if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
            return Number.isInteger(n) ? n.toString() : n.toFixed(2);
    }
};

// The numeric value of a single bucket, preferring the first select's labelled value and
// falling back to the legacy bucket.value (which mirrors the first select server-side).
const bucketValue = (b: AggregateBucket, ds?: DatasetSource): number => {
    const label = ds?.selects?.[0]?.label;
    if (label && b.values && b.values[label] !== undefined) return b.values[label];
    return b.value ?? 0;
};

// Single scalar for METRIC/GAUGE/PROGRESS-style widgets (first bucket, or 0).
export const firstValue = (items: AggregateBucket[], ds?: DatasetSource): number =>
    items.length === 0 ? 0 : bucketValue(items[0], ds);

// {key,value} pairs for STAT_GRID / SPARKLINE.
export const toPairs = (items: AggregateBucket[], ds?: DatasetSource): { key: string; value: number }[] =>
    items.map(b => ({ key: b.key === '' || b.key == null ? EMPTY_KEY_LABEL : String(b.key), value: bucketValue(b, ds) }));

// Parse a static JSON array of {key,value} (shared with CHART's static mode).
export const parseStaticPairs = (raw?: string): { key: string; value: number }[] => {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw);
        if (!Array.isArray(v)) return [];
        return v
            .filter(x => x && typeof x === 'object')
            .map((x: any) => ({ key: String(x.key ?? x.label ?? ''), value: Number(x.value ?? 0) }));
    } catch {
        return [];
    }
};
