import React, { useState, useEffect } from 'react';
import { Check, Palette } from 'lucide-react';
import { cn } from '../lib/utils';

export interface ButtonStylePreset {
    label: string;
    value: string;
}

interface ButtonStylePickerProps {
    presets: ButtonStylePreset[];
    value: string;
    onChange: (val: string) => void;
}

const CUSTOM_PREFIX = 'custom:';

const buildCustomStyle = (hex: string): string => `${CUSTOM_PREFIX}${hex}`;

const parseHexFromStyle = (style: string): string | null => {
    if (!style.startsWith(CUSTOM_PREFIX)) return null;
    const hex = style.slice(CUSTOM_PREFIX.length);
    return /^#?[a-f\d]{6}$/i.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : null;
};

export const resolveButtonStyle = (raw: string | undefined, fallback: string): { className: string; style?: React.CSSProperties } => {
    const v = raw || fallback;
    if (v.startsWith(CUSTOM_PREFIX)) {
        const hex = v.slice(CUSTOM_PREFIX.length);
        if (/^#[a-f\d]{6}$/i.test(hex)) {
            const n = parseInt(hex.slice(1), 16);
            const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
            return {
                className: '',
                style: { backgroundColor: hex, boxShadow: `0 0 20px rgba(${r},${g},${b},0.3)` },
            };
        }
    }
    return { className: v };
};

export const ButtonStylePicker: React.FC<ButtonStylePickerProps> = ({ presets, value, onChange }) => {
    const isCustom = value.startsWith(CUSTOM_PREFIX);
    const [customMode, setCustomMode] = useState<boolean>(isCustom);
    const [hex, setHex] = useState<string>(() => parseHexFromStyle(value) || '#6366f1');

    const previewStyle = resolveButtonStyle(buildCustomStyle(hex), '');

    useEffect(() => {
        if (isCustom) {
            const parsed = parseHexFromStyle(value);
            if (parsed) setHex(parsed);
            setCustomMode(true);
        }
    }, [value, isCustom]);

    const applyCustom = (newHex: string) => {
        setHex(newHex);
        const styleStr = buildCustomStyle(newHex);
        if (styleStr) onChange(styleStr);
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                {presets.map(preset => {
                    const selected = !customMode && value === preset.value;
                    return (
                        <button
                            type="button"
                            key={preset.value}
                            onClick={() => { setCustomMode(false); onChange(preset.value); }}
                            title={preset.label}
                            className={cn(
                                "relative h-9 w-9 rounded-md border transition-all flex items-center justify-center",
                                preset.value,
                                selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background border-transparent" : "border-border/40 hover:scale-105"
                            )}
                        >
                            {selected && <Check className="w-4 h-4 text-white drop-shadow" />}
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={() => {
                        const next = !customMode;
                        setCustomMode(next);
                        if (next) {
                            const styleStr = buildCustomStyle(hex);
                            if (styleStr) onChange(styleStr);
                        }
                    }}
                    title="Custom color"
                    className={cn(
                        "h-9 w-9 rounded-md border flex items-center justify-center transition-all",
                        customMode
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background border-transparent text-white"
                            : "border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground"
                    )}
                    style={customMode ? { backgroundColor: hex } : undefined}
                >
                    <Palette className="w-4 h-4" />
                </button>
            </div>

            {customMode && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/40">
                    <input
                        type="color"
                        value={hex}
                        onChange={e => applyCustom(e.target.value)}
                        className="h-8 w-10 rounded-md cursor-pointer bg-transparent border-0 p-0"
                    />
                    <input
                        type="text"
                        value={hex}
                        onChange={e => {
                            const v = e.target.value;
                            setHex(v);
                            if (/^#?[a-f\d]{6}$/i.test(v)) {
                                const normalized = v.startsWith('#') ? v : `#${v}`;
                                applyCustom(normalized);
                            }
                        }}
                        placeholder="#6366f1"
                        className="flex-1 h-8 px-3 text-xs font-mono bg-background/60 border border-border/40 rounded-md outline-none focus:ring-2 ring-primary/20"
                    />
                    <div
                        className="h-8 flex-1 rounded-md flex items-center justify-center text-[10px] font-black text-white tracking-wider"
                        style={previewStyle.style}
                    >
                        PREVIEW
                    </div>
                </div>
            )}
        </div>
    );
};

export default ButtonStylePicker;
