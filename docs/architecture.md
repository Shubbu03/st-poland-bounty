# Workflow Engine Architecture

## Overview

This Solana program implements a workflow orchestration engine—a common backend pattern for managing multi-step approval processes, task execution pipelines, and SLA-driven escalations.

## Core Entities

### Workspace
The administrative boundary. One admin controls one workspace.

```rust
pub struct Workspace {
    pub admin: Pubkey,           // Only this pubkey can create templates, approve tasks
    pub bump: u8,                // PDA bump seed
    pub workspace_id: u64,       // User-provided identifier
    pub template_count: u32,     // Increments with each new template
    pub run_count: u32,          // Increments with each new run
    pub created_at: i64,         // Unix timestamp
}
```

**PDA derivation:** `["workspace", admin.key()]`

### WorkflowTemplate
A reusable definition of a workflow. Defines stages, SLAs, and retry policies.

```rust
pub struct WorkflowTemplate {
    pub workspace: Pubkey,
    pub creator: Pubkey,
    pub bump: u8,
    pub max_tasks: u16,          // Upper bound on tasks per run
    pub retry_limit: u8,         // Max retries per task (≤ 3)
    pub escalation_seconds: i64, // Global escalation window
    pub stage_count: u8,         // Number of stages (≤ 3)
    pub stages: Vec<StageDefinition>,
}

pub struct StageDefinition {
    pub kind: StageKind,         // ManualApproval | OperatorExecution | Finalization
    pub required_role: u8,       // Role identifier for authorization
    pub sla_seconds: i64,        // Deadline from task creation
}
```

**PDA derivation:** `["template", workspace.key(), template_count.to_le_bytes()]`

### WorkflowRun
An instance of a template being executed.

```rust
pub struct WorkflowRun {
    pub workspace: Pubkey,
    pub template: Pubkey,
    pub creator: Pubkey,         // Who started the run
    pub bump: u8,
    pub run_id: u64,
    pub status: RunStatus,       // Active | Escalated | Completed | Closed
    pub current_stage_index: u8,
    pub created_at: i64,
    pub closed_at: i64,
}
```

**PDA derivation:** `["run", workspace.key(), run_count.to_le_bytes()]`

### Task
The unit of work within a run. Tracks status, retries, and deadlines.

```rust
pub struct Task {
    pub workspace: Pubkey,
    pub run: Pubkey,
    pub bump: u8,
    pub task_index: u16,
    pub stage_index: u8,
    pub required_role: u8,
    pub max_retries: u8,
    pub retry_count: u8,
    pub due_at: i64,             // Unix timestamp deadline
    pub status: TaskStatus,      // InProgress | AwaitingApproval | Failed | Escalated | Completed
    pub last_error_code: u16,    // Application-specific error code on failure
}
```

**PDA derivation:** `["task", run.key(), task_index.to_le_bytes()]`

## Instruction Flow

```
create_workspace
      │
      ▼
create_template (bounded: ≤3 stages, ≤3 retries)
      │
      ▼
start_workflow_run (creates run + first task)
      │
      ▼
submit_task_result ←────────────────────┐
      │                                  │
      ├── success → awaiting_approval    │
      │      │                           │
      │      ▼                           │
      │   approve_task → completed       │
      │                                  │
      └── failure → failed               │
             │                           │
             ▼                           │
          retry_task (if retry_count < max)
                                        │
escalate_task ◄─────────────────────────┘
(permissionless, requires now > due_at)
      │
      ▼
close_run (marks run as closed)
```

## State Transition Principles

1. **On-chain validation:** Every transition is validated in the program instruction. No off-chain component can bypass these checks.

2. **Clock-based deadlines:** Deadlines are enforced using `Clock::get()?.unix_timestamp`. The keeper can only trigger escalation after the deadline.

3. **Bounded retries:** `retry_count` is incremented on each retry. When `retry_count >= max_retries`, the retry instruction fails.

4. **Idempotent escalation:** Once a task is `Escalated` or `Completed`, further escalation attempts fail with `InvalidTransition`.

5. **Status gating:** Each instruction checks the current status before proceeding. For example:
   - `approve_task` requires `AwaitingApproval`
   - `retry_task` requires `Failed`
   - `escalate_task` requires not `Completed` or `Escalated`

## Design Decisions

### Why PDAs instead of traditional keypairs?
- Deterministic addresses allow any client to derive the account address without storing it
- Seeds encode the relationship hierarchy (workspace → template → run → task)

### Why bounded vectors?
- Prevents unbounded rent costs
- Ensures predictable account sizes for `init` space calculation

### Why a separate keeper service?
- The program cannot self-execute on a schedule
- External services must trigger time-based transitions
- The keeper is permissionless—it has no special authority, just calls `escalate_task`

### Why status enums instead of timestamps?
- Clearer state machine semantics
- Easier to write `require!` checks
- Timestamps are still stored for audit purposes (`created_at`, `closed_at`, `due_at`)
