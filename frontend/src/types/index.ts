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
