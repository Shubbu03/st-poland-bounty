use anchor_lang::prelude::*;

#[error_code]
pub enum WorkflowError {
    #[msg("Unauthorized operation")]
    Unauthorized,
    #[msg("Invalid workflow transition")]
    InvalidTransition,
    #[msg("Deadline not reached")]
    DeadlineNotReached,
    #[msg("Task deadline already passed")]
    DeadlinePassed,
    #[msg("Retry limit exceeded")]
    RetryLimitExceeded,
    #[msg("Invalid template configuration")]
    InvalidTemplate,
    #[msg("Bounded vector exceeded max length")]
    VectorTooLarge,
    #[msg("Invalid stage index")]
    InvalidStageIndex,
}
