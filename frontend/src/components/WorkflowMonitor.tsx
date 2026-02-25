import React from 'react';
import { Workflow } from '../types';
import ExecutionMonitor from './ExecutionMonitor';

interface WorkflowMonitorProps {
    workflow: Workflow;
    onClose: () => void;
    onReady?: () => void;
    onReRun?: (workflow: Workflow, inputs: Record<string, string>) => void;
}

const WorkflowMonitor = ({ workflow, onClose, onReady, onReRun }: WorkflowMonitorProps) => {
    return (
        <ExecutionMonitor
            mode="LIVE"
            workflow={workflow}
            onClose={onClose}
            onReady={onReady}
            onReRun={onReRun}
        />
    );
};

export default WorkflowMonitor;
