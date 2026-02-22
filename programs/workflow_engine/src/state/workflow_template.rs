use anchor_lang::prelude::*;

use crate::StageDefinition;

#[account]
#[derive(InitSpace)]
pub struct WorkflowTemplate {
    pub workspace: Pubkey,
    pub creator: Pubkey,
    pub bump: u8,
    pub max_tasks: u16,
    pub retry_limit: u8,
    pub escalation_seconds: i64,
    pub stage_count: u8,
    #[max_len(32)]
    pub stages: Vec<StageDefinition>,
}
