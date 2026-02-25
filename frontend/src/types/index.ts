export type Status = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface Step {
    id: string;
    command_id: string;
    order: number;
    name: string;
    command_text: string;
    status: Status;
    output: string;
    created_at: string;
    updated_at: string;
}

export interface Command {
    id: string;
    name: string;
    description: string;
    status: Status;
    last_run?: string;
    created_at: string;
    updated_at: string;
    steps?: Step[];
}

export interface Server {
    id: string;
    name: string;
    description: string;
    host: string;
    port: number;
    user: string;
    auth_type: 'PASSWORD' | 'PUBLIC_KEY';
    password?: string;
    private_key?: string;
    created_at: string;
    updated_at: string;
}

export interface WorkflowStep {
    id: string;
    group_id: string;
    server_id?: string;
    name: string;
    command_text: string;
    order: number;
    status: Status;
    output: string;
    created_at: string;
    updated_at: string;
}

export interface WorkflowGroup {
    id: string;
    workflow_id: string;
    name: string;
    key: string;
    condition?: string;
    default_server_id?: string;
    order: number;
    is_parallel: boolean;
    status: Status;
    steps?: WorkflowStep[];
    created_at: string;
    updated_at: string;
}

export interface Workflow {
    id: string;
    namespace_id: string;
    name: string;
    description: string;
    default_server_id?: string;
    status: Status;
    inputs?: WorkflowInput[];
    variables?: WorkflowVariable[];
    groups?: WorkflowGroup[];
    created_at: string;
    updated_at: string;
}

export interface WorkflowExecution {
    id: string;
    workflow_id: string;
    status: Status;
    inputs: string;
    log_path: string;
    started_at: string;
    finished_at?: string;
    created_at: string;
    updated_at: string;
    workflow?: Workflow;
    steps?: WorkflowExecutionStep[];
}

export interface WorkflowExecutionStep {
    id: string;
    execution_id: string;
    step_id: string;
    name: string;
    status: string;
    output: string;
    started_at: string;
    finished_at?: string;
}

export interface WorkflowInput {
    id: string;
    workflow_id: string;
    key: string;
    label: string;
    type: 'input' | 'number' | 'select';
    default_value: string;
    created_at: string;
    updated_at: string;
}

export interface WorkflowVariable {
    id: string;
    workflow_id: string;
    key: string;
    value: string;
    created_at: string;
    updated_at: string;
}
