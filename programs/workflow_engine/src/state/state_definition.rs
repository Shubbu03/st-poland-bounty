use anchor_lang::prelude::*;

// #[account]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub struct StageDefinition {
    pub kind: StageKind,
    pub required_role: u8,
    pub sla_seconds: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum StageKind {
    ManualApproval,
    OperatorExecution,
    Finalization,
}
