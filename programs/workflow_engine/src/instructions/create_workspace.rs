use anchor_lang::prelude::*;

use crate::state::Workspace;

#[derive(Accounts)]
pub struct CreateWorkspace<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Workspace::INIT_SPACE,
        seeds = [b"workspace", admin.key().as_ref()],
        bump
    )]
    pub workspace: Account<'info, Workspace>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateWorkspace<'info> {
    pub fn create_workspace(
        &mut self,
        workspace_id: u64,
        bumps: &CreateWorkspaceBumps,
    ) -> Result<()> {
        self.workspace.set_inner(Workspace {
            admin: self.admin.key(),
            bump: bumps.workspace,
            workspace_id,
            template_count: 0,
            run_count: 0,
            created_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}
