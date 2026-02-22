use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Task {
    pub workspace: Pubkey,
    pub run: Pubkey,
    pub bump: u8,
    pub task_index: u16,
    pub stage_index: u8,
    pub required_role: u8,
    pub max_retries: u8,
    pub retry_count: u8,
    pub due_at: i64,
    pub status: TaskStatus,
    pub last_error_code: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TaskStatus {
    InProgress,
    AwaitingApproval,
    Failed,
    Escalated,
    Completed,
}
