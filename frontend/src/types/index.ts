export type Status = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';


export interface VpnConfig {
    id: string;
    name: string;
    description: string;
    host: string;
    port: number;
    user: string;
    auth_type: 'PASSWORD' | 'PUBLIC_KEY';
    password?: string;
    private_key?: string;
    created_by?: string;
    created_by_username?: string;
    created_at: string;
    updated_at: string;
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
    vpn_id?: string;
    vpn?: VpnConfig;
    created_by?: string;
    created_by_username?: string;
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
    is_copy_enabled: boolean;
    copy_source_path?: string;
    copy_target_server_id?: string;
    copy_target_path?: string;
    created_at: string;
    updated_at: string;
}

export interface Tag {
    id: string;
    namespace_id: string;
    name: string;
    color: string;
    created_by?: string;
    created_by_username?: string;
    created_at: string;
    updated_at: string;
}

export type HookType = 'BEFORE' | 'AFTER_SUCCESS' | 'AFTER_FAILED';

export interface WorkflowHook {
    id: string;
    workflow_id?: string;
    schedule_id?: string;
    target_workflow_id: string;
    hook_type: HookType;
    inputs: string;
    order: number;
    target_workflow?: Workflow;
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
    tags?: Tag[];
    files?: WorkflowFile[];
    target_folder?: string;
    cleanup_files?: boolean;
    is_template?: boolean;
    hooks?: WorkflowHook[];
    created_by?: string;
    created_by_username?: string;
    created_at?: string;
    updated_at?: string;
}

export interface WorkflowFile {
    id?: string;
    workflow_id: string;
    file_name: string;
    file_size: number;
    local_path?: string;
    target_path: string;
    created_at?: string;
    updated_at?: string;
}

export interface WorkflowExecution {
    id: string;
    workflow_id: string;
    scheduled_id?: string;
    page_id?: string;
    trigger_source: string;
    status: Status;
    inputs: string;
    executed_by?: string;
    user?: { id: string; username: string };
    log_path: string;
    started_at: string;
    finished_at?: string;
    created_at: string;
    updated_at: string;
    workflow?: Workflow;
    page?: Page;
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

export interface GlobalVariable {
    id: string;
    namespace_id: string;
    key: string;
    value: string;
    description: string;
    created_by?: string;
    created_by_username?: string;
    created_at: string;
    updated_at: string;
}

export type ScheduleType = 'ONE_TIME' | 'RECURRING';

export interface ScheduleWorkflow {
    id: string;
    schedule_id: string;
    workflow_id: string;
    inputs: string;
    workflow?: Workflow;
}

export interface Schedule {
    id: string;
    namespace_id: string;
    name: string;
    type: ScheduleType;
    cron_expression?: string;
    next_run_at?: string;
    status: 'ACTIVE' | 'PAUSED';
    retries: number;
    created_by?: string;
    created_by_username?: string;
    created_at: string;
    updated_at: string;
    workflows?: Workflow[]; // Legacy many-to-many
    scheduled_workflows?: ScheduleWorkflow[]; // Granular configurations
    hooks?: WorkflowHook[];
    tags?: Tag[];
    total_runs: number;
    last_run_status: string;
    last_run_at?: string;
}

export interface PageWorkflow {
    id: string;
    page_id: string;
    workflow_id: string;
    order: number;
    label: string;
    style: string;
    show_log: boolean;
    workflow?: Workflow;
}

export interface Page {
    id: string;
    namespace_id: string;
    title: string;
    description: string;
    slug: string;
    is_public: boolean;
    password?: string;
    expires_at?: string;
    layout: string;
    workflows?: PageWorkflow[];
    created_at?: string;
    updated_at?: string;
}

export interface Permission {
    id: string;
    name: string;
    type: string;
    action: string;
    created_at?: string;
    updated_at?: string;
}

export interface RolePermission {
    id: string;
    role_id: string;
    permission_id: string;
    resource_id?: string;
    permission?: Permission;
}

export interface Role {
    id: string;
    name: string;
    description: string;
    permissions?: RolePermission[];
    created_at?: string;
    updated_at?: string;
}

