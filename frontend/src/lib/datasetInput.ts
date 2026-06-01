// Config stored in WorkflowInput.default_value for dataset-select / dataset-multi-select types.
export interface DatasetInputConfig {
    dataset_id: string;
    filter: string;   // serialized FilterBuilder tree (JSON) — base filter applied at runtime
    display: string;  // template string, e.g. "{{item.name}} - {{item.email}}"
}

export const emptyDatasetInputConfig = (): DatasetInputConfig => ({
    dataset_id: '',
    filter: '',
    display: '',
});

export const parseDatasetInputConfig = (raw?: string): DatasetInputConfig => {
    if (!raw) return emptyDatasetInputConfig();
    try {
        const v = JSON.parse(raw);
        if (v && typeof v === 'object') {
            return {
                dataset_id: typeof v.dataset_id === 'string' ? v.dataset_id : '',
                filter: typeof v.filter === 'string' ? v.filter : '',
                display: typeof v.display === 'string' ? v.display : '',
            };
        }
    } catch { /* fall through */ }
    return emptyDatasetInputConfig();
};

export const serializeDatasetInputConfig = (cfg: DatasetInputConfig): string =>
    JSON.stringify({
        dataset_id: cfg.dataset_id || '',
        filter: cfg.filter || '',
        display: cfg.display || '',
    });

// Render a display template against a record. Supports `{{item.field}}` (with optional spaces).
// Falls back to "_id" when the template is empty.
export const renderDatasetTemplate = (template: string, record: Record<string, any>): string => {
    if (!template) return String(record._id ?? '');
    return template.replace(/\{\{\s*item\.([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
        const v = record[key];
        if (v === null || v === undefined) return '';
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
};
