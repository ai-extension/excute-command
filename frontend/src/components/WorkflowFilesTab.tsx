import React, { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Save, File, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { WorkflowFile } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';

interface WorkflowFilesTabProps {
    workflowId: string;
    targetFolder: string;
    setTargetFolder: (val: string) => void;
    cleanupFiles: boolean;
    setCleanupFiles: (val: boolean) => void;
}


export const WorkflowFilesTab: React.FC<WorkflowFilesTabProps> = ({ workflowId, targetFolder, setTargetFolder, cleanupFiles, setCleanupFiles }) => {
    const { apiFetch } = useAuth();
    const [files, setFiles] = useState<WorkflowFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Delete state
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchFiles = async () => {
        if (!workflowId) return;
        setIsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/workflows/${workflowId}/files`);

            if (!response.ok) throw new Error('Failed to fetch files');

            const data = await response.json();
            setFiles(data || []);
        } catch (error: any) {
            alert(error.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (workflowId) {
            fetchFiles();
        } else {
            setFiles([]);
        }
    }, [workflowId]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;

        setIsUploading(true);

        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                const formData = new FormData();
                formData.append('file', file);
                formData.append('target_path', `/tmp/${file.name}`);

                const response = await apiFetch(`${API_BASE_URL}/workflows/${workflowId}/files`, {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to upload ${file.name}`);
                }
            }

            fetchFiles();
        } catch (error: any) {
            alert(error.message || 'An error occurred');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = (fileId: string) => {
        setDeleteTargetId(fileId);
    };

    const confirmDelete = async () => {
        if (!deleteTargetId) return;
        setIsDeleting(true);

        try {
            const response = await apiFetch(`${API_BASE_URL}/workflow-files/${deleteTargetId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete file');

            setFiles(files.filter(f => f.id !== deleteTargetId));
        } catch (error: any) {
            alert(error.message || 'An error occurred');
        } finally {
            setIsDeleting(false);
            setDeleteTargetId(null);
        }
    };

    const formatBytes = (bytes: number, decimals = 2) => {
        if (!+bytes) return '0 Bytes'
        const k = 1024
        const dm = decimals < 0 ? 0 : decimals
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
    }

    if (!workflowId) {
        return (
            <div className="space-y-6">
                <div className="bg-card p-6 rounded-xl border border-border">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Destination Directory</label>
                        <Input
                            value={targetFolder}
                            onChange={(e) => setTargetFolder(e.target.value)}
                            placeholder="e.g. /var/www/html/uploads"
                            className="bg-background border-border h-10 text-sm font-medium"
                        />
                        <p className="text-[9px] font-medium text-muted-foreground mt-2 italic">
                            All uploaded files will be copied to this folder on target servers. (Default: <span className="text-primary font-bold">/tmp/</span> if empty)
                        </p>
                    </div>
                    <div className="flex items-center gap-3 mt-4">
                        <Switch
                            id="cleanup_files"
                            checked={cleanupFiles}
                            onCheckedChange={setCleanupFiles}
                        />
                        <label htmlFor="cleanup_files" className="text-sm font-medium leading-none cursor-pointer">
                            Delete files after execution completes
                        </label>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center py-12 bg-muted/30 rounded-xl border border-dashed border-border text-center">
                    <File className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Upload Disabled for New Drafts</h4>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[200px]">
                        Please save this workflow once to enable file uploads.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium">Workflow Files</h3>
                    <p className="text-xs text-muted-foreground">Upload files to be automatically transferred over SFTP before execution.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchFiles} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={handleFileSelect}
                    />
                    <Button
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Upload className="w-4 h-4 mr-2" />
                        )}
                        Upload File
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 bg-card p-6 rounded-xl border border-border">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Destination Directory</label>
                    <Input
                        value={targetFolder}
                        onChange={(e) => setTargetFolder(e.target.value)}
                        placeholder="e.g. /opt/app/scripts"
                        className="bg-background border-border h-10 text-sm font-medium focus:ring-1 focus:ring-primary/30"
                    />
                    <p className="text-[9px] font-medium text-muted-foreground mt-2">
                        Directory on the remote servers where files will be copied. (Default: <span className="text-primary font-bold">/tmp/</span> if empty)
                    </p>
                </div>
                <div className="flex items-center gap-3 mt-4">
                    <Switch
                        id="cleanup_files"
                        checked={cleanupFiles}
                        onCheckedChange={setCleanupFiles}
                    />
                    <label htmlFor="cleanup_files" className="text-sm font-medium leading-none cursor-pointer">
                        Delete files after execution completes
                    </label>
                </div>
            </div>

            <div className="rounded-md border">
                {files.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <File className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No files uploaded yet.</p>
                        <p className="text-xs mt-1">Files uploaded here will be copied to all servers before execution starts.</p>
                    </div>
                ) : (
                    <div className="divide-y relative">
                        {isLoading && (
                            <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-sm z-10 rounded-md">
                                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                            </div>
                        )}
                        {files.map(f => (
                            <div key={f.id} className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
                                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                                    <File className="w-5 h-5 text-primary" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between mb-1">
                                        <p className="text-sm font-medium truncate" title={f.file_name}>
                                            {f.file_name}
                                        </p>
                                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                            {formatBytes(f.file_size)}
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDelete(f.id!)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={!!deleteTargetId}
                onClose={() => setDeleteTargetId(null)}
                onConfirm={confirmDelete}
                title="Delete Workflow File"
                description="Are you sure you want to delete this file? It will be permanently removed from the workflow metadata."
                confirmText="Delete File"
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
};
