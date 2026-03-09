import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Workflow, WorkflowInput } from '../types';
import { Dialog, DialogContent } from "./ui/dialog";
import WorkflowMonitor from './WorkflowMonitor';
import WorkflowRunDialog from './WorkflowRunDialog';

interface WorkflowRunnerProps {
    children: (runWorkflow: (workflow: Partial<Workflow> & { id: string }, inputs?: Record<string, string>, startGroupID?: string, startStepID?: string, fromExecutionID?: string) => void) => React.ReactNode;
    onRunComplete?: () => void;
    onCloseMonitor?: () => void;
}

interface BatchState {
    workflow: Partial<Workflow> & { id: string };
    rows: Record<string, string>[];
    mode: 'PARALLEL' | 'SEQUENTIAL';
    batchID: string;
    currentIndex: number;
    executionIDs: string[];
}

export const WorkflowRunner: React.FC<WorkflowRunnerProps> = ({ children, onRunComplete, onCloseMonitor }) => {
    const { apiFetch, showToast } = useAuth();
    const [runKey, setRunKey] = useState(0);
    const [isMonitorOpen, setIsMonitorOpen] = useState(false);
    const [isInputOpen, setIsInputOpen] = useState(false);
    const [runningWorkflow, setRunningWorkflow] = useState<(Partial<Workflow> & { id: string, execution_id?: string, status?: string }) | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [batchState, setBatchState] = useState<BatchState | null>(null);

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
        await executeBatch(workflow, [inputsValues || {}], 'PARALLEL');
    };

    const executeBatch = async (
        workflow: Partial<Workflow> & { id: string },
        rows: Record<string, string>[],
        mode: 'PARALLEL' | 'SEQUENTIAL',
        openMonitor: boolean = true
    ) => {
        const batchID = crypto.randomUUID();
        setIsStarting(true);

        if (mode === 'PARALLEL') {
            const triggerPromises = rows.map(row => triggerExecution(workflow.id, row, batchID));
            const results = await Promise.all(triggerPromises);
            const validExecIDs = results.filter((id): id is string => !!id);

            if (validExecIDs.length > 0) {
                setRunKey(prev => prev + 1);
                setRunningWorkflow({ ...workflow, execution_id: validExecIDs[0], status: 'PENDING' });
                setIsMonitorOpen(openMonitor);
                setIsInputOpen(false);
                if (validExecIDs.length > 1) {
                    showToast(`Launched ${validExecIDs.length} parallel executions as batch.`, 'info');
                }
            } else {
                showToast('Failed to start any executions.', 'error');
            }
        } else {
            // SEQUENTIAL
            const execID = await triggerExecution(workflow.id, rows[0], batchID);
            if (execID) {
                setBatchState({
                    workflow,
                    rows,
                    mode,
                    batchID,
                    currentIndex: 0,
                    executionIDs: [execID]
                });
                setRunKey(prev => prev + 1);
                setRunningWorkflow({ ...workflow, execution_id: execID, status: 'PENDING' });
                setIsMonitorOpen(openMonitor);
                setIsInputOpen(false);
            } else {
                showToast('Failed to start sequential execution.', 'error');
            }
        }

        setIsStarting(false);
        if (onRunComplete) onRunComplete();
    };

    const triggerExecution = useCallback(async (workflowID: string, inputs: Record<string, string>, batchID: string) => {
        try {
            const body = {
                inputs,
                batch_id: batchID
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
        // Monitor is ready, but we already triggered initial runs in executeBatch
    };

    // Sequential Orchestration: Watch status of runningWorkflow
    useEffect(() => {
        if (batchState && batchState.mode === 'SEQUENTIAL' && runningWorkflow?.execution_id && !isStarting) {
            const currentExecID = batchState.executionIDs[batchState.currentIndex];

            // Only proceed if the current execution in the monitor matches what we expect
            if (runningWorkflow.execution_id === currentExecID) {
                const status = (runningWorkflow as any).status;

                if (status === 'SUCCESS' || status === 'FAILED') {
                    const nextIndex = batchState.currentIndex + 1;

                    if (nextIndex < batchState.rows.length) {
                        // Delay slightly to let the user see the result
                        const timer = setTimeout(async () => {
                            setIsStarting(true);
                            showToast(`Starting next execution in sequence (${nextIndex + 1}/${batchState.rows.length})...`, 'info');

                            const nextExecID = await triggerExecution(batchState.workflow.id, batchState.rows[nextIndex], batchState.batchID);
                            if (nextExecID) {
                                // Update monitor to the next execution
                                setRunKey(prev => prev + 1);
                                setRunningWorkflow({ ...batchState.workflow, execution_id: nextExecID, status: 'PENDING' });
                                setBatchState(prev => prev ? {
                                    ...prev,
                                    currentIndex: nextIndex,
                                    executionIDs: [...prev.executionIDs, nextExecID]
                                } : null);
                            } else {
                                setBatchState(null);
                            }
                            setIsStarting(false);
                        }, 2000);

                        return () => clearTimeout(timer);
                    } else {
                        // Sequence complete
                        showToast(`All ${batchState.rows.length} executions in sequence complete.`, 'success');
                        setBatchState(null);
                        if (onRunComplete) onRunComplete();
                    }
                }
            }
        }
    }, [runningWorkflow?.status, runningWorkflow?.execution_id, batchState, isStarting, triggerExecution, onRunComplete, showToast]);

    return (
        <>
            {children((workflow, inputs, startGroupID, startStepID, fromExecutionID) => {
                // If it's a rerun from history/monitor (inputs provided), run it as a single row parallel batch
                if (inputs) {
                    executeBatch(workflow, [inputs], 'PARALLEL', true);
                } else {
                    handleRunWorkflow(workflow);
                }
            })}

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
                                setBatchState(null);
                                executeBatch(workflow, [inputs], 'PARALLEL', true);
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
            <WorkflowRunDialog
                isOpen={isInputOpen}
                onOpenChange={setIsInputOpen}
                inputs={runningWorkflow?.inputs as WorkflowInput[] || []}
                isStarting={isStarting}
                onConfirm={(rows: Record<string, string>[], mode: 'PARALLEL' | 'SEQUENTIAL', openMonitor: boolean) => executeBatch(runningWorkflow!, rows, mode, openMonitor)}
                onCancel={() => setIsInputOpen(false)}
            />
        </>
    );
};

export default WorkflowRunner;
