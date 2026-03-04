import React from 'react';
import { Workflow } from '../types';
import ExecutionMonitor from './ExecutionMonitor';

interface WorkflowMonitorProps {
    workflow: Workflow;
    streamLogs?: string[];
    onClose: () => void;
    onReady?: () => void;
    onReRun?: (workflow: Workflow, inputs: Record<string, string>) => void;
}

const WorkflowMonitor = ({ workflow, streamLogs, onClose, onReady, onReRun }: WorkflowMonitorProps) => {
    return (
        <ExecutionMonitor
            mode="LIVE"
            workflow={workflow}
            streamLogs={streamLogs}
            onClose={onClose}
            onReady={onReady}
            onReRun={onReRun}
        />
    );
};

export default WorkflowMonitor;
