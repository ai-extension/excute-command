/**
 * Formats a UTC ISO string (or Date) to a local wall clock string suitable for <input type="datetime-local">
 * e.g. "2026-03-09T10:49:45Z" -> "2026-03-09T17:49" (assuming UTC+7)
 */
export const formatToLocalInput = (dateInput?: string | Date | null): string => {
    if (!dateInput) return '';
    try {
        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        if (isNaN(date.getTime())) return '';

        // Adjust for timezone offset to get "local wall clock"
        const offset = date.getTimezoneOffset(); // in minutes
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().slice(0, 16);
    } catch (e) {
        return '';
    }
};

/**
 * Converts a local wall clock string from <input type="datetime-local"> to a UTC ISO string
 * e.g. "2026-03-09T17:49" -> "2026-03-09T10:49:00.000Z" (assuming UTC+7)
 */
export const convertToUTC = (localInput?: string | null): string => {
    if (!localInput) return '';
    try {
        const date = new Date(localInput);
        if (isNaN(date.getTime())) return '';
        return date.toISOString();
    } catch (e) {
        return '';
    }
};

/**
 * Formats a UTC ISO string (or Date) to a local "YYYY-MM-DD" for <input type="date">.
 * e.g. "2026-07-01T17:00:00Z" -> "2026-07-02" (assuming UTC+7)
 */
export const formatToLocalDate = (dateInput?: string | Date | null): string => {
    const local = formatToLocalInput(dateInput); // "YYYY-MM-DDTHH:mm" (local)
    return local ? local.slice(0, 10) : '';
};

/**
 * Converts a local "YYYY-MM-DD" from <input type="date"> to a UTC ISO string,
 * anchored to the given local time-of-day. `endOfDay` anchors to 23:59:59.999
 * (inclusive window end); otherwise to 00:00:00 (window start).
 * A date-only string must be combined with a time before parsing, otherwise
 * `new Date("2026-07-01")` is interpreted as UTC midnight, not local.
 */
export const dateInputToUTC = (dateInput?: string | null, endOfDay = false): string => {
    if (!dateInput) return '';
    const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00';
    return convertToUTC(`${dateInput}${suffix}`);
};

/**
 * Formats a UTC ISO string for friendly local display
 */
export const formatDisplayDate = (isoString?: string | null): string => {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString();
    } catch (e) {
        return 'Invalid Date';
    }
};
