import React from 'react';
import { Workflow } from '../types';
import ExecutionMonitor from './ExecutionMonitor';

interface WorkflowMonitorProps {
    workflow: Workflow;
    onClose: () => void;
    onReady?: () => void;
    onStatusChange?: (status: string) => void;
    onReRun?: (workflow: Workflow, inputs: Record<string, string>, startGroupID?: string, startStepID?: string, fromExecutionID?: string) => void;
    isMaximized?: boolean;
    onMaximizedChange?: (maximized: boolean) => void;
}

const WorkflowMonitor = ({ workflow, onClose, onReady, onStatusChange, onReRun, isMaximized, onMaximizedChange }: WorkflowMonitorProps) => {
    return (
        <ExecutionMonitor
            mode="LIVE"
            workflow={workflow}
            onClose={onClose}
            onReady={onReady}
            onStatusChange={onStatusChange}
            onReRun={onReRun}
            isMaximized={isMaximized}
            onMaximizedChange={onMaximizedChange}
        />
    );
};

export default WorkflowMonitor;
