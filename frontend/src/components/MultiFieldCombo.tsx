import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
    value: string[];
    onChange: (value: string[]) => void;
    options: string[];   // suggested values
    placeholder?: string;
    className?: string;
}

// Multi-value sibling of FieldCombo: tag chips + an inline input where the user can
// either type a custom value (Enter / comma commits) or pick from the suggestion list.
// Backspace on an empty input removes the trailing chip. Values are deduplicated; empty
// strings are dropped silently.
export const MultiFieldCombo: React.FC<Props> = ({ value, onChange, options, placeholder, className }) => {
    const [input, setInput] = useState('');
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const commit = (raw: string) => {
        const v = raw.trim();
        if (!v) return;
        if (value.includes(v)) { setInput(''); return; }
        onChange([...value, v]);
        setInput('');
    };

    const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(input);
        } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
            e.preventDefault();
            remove(value.length - 1);
        }
    };

    const q = input.trim().toLowerCase();
    const filtered = options
        .filter(o => !value.includes(o))
        .filter(o => !q || o.toLowerCase().includes(q));

    return (
        <div ref={rootRef} className="relative">
            <div className={cn(
                'flex flex-wrap items-center gap-1 px-1.5 py-1 bg-background border border-border rounded-md min-h-[2rem] focus-within:border-indigo-500/40 transition-colors',
                className,
            )}
                onClick={() => inputRef.current?.focus()}
            >
                {value.map((v, i) => (
                    <span key={i} className="inline-flex items-center gap-1 h-6 px-1.5 rounded bg-cyan-500/10 text-cyan-600 text-[11px] font-mono">
                        {v}
                        <button type="button" tabIndex={-1}
                            onClick={(e) => { e.stopPropagation(); remove(i); }}
                            className="opacity-60 hover:opacity-100 hover:text-destructive">
                            <X className="w-3 h-3" />
                        </button>
                    </span>
                ))}
                <div className="relative flex-1 min-w-[100px] flex items-center">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => { setInput(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={onKeyDown}
                        placeholder={value.length === 0 ? (placeholder || 'type or pick fields…') : ''}
                        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[11px] font-mono px-1 py-0.5"
                    />
                    {options.length > 0 && (
                        <button type="button" tabIndex={-1}
                            onClick={(e) => { e.stopPropagation(); setOpen(v => !v); inputRef.current?.focus(); }}
                            className="shrink-0 text-muted-foreground/50 hover:text-foreground">
                            <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
            {open && filtered.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-44 overflow-auto rounded-md border border-border bg-card shadow-lg py-1">
                    {filtered.map(o => (
                        <button key={o} type="button"
                            onClick={() => { commit(o); inputRef.current?.focus(); }}
                            className="block w-full text-left px-2 py-1 text-[11px] font-mono hover:bg-muted/60">
                            {o}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
