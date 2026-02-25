import React from 'react';
import { Workflow } from '../types';
import ExecutionMonitor from './ExecutionMonitor';

interface WorkflowMonitorProps {
    workflow: Workflow;
    onClose: () => void;
}

const WorkflowMonitor = ({ workflow, onClose }: WorkflowMonitorProps) => {
    return (
        <ExecutionMonitor
            mode="LIVE"
            workflow={workflow}
            onClose={onClose}
        />
    );
};

export default WorkflowMonitor;
