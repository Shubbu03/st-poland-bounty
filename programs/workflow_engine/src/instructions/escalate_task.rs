use anchor_lang::prelude::*;

use crate::errors::WorkflowError;
use crate::state::{RunStatus, Task, TaskStatus, WorkflowRun};

#[derive(Accounts)]
pub struct EscalateTask<'info> {
    #[account(mut)]
    pub run: Account<'info, WorkflowRun>,
    #[account(
        mut,
        seeds = [b"task", run.key().as_ref(), task.task_index.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.run == run.key() @ WorkflowError::InvalidTransition
    )]
    pub task: Account<'info, Task>,
}

impl<'info> EscalateTask<'info> {
    pub fn escalate_task(&mut self) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        require!(now > self.task.due_at, WorkflowError::DeadlineNotReached);
        require!(
            self.task.status == TaskStatus::InProgress
                || self.task.status == TaskStatus::AwaitingApproval
                || self.task.status == TaskStatus::Failed,
            WorkflowError::InvalidTransition
        );

        self.task.status = TaskStatus::Escalated;
        self.run.status = RunStatus::Escalated;
        Ok(())
    }
}
