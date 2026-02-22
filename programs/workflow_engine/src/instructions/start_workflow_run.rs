use anchor_lang::prelude::*;

use crate::errors::WorkflowError;
use crate::state::{RunStatus, Task, TaskStatus, WorkflowRun, WorkflowTemplate, Workspace};

#[derive(Accounts)]
#[instruction(template_index: u32)]
pub struct StartWorkflowRun<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"workspace", workspace.admin.as_ref()],
        bump = workspace.bump
    )]
    pub workspace: Account<'info, Workspace>,
    #[account(
        seeds = [
            b"template",
            workspace.key().as_ref(),
            template_index.to_le_bytes().as_ref()
        ],
        bump = template.bump,
        constraint = template.workspace == workspace.key() @ WorkflowError::InvalidTemplate
    )]
    pub template: Account<'info, WorkflowTemplate>,
    #[account(
        init,
        payer = creator,
        space = 8 + WorkflowRun::INIT_SPACE,
        seeds = [
            b"run",
            workspace.key().as_ref(),
            workspace.run_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub run: Account<'info, WorkflowRun>,

    #[account(
        init,
        payer = creator,
        space = 8 + Task::INIT_SPACE,
        seeds = [b"task", run.key().as_ref(), 0u16.to_le_bytes().as_ref()],
        bump
    )]
    pub first_task: Account<'info, Task>,
    pub system_program: Program<'info, System>,
}

impl<'info> StartWorkflowRun<'info> {
    pub fn start_workflow_run(&mut self, bumps: &StartWorkflowRunBumps) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            !self.template.stages.is_empty(),
            WorkflowError::InvalidTemplate
        );

        let first_stage = self.template.stages[0];
        self.run.set_inner(WorkflowRun {
            workspace: self.workspace.key(),
            template: self.template.key(),
            creator: self.creator.key(),
            bump: bumps.run,
            run_id: self.workspace.run_count as u64,
            status: RunStatus::Active,
            current_stage_index: 0,
            created_at: now,
            closed_at: 0,
        });

        self.first_task.set_inner(Task {
            workspace: self.workspace.key(),
            run: self.run.key(),
            bump: bumps.first_task,
            task_index: 0,
            stage_index: 0,
            required_role: first_stage.required_role,
            max_retries: self.template.retry_limit,
            retry_count: 0,
            due_at: now + first_stage.sla_seconds,
            status: TaskStatus::InProgress,
            last_error_code: 0,
        });

        self.workspace.run_count = self.workspace.run_count.saturating_add(1);
        Ok(())
    }
}
