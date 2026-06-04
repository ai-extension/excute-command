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

export interface LineBatcher {
    /** Queue lines; emit is coalesced to at most once per animation frame. */
    push: (lines: string[]) => void;
    /** Force-emit any queued lines now (e.g. at end-of-stream). */
    flush: () => void;
    /** Drop queued lines and cancel the scheduled frame (e.g. on unmount). */
    cancel: () => void;
}

/**
 * Coalesce frequent line pushes into at most one `emit` call per animation
 * frame. A streamed log delivers many chunks; without batching each chunk would
 * trigger its own React re-render (render thrash on large logs). Batching caps
 * re-renders at ~one per frame while the body streams.
 */
export function createLineBatcher(emit: (lines: string[]) => void): LineBatcher {
    let pending: string[] = [];
    let raf = 0;

    const run = () => {
        raf = 0;
        if (pending.length === 0) return;
        const batch = pending;
        pending = [];
        emit(batch);
    };

    return {
        push(lines) {
            if (lines.length === 0) return;
            pending.push(...lines);
            if (!raf) raf = requestAnimationFrame(run);
        },
        flush() {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            run();
        },
        cancel() {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            pending = [];
        },
    };
}
