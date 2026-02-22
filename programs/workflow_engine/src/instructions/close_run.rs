use anchor_lang::prelude::*;

use crate::errors::WorkflowError;
use crate::state::{RunStatus, WorkflowRun, Workspace};

#[derive(Accounts)]
pub struct CloseRun<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(
        seeds = [b"workspace", workspace.admin.as_ref()],
        bump = workspace.bump
    )]
    pub workspace: Account<'info, Workspace>,
    #[account(
        mut,
        constraint = run.workspace == workspace.key() @ WorkflowError::Unauthorized
    )]
    pub run: Account<'info, WorkflowRun>,
}

impl<'info> CloseRun<'info> {
    pub fn close_run(&mut self) -> Result<()> {
        let actor = self.actor.key();
        require!(
            actor == self.workspace.admin || actor == self.run.creator,
            WorkflowError::Unauthorized
        );
        require!(
            self.run.status != RunStatus::Closed,
            WorkflowError::InvalidTransition
        );
        self.run.status = RunStatus::Closed;
        self.run.closed_at = Clock::get()?.unix_timestamp;
        Ok(())
    }
}
