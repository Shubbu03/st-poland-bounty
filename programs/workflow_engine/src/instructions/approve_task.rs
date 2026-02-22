use anchor_lang::prelude::*;

use crate::errors::WorkflowError;
use crate::state::{RunStatus, Task, TaskStatus, WorkflowRun, Workspace};

#[derive(Accounts)]
pub struct ApproveTask<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [b"workspace", admin.key().as_ref()],
        bump = workspace.bump,
        has_one = admin
    )]
    pub workspace: Account<'info, Workspace>,
    #[account(
        mut,
        constraint = run.workspace == workspace.key() @ WorkflowError::Unauthorized
    )]
    pub run: Account<'info, WorkflowRun>,
    #[account(
        mut,
        seeds = [b"task", run.key().as_ref(), task.task_index.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.run == run.key() @ WorkflowError::InvalidTransition
    )]
    pub task: Account<'info, Task>,
}

impl<'info> ApproveTask<'info> {
    pub fn approve_task(&mut self) -> Result<()> {
        require!(
            self.task.status == TaskStatus::AwaitingApproval,
            WorkflowError::InvalidTransition
        );

        self.task.status = TaskStatus::Completed;
        self.run.status = RunStatus::Completed;
        self.run.closed_at = Clock::get()?.unix_timestamp;
        Ok(())
    }
}
