import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface FieldComboProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
    className?: string;
}

// Editable combobox: type a custom value OR pick from the suggestion list.
// Used for dataset field/key selection where the schema is loose (any key allowed).
export const FieldCombo: React.FC<FieldComboProps> = ({ value, onChange, options, placeholder, className }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const q = value.trim().toLowerCase();
    const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options;

    return (
        <div ref={ref} className="relative">
            <div className="relative">
                <input
                    value={value}
                    onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder}
                    className={cn('w-full pr-6 bg-background border border-border rounded-md outline-none', className)}
                />
                {options.length > 0 && (
                    <button type="button" tabIndex={-1} onClick={() => setOpen(v => !v)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            {open && filtered.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-44 overflow-auto rounded-md border border-border bg-card shadow-lg py-1">
                    {filtered.map(o => (
                        <button
                            key={o}
                            type="button"
                            onClick={() => { onChange(o); setOpen(false); }}
                            className={cn(
                                'block w-full text-left px-2 py-1 text-[11px] font-mono hover:bg-muted/60',
                                o === value && 'bg-muted text-primary font-bold'
                            )}
                        >
                            {o}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
