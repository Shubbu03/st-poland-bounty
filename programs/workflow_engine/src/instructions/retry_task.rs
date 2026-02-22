use anchor_lang::prelude::*;

use crate::errors::WorkflowError;
use crate::state::{Task, TaskStatus, WorkflowRun, WorkflowTemplate, Workspace};

#[derive(Accounts)]
pub struct RetryTask<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [b"workspace", admin.key().as_ref()],
        bump = workspace.bump,
        has_one = admin
    )]
    pub workspace: Account<'info, Workspace>,
    #[account(
        constraint = run.workspace == workspace.key() @ WorkflowError::Unauthorized
    )]
    pub run: Account<'info, WorkflowRun>,
    #[account(
        constraint = template.key() == run.template @ WorkflowError::InvalidTemplate
    )]
    pub template: Account<'info, WorkflowTemplate>,
    #[account(
        mut,
        seeds = [b"task", run.key().as_ref(), task.task_index.to_le_bytes().as_ref()],
        bump = task.bump,
        constraint = task.run == run.key() @ WorkflowError::InvalidTransition
    )]
    pub task: Account<'info, Task>,
}

impl<'info> RetryTask<'info> {
    pub fn retry_task(&mut self) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        require!(
            self.task.status == TaskStatus::Failed,
            WorkflowError::InvalidTransition
        );
        require!(
            self.task.retry_count < self.task.max_retries,
            WorkflowError::RetryLimitExceeded
        );

        let stage = self
            .template
            .stages
            .get(self.task.stage_index as usize)
            .ok_or(WorkflowError::InvalidStageIndex)?;

        self.task.retry_count = self.task.retry_count.saturating_add(1);
        self.task.status = TaskStatus::InProgress;
        self.task.due_at = now + stage.sla_seconds;
        self.task.last_error_code = 0;

        Ok(())
    }
}
