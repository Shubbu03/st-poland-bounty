#![allow(unexpected_cfgs, deprecated)]
use anchor_lang::prelude::*;

pub mod constant;
pub mod errors;
pub mod instructions;
pub mod state;

pub use constant::*;
pub use instructions::*;
pub use state::*;

declare_id!("ETggxWEvQkEu3EPh5APnpY9C5oDMnNDStYtsgaaCW3BB");

#[program]
pub mod workflow_engine {
    use super::*;

    pub fn create_workspace(ctx: Context<CreateWorkspace>, workspace_id: u64) -> Result<()> {
        ctx.accounts.create_workspace(workspace_id, &ctx.bumps)
    }

    pub fn create_template(ctx: Context<CreateTemplate>, args: CreateTemplateArgs) -> Result<()> {
        ctx.accounts.create_template(args, &ctx.bumps)
    }

    pub fn start_workflow_run(ctx: Context<StartWorkflowRun>, _template_index: u32) -> Result<()> {
        ctx.accounts.start_workflow_run(&ctx.bumps)
    }

    pub fn submit_task_result(
        ctx: Context<SubmitTaskResult>,
        success: bool,
        error_code: u16,
    ) -> Result<()> {
        ctx.accounts.submit_task_result(success, error_code)
    }

    pub fn approve_task(ctx: Context<ApproveTask>) -> Result<()> {
        ctx.accounts.approve_task()
    }

    pub fn retry_task(ctx: Context<RetryTask>) -> Result<()> {
        ctx.accounts.retry_task()
    }

    pub fn escalate_task(ctx: Context<EscalateTask>) -> Result<()> {
        ctx.accounts.escalate_task()
    }

    pub fn close_run(ctx: Context<CloseRun>) -> Result<()> {
        ctx.accounts.close_run()
    }
}
