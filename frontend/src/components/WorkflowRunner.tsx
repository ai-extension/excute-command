import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';
import { Workflow, WorkflowInput } from '../types';
import { Dialog, DialogContent } from "./ui/dialog";
import WorkflowMonitor from './WorkflowMonitor';
import WorkflowInputDialog from './WorkflowInputDialog';

interface WorkflowRunnerProps {
    children: (runWorkflow: (workflow: Partial<Workflow> & { id: string }, inputs?: Record<string, string>) => void) => React.ReactNode;
    onRunComplete?: () => void;
    onCloseMonitor?: () => void;
}

export const WorkflowRunner: React.FC<WorkflowRunnerProps> = ({ children, onRunComplete, onCloseMonitor }) => {
    const { apiFetch } = useAuth();
    const [runKey, setRunKey] = useState(0);
    const [isMonitorOpen, setIsMonitorOpen] = useState(false);
    const [isInputOpen, setIsInputOpen] = useState(false);
    const [runningWorkflow, setRunningWorkflow] = useState<(Partial<Workflow> & { id: string, execution_id?: string }) | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [pendingRun, setPendingRun] = useState<{ workflow: any, inputs?: Record<string, string> } | null>(null);

    const handleRunWorkflow = async (workflow: Partial<Workflow> & { id: string }, inputsValues?: Record<string, string>) => {
        // If workflow has inputs and they weren't provided yet, show dialog
        if (workflow.inputs && workflow.inputs.length > 0 && !inputsValues) {
            setRunningWorkflow(workflow);
            setIsInputOpen(true);
            return;
        }

        setIsInputOpen(false);
        setRunKey(prev => prev + 1);
        setPendingRun({ workflow, inputs: inputsValues });
        // Clear execution_id when starting a new run to ensure monitor starts fresh
        setRunningWorkflow({ ...workflow, execution_id: undefined });
        setIsMonitorOpen(true);
    };

    const handleMonitorReady = async () => {
        if (!pendingRun || isStarting) return;

        const { workflow, inputs } = pendingRun;
        setIsStarting(true);
        setPendingRun(null);

        try {
            const response = await apiFetch(`${API_BASE_URL}/workflows/${workflow.id}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputs: inputs || {} })
            });

            const data = await response.json();
            if (data.execution_id) {
                setRunningWorkflow(prev => prev ? { ...prev, execution_id: data.execution_id } : null);
            }

            if (onRunComplete) {
                onRunComplete();
            }
        } catch (error) {
            console.error('Failed to run workflow:', error);
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <>
            {children((workflow, inputs) => handleRunWorkflow(workflow, inputs))}

            {/* Workflow Monitor Dialog */}
            <Dialog open={isMonitorOpen} onOpenChange={setIsMonitorOpen}>
                <DialogContent hideClose className="max-w-5xl w-[90vw] h-[85vh] bg-[#0a0b0e] border-[#1a1c23] border-2 rounded-2xl p-0 overflow-hidden shadow-2xl flex flex-col">
                    {runningWorkflow && (
                        <WorkflowMonitor
                            key={runKey}
                            workflow={runningWorkflow as any}
                            onReady={handleMonitorReady}
                            onReRun={(workflow, inputs) => {
                                // Reset starting states to allow a fresh run
                                setIsStarting(false);
                                setPendingRun(null);
                                handleRunWorkflow(workflow, inputs);
                            }}
                            onClose={() => {
                                setIsMonitorOpen(false);
                                if (onCloseMonitor) {
                                    onCloseMonitor();
                                }
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Runtime Input Dialog */}
            <WorkflowInputDialog
                isOpen={isInputOpen}
                onOpenChange={setIsInputOpen}
                inputs={runningWorkflow?.inputs as WorkflowInput[] || []}
                isStarting={isStarting}
                onConfirm={(values) => handleRunWorkflow(runningWorkflow!, values)}
                onCancel={() => setIsInputOpen(false)}
            />
        </>
    );
};

export default WorkflowRunner;
