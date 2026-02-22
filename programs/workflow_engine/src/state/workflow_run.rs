use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct WorkflowRun {
    pub workspace: Pubkey,
    pub template: Pubkey,
    pub creator: Pubkey,
    pub bump: u8,
    pub run_id: u64,
    pub status: RunStatus,
    pub current_stage_index: u8,
    pub created_at: i64,
    pub closed_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RunStatus {
    Active,
    Escalated,
    Completed,
    Closed,
}
