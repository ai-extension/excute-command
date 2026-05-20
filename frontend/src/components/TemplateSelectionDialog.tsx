import React, { useState } from 'react';
import { X, Layout, Link2, Zap, Activity, Monitor } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';
import { PAGE_TEMPLATES, PageTemplate } from '../lib/pageTemplates';

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
    blank: <Layout className="w-6 h-6" />,
    links: <Link2 className="w-6 h-6" />,
    actions: <Zap className="w-6 h-6" />,
    monitoring: <Monitor className="w-6 h-6" />,
    status: <Activity className="w-6 h-6" />,
};

const TEMPLATE_COLORS: Record<string, string> = {
    blank: 'text-muted-foreground bg-muted/30',
    links: 'text-indigo-500 bg-indigo-500/10',
    actions: 'text-primary bg-primary/10',
    monitoring: 'text-emerald-500 bg-emerald-500/10',
    status: 'text-teal-500 bg-teal-500/10',
};

interface TemplateSelectionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (title: string, slug: string, template: PageTemplate) => void;
    isCreating: boolean;
}

const TemplateSelectionDialog: React.FC<TemplateSelectionDialogProps> = ({ isOpen, onClose, onCreate, isCreating }) => {
    const [selectedTemplate, setSelectedTemplate] = useState<PageTemplate>(PAGE_TEMPLATES[0]);
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');

    const handleTitleChange = (value: string) => {
        setTitle(value);
        if (!slug || slug === generateSlug(title)) {
            setSlug(generateSlug(value));
        }
    };

    const generateSlug = (text: string) =>
        text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || '';

    const handleSubmit = () => {
        if (!title.trim() || !slug.trim()) return;
        onCreate(title.trim(), slug.trim(), selectedTemplate);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-2xl bg-card border border-border rounded-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-8 py-5 border-b border-border">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-widest">Create New Page</h2>
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Choose a template to get started</p>
                    </div>
                    <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {PAGE_TEMPLATES.map(template => (
                            <button
                                key={template.id}
                                onClick={() => setSelectedTemplate(template)}
                                className={cn(
                                    "flex flex-col items-center gap-2 p-4 rounded-md border-2 transition-all text-center",
                                    selectedTemplate.id === template.id
                                        ? "border-primary bg-primary/5 shadow-sm"
                                        : "border-border/50 hover:border-primary/30 bg-background"
                                )}
                            >
                                <div className={cn("p-3 rounded-md", TEMPLATE_COLORS[template.icon] || TEMPLATE_COLORS.blank)}>
                                    {TEMPLATE_ICONS[template.icon] || TEMPLATE_ICONS.blank}
                                </div>
                                <span className="text-xs font-black uppercase tracking-tight">{template.name}</span>
                                <span className="text-[10px] text-muted-foreground leading-tight">{template.description}</span>
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-primary">Page Title</label>
                            <Input
                                value={title}
                                onChange={e => handleTitleChange(e.target.value)}
                                className="h-9 bg-background rounded-md font-bold"
                                placeholder="My Dashboard"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Slug</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-xs font-mono">/pages/</span>
                                <Input
                                    value={slug}
                                    onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    className="h-9 bg-background rounded-md pl-[70px] font-mono text-xs"
                                    placeholder="my-dashboard"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-5 bg-muted/10 border-t border-border flex items-center justify-between">
                    <Button variant="ghost" onClick={onClose} className="h-9 text-[10px] font-black uppercase tracking-widest">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!title.trim() || !slug.trim() || isCreating}
                        className="premium-gradient text-white text-[10px] font-black uppercase tracking-[0.2em] h-9 px-8 rounded-md shadow-premium"
                    >
                        {isCreating ? 'Creating...' : 'Create Page'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default TemplateSelectionDialog;
