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
    let lastYield = typeof performance !== 'undefined' ? performance.now() : 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        if (lines.length > 0) onLines(lines);

        // The browser only paints when this task yields. When the body is already
        // buffered, reader.read() resolves via microtasks back-to-back, so the loop
        // runs to completion without ever yielding — the batched lines then flush in
        // a single frame (looks like "all at once" in Chrome; Safari/DevTools happen
        // to yield differently and appear to stream). Yield to a frame every ~32ms so
        // paints — incremental log lines AND a sibling sidebar render — interleave
        // with reading. The time gate keeps the overhead negligible on huge logs.
        if (typeof requestAnimationFrame !== 'undefined') {
            const now = performance.now();
            if (now - lastYield >= 32) {
                lastYield = now;
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            }
        }
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
    // Cap how many lines we hand to React per frame. When the whole body arrives at
    // once — e.g. served from the HTTP cache on a repeat open — a single emit would
    // push tens of thousands of lines into one synchronous render and freeze the
    // main thread (the log "dumps all at once" instead of streaming). Spreading the
    // emit across frames keeps each render cheap and the stream visible regardless
    // of how fast the bytes arrive (cache hit or network-paced).
    const MAX_PER_FRAME = 800;
    let pending: string[] = [];
    let raf = 0;

    const run = () => {
        raf = 0;
        if (pending.length === 0) return;
        const batch = pending.slice(0, MAX_PER_FRAME);
        pending = pending.slice(MAX_PER_FRAME);
        emit(batch);
        // More than one frame's worth queued (big burst) → keep draining next frame.
        if (pending.length > 0) raf = requestAnimationFrame(run);
    };

    return {
        push(lines) {
            if (lines.length === 0) return;
            pending.push(...lines);
            if (!raf) raf = requestAnimationFrame(run);
        },
        flush() {
            // Kick a drain if none is scheduled; run() reschedules itself until
            // pending empties, so a large tail still spreads across frames instead
            // of one blocking emit.
            if (!raf) run();
        },
        cancel() {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            pending = [];
        },
    };
}
