use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Workspace {
    pub admin: Pubkey,
    pub bump: u8,
    pub workspace_id: u64,
    pub template_count: u32,
    pub run_count: u32,
    pub created_at: i64,
}
