use anchor_lang::prelude::*;

use crate::errors::WorkflowError;
use crate::state::{StageKind, Task, TaskStatus, WorkflowRun, WorkflowTemplate, Workspace};

#[derive(Accounts)]
pub struct SubmitTaskResult<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(
        seeds = [b"workspace", workspace.admin.as_ref()],
        bump = workspace.bump
    )]
    pub workspace: Account<'info, Workspace>,
    #[account(
        constraint = run.workspace == workspace.key() @ WorkflowError::InvalidTransition
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

impl<'info> SubmitTaskResult<'info> {
    pub fn submit_task_result(&mut self, success: bool, error_code: u16) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        require!(
            self.actor.key() == self.run.creator || self.actor.key() == self.workspace.admin,
            WorkflowError::Unauthorized
        );
        require!(now <= self.task.due_at, WorkflowError::DeadlinePassed);
        require!(
            self.task.status == TaskStatus::InProgress || self.task.status == TaskStatus::Failed,
            WorkflowError::InvalidTransition
        );

        let stage = self
            .template
            .stages
            .get(self.task.stage_index as usize)
            .ok_or(WorkflowError::InvalidStageIndex)?;

        match stage.kind {
            StageKind::ManualApproval => {
                self.task.status = if success {
                    TaskStatus::AwaitingApproval
                } else {
                    TaskStatus::Failed
                };
            }
            StageKind::OperatorExecution => {
                self.task.status = if success {
                    TaskStatus::AwaitingApproval
                } else {
                    TaskStatus::Failed
                };
            }
            StageKind::Finalization => {
                self.task.status = if success {
                    TaskStatus::Completed
                } else {
                    TaskStatus::Failed
                };
            }
        }

        self.task.last_error_code = if success { 0 } else { error_code };
        Ok(())
    }
}
