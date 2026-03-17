import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Workflow, WorkflowInput, WorkflowGroup } from '../types';
import { Dialog, DialogContent } from "./ui/dialog";
import WorkflowMonitor from './WorkflowMonitor';
import WorkflowInputDialog from './WorkflowInputDialog';

interface WorkflowRunnerProps {
    children: (
        runWorkflow: (workflow: Partial<Workflow> & { id: string }, inputs?: Record<string, string>, startGroupID?: string, startStepID?: string, fromExecutionID?: string) => void,
        runTestGroup: (workflowID: string, group: Partial<WorkflowGroup>) => void
    ) => React.ReactNode;
    onRunComplete?: () => void;
    onCloseMonitor?: () => void;
}

export const WorkflowRunner: React.FC<WorkflowRunnerProps> = ({ children, onRunComplete, onCloseMonitor }) => {
    const { apiFetch, showToast } = useAuth();
    const [runKey, setRunKey] = useState(0);
    const [isMonitorOpen, setIsMonitorOpen] = useState(false);
    const [isInputOpen, setIsInputOpen] = useState(false);
    const [runningWorkflow, setRunningWorkflow] = useState<(Partial<Workflow> & { id: string, execution_id?: string, status?: string }) | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    const handleRunWorkflow = async (
        workflow: Partial<Workflow> & { id: string },
        inputsValues?: Record<string, string>,
        startGroupID?: string,
        startStepID?: string,
        fromExecutionID?: string
    ) => {
        // If workflow has inputs and they weren't provided, show bulk dialog
        if (workflow.inputs && workflow.inputs.length > 0 && !inputsValues) {
            setRunningWorkflow(workflow);
            setIsInputOpen(true);
            return;
        }

        // Individual run (e.g. from history rerun or simple workflow)
        await executeWorkflow(workflow, inputsValues || {});
    };

    const handleRunTestGroup = async (workflowID: string, group: Partial<WorkflowGroup>) => {
        setIsStarting(true);
        try {
            const execID = await triggerTestGroup(workflowID, group);
            if (execID) {
                setRunKey(prev => prev + 1);
                // Create a virtual workflow for the monitor
                const virtualWf = {
                    id: workflowID,
                    name: `Test: ${group.name}`,
                    groups: [group],
                    execution_id: execID,
                    status: 'RUNNING',
                    isTest: true
                };
                setRunningWorkflow(virtualWf as any);
                setIsMonitorOpen(true);
            }
        } catch (error) {
            console.error('Failed to run test group:', error);
        } finally {
            setIsStarting(false);
        }
    };

    const triggerTestGroup = useCallback(async (workflowID: string, group: Partial<WorkflowGroup>) => {
        try {
            const response = await apiFetch(`${API_BASE_URL}/workflows/${workflowID}/test-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group, inputs: {} })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Test trigger failed');
            }

            const data = await response.json();
            return data.execution_id as string;
        } catch (error) {
            console.error('Failed to trigger test group:', error);
            showToast(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            return null;
        }
    }, [apiFetch, showToast]);

    const executeWorkflow = async (
        workflow: Partial<Workflow> & { id: string },
        inputs: Record<string, string>,
        openMonitor: boolean = true
    ) => {
        setIsStarting(true);

        const execID = await triggerExecution(workflow.id, inputs);
        if (execID) {
            setRunKey(prev => prev + 1);
            setRunningWorkflow({ ...workflow, execution_id: execID, status: 'PENDING' });
            setIsMonitorOpen(openMonitor);
            setIsInputOpen(false);
        } else {
            showToast('Failed to start execution.', 'error');
        }

        setIsStarting(false);
        if (onRunComplete) onRunComplete();
    };

    const triggerExecution = useCallback(async (workflowID: string, inputs: Record<string, string>) => {
        try {
            const body = {
                inputs
            };

            const response = await apiFetch(`${API_BASE_URL}/workflows/${workflowID}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Trigger failed');
            }

            const data = await response.json();
            return data.execution_id as string;
        } catch (error) {
            console.error('Failed to trigger workflow execution:', error);
            showToast(`Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            return null;
        }
    }, [apiFetch, showToast]);

    const handleMonitorReady = async () => {
        // Monitor is ready, but we already triggered initial run in executeWorkflow
    };

    return (
        <>
            {children((workflow, inputs, startGroupID, startStepID, fromExecutionID) => {
                // If it's a rerun from history/monitor (inputs provided), run it as a single execution
                if (inputs) {
                    executeWorkflow(workflow, inputs, true);
                } else {
                    handleRunWorkflow(workflow);
                }
            }, handleRunTestGroup)}

            {/* Workflow Monitor Dialog */}
            <Dialog open={isMonitorOpen} onOpenChange={setIsMonitorOpen}>
                <DialogContent hideClose className="max-w-5xl w-[90vw] h-[85vh] bg-[#0a0b0e] border-[#1a1c23] border-2 rounded-2xl p-0 overflow-hidden shadow-2xl flex flex-col focus:outline-none">
                    {runningWorkflow && (
                        <WorkflowMonitor
                            key={runKey}
                            workflow={runningWorkflow as any}
                            onReady={handleMonitorReady}
                            onStatusChange={(status) => setRunningWorkflow(prev => prev ? { ...prev, status: status as any } : null)}
                            onReRun={(workflow, inputs) => {
                                setIsStarting(false);
                                executeWorkflow(workflow, inputs, true);
                            }}
                            onClose={() => {
                                setIsMonitorOpen(false);
                                if (onCloseMonitor) onCloseMonitor();
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Unified Run Dialog */}
            <WorkflowInputDialog
                isOpen={isInputOpen}
                onOpenChange={setIsInputOpen}
                inputs={runningWorkflow?.inputs as WorkflowInput[] || []}
                isStarting={isStarting}
                onConfirm={(inputs: Record<string, string>) => executeWorkflow(runningWorkflow!, inputs, true)}
                onCancel={() => setIsInputOpen(false)}
                confirmLabel="Run Workflow"
            />
        </>
    );
};

export default WorkflowRunner;
