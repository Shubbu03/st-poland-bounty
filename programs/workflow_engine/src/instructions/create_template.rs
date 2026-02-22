use anchor_lang::prelude::*;

use crate::state::{StageDefinition, WorkflowTemplate, Workspace};
use crate::{constant::MAX_STAGES, errors::WorkflowError};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTemplateArgs {
    pub max_tasks: u16,
    pub retry_limit: u8,
    pub escalation_seconds: i64,
    pub stages: Vec<StageDefinition>,
}

#[derive(Accounts)]
pub struct CreateTemplate<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"workspace", admin.key().as_ref()],
        bump = workspace.bump,
        has_one = admin
    )]
    pub workspace: Account<'info, Workspace>,
    #[account(
        init,
        payer = admin,
        space = 8 + WorkflowTemplate::INIT_SPACE,
        seeds = [
            b"template",
            workspace.key().as_ref(),
            workspace.template_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub template: Account<'info, WorkflowTemplate>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateTemplate<'info> {
    pub fn create_template(
        &mut self,
        args: CreateTemplateArgs,
        bumps: &CreateTemplateBumps,
    ) -> Result<()> {
        require!(
            !args.stages.is_empty() && args.stages.len() <= MAX_STAGES,
            WorkflowError::InvalidTemplate
        );
        require!(
            args.max_tasks > 0 && args.max_tasks <= 20,
            WorkflowError::InvalidTemplate
        );
        require!(args.retry_limit <= 3, WorkflowError::InvalidTemplate);
        require!(args.escalation_seconds > 0, WorkflowError::InvalidTemplate);

        self.template.set_inner(WorkflowTemplate {
            workspace: self.workspace.key(),
            creator: self.admin.key(),
            bump: bumps.template,
            max_tasks: args.max_tasks,
            retry_limit: args.retry_limit,
            escalation_seconds: args.escalation_seconds,
            stage_count: args.stages.len() as u8,
            stages: args.stages,
        });
        self.workspace.template_count = self.workspace.template_count.saturating_add(1);
        Ok(())
    }
}
