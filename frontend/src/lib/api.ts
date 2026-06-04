/// <reference types="vite/client" />
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Consume a streaming Response body line-by-line, invoking onLines as each
 * chunk arrives instead of buffering the whole body (avoids the blank wait on
 * large execution logs). Lines are emitted without trailing '\n'; a partial
 * final line is held until the next chunk and flushed at end-of-stream.
 *
 * Falls back to res.text() when the body stream is unavailable.
 */
export async function streamResponseLines(
    res: Response,
    onLines: (lines: string[]) => void
): Promise<void> {
    if (!res.body || !res.body.getReader) {
        const text = await res.text();
        onLines(text.split('\n'));
        return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        if (lines.length > 0) onLines(lines);
    }

    buf += decoder.decode();
    if (buf.length > 0) onLines([buf]);
}
