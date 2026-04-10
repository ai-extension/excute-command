export type Status = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';


export interface VpnConfig {
    id: string;
    name: string;
    description: string;
    vpn_type: 'SSH' | 'OPENVPN' | 'WIREGUARD';
    host: string;
    port: number;
    user?: string;
    auth_type?: 'PASSWORD' | 'PUBLIC_KEY';
    password?: string;
    private_key?: string;
    config_file?: string; // For OpenVPN (.ovpn) or WireGuard (.conf)
    public_key?: string;   // For WireGuard
    shared_key?: string;  // For WireGuard
    created_by?: string;
    created_by_username?: string;
    created_at: string;
    updated_at: string;
}

export interface Server {
    id: string;
    name: string;
    description: string;
    connection_type: 'SSH' | 'LOCAL';
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
    action_type: 'COMMAND' | 'WORKFLOW' | 'HTTP';
    action_key?: string;
    command_text: string;
    http_url?: string;
    http_method?: string;
    http_headers?: string;
    http_body?: string;
    output_format?: 'json' | 'string';
    target_workflow_id?: string;
    target_workflow_inputs?: string; // JSON string
    wait_to_finish: boolean;
    order: number;
    created_at: string;
    updated_at: string;
}

export interface WorkflowGroup {
    id: string;
    workflow_id: string;
    name: string;
    key: string;
    for?: string;
    loop_enabled?: boolean;
    condition?: string;
    default_server_id?: string;
    default_server?: Server;
    order: number;
    is_parallel: boolean;
    status: Status;
    steps?: WorkflowStep[];
    is_copy_enabled: boolean;
    copy_source_path?: string;
    copy_target_server_id?: string;
    copy_target_server?: Server;
    copy_target_path?: string;
    continue_on_failure: boolean;
    retry_enabled: boolean;
    retry_limit: number;
    retry_delay: number;
    mcp_report_log: boolean;
    use_tty?: boolean;
    auto_inputs?: string;
    skip: boolean;
    created_at: string;
    updated_at: string;
}

export interface Tag {
    id: string;
    namespace_id: string;
    name: string;
    color: string;
    description: string;
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
    default_server?: Server;
    status: Status;
    timeout_minutes?: number;
    inputs?: WorkflowInput[];
    variables?: WorkflowVariable[];
    groups?: WorkflowGroup[];
    tags?: Tag[];
    files?: WorkflowFile[];
    target_folder?: string;
    cleanup_files?: boolean;

    group_count?: number;
    step_count?: number;

    is_template?: boolean;
    is_public?: boolean;
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
    use_variable_substitution: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface WorkflowExecution {
    id: string;
    workflow_id: string;
    scheduled_id?: string;
    page_id?: string;
    parent_execution_id?: string;
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
    group_id: string;
    group_name: string;
    name: string;
    status: string;
    output: string;
    started_at: string;
    finished_at?: string;
}

export interface MultiInputItem {
    id: string;
    key: string;
    label: string;
    type: 'input' | 'number' | 'select' | 'file';
    options?: string; // Comma separated for select type
}

export interface WorkflowInput {
    id: string;
    workflow_id: string;
    key: string;
    label: string;
    type: 'input' | 'number' | 'select' | 'multi-select' | 'multi-input' | 'file';
    default_value: string;
    collapse_initially?: boolean;
    required: boolean;
    order?: number;
    created_at: string;
    updated_at: string;
}

export interface WorkflowVariable {
    id: string;
    workflow_id: string;
    key: string;
    value: string;
    order?: number;
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
    catch_up: boolean;
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

export type PageWidgetSize = 'full' | 'half';
export type PageWidgetType = 'TERMINAL' | 'ENDPOINT';
export type PageWidgetReload = 'realtime' | '5' | '10' | '30' | '60';

export interface PageWidget {
    id: string;
    type: PageWidgetType;
    title: string;
    size: PageWidgetSize;
    // TERMINAL-specific
    server_id?: string;
    server_name?: string;
    command?: string;
    run_interval?: number;
    reload_interval?: PageWidgetReload;
    // ENDPOINT-specific
    workflow_id?: string;
    workflow_name?: string;
    label?: string;
    style?: string;
    show_log?: boolean;
    description?: string;
}

export interface PageLayout {
    widgets: PageWidget[];
}

export interface Page {
    id: string;
    namespace_id: string;
    title: string;
    description: string;
    slug: string;
    is_public: boolean;
    password?: string;
    token_ttl_minutes?: number;
    expires_at?: string;
    layout: string;
    workflows?: PageWorkflow[];
    tags?: Tag[];
    created_by?: string;
    created_by_username?: string;
    created_at?: string;
    updated_at?: string;
}

export interface User {
    id: string;
    username: string;
    email?: string;
    full_name?: string;
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

export interface AuditLog {
    id: string;
    timestamp: string;
    namespace_id?: string;
    user_id?: string;
    username: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    metadata: string; // JSON string
    status: string;
    ip_address: string;
}
