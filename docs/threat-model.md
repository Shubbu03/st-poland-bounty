# Threat Model

## Assets Under Protection

1. **Workflow state integrity** — Tasks must transition through valid states only
2. **Authorization boundaries** — Only permitted actors can perform privileged operations
3. **Deadline invariants** — Escalation must not trigger before deadline
4. **Retry limits** — Tasks cannot be retried beyond the configured maximum
5. **Audit trail** — All transitions must be recorded immutably

## Threat Categories

### 1. Unauthorized Transition Calls

**Threat:** Attacker calls `approve_task` without being the workspace admin.

**Mitigation:**
```rust
#[account(
    seeds = [b"workspace", admin.key().as_ref()],
    bump = workspace.bump,
    has_one = admin  // ← Anchor validates admin pubkey matches signer
)]
pub workspace: Account<'info, Workspace>,
```

The `has_one` constraint ensures the instruction fails if the signer doesn't match the workspace admin.

### 2. Replay / Double Completion

**Threat:** Attacker replays an `approve_task` transaction to double-complete.

**Mitigation:**
```rust
require!(
    self.task.status == TaskStatus::AwaitingApproval,
    WorkflowError::InvalidTransition
);
self.task.status = TaskStatus::Completed;  // Status changes on first call
```

Once the status changes, subsequent calls fail the `require!` check.

### 3. Keeper Abuse

**Threat:** Malicious keeper escalates tasks prematurely or repeatedly.

**Mitigation:**
```rust
require!(now > self.task.due_at, WorkflowError::DeadlineNotReached);
require!(
    self.task.status == TaskStatus::InProgress
        || self.task.status == TaskStatus::AwaitingApproval
        || self.task.status == TaskStatus::Failed,
    WorkflowError::InvalidTransition
);
```

- Premature escalation fails the deadline check
- Repeated escalation fails because status is already `Escalated`
- The keeper has no special privileges—it just calls a permissionless instruction

### 4. Unbounded Account Growth

**Threat:** Attacker creates millions of tasks, inflating rent costs or hitting account size limits.

**Mitigation:**
- Templates bounded to 3 stages max
- Tasks per run bounded to 20 max
- Retries bounded to 3 max
- These are enforced in `create_template`:

```rust
require!(
    !args.stages.is_empty() && args.stages.len() <= MAX_STAGES,
    WorkflowError::InvalidTemplate
);
require!(args.max_tasks > 0 && args.max_tasks <= 20, WorkflowError::InvalidTemplate);
require!(args.retry_limit <= 3, WorkflowError::InvalidTemplate);
```

### 5. Clock Manipulation

**Threat:** Validator manipulates clock to prematurely escalate tasks.

**Mitigation:**
- Solana validators have limited clock drift tolerance (enforced by the network)
- For high-value workflows, use longer SLA windows
- Cross-validator timestamp consensus provides reasonable guarantees

**Residual Risk:** A coordinated attack on clock consensus could affect deadline enforcement. This is an inherent limitation of on-chain time-based logic.

### 6. Front-Running

**Threat:** Attacker observes pending `approve_task` and front-runs it.

**Analysis:** This is not a meaningful attack because:
- The attacker would need to be the workspace admin to successfully call `approve_task`
- If the attacker is the admin, they already have authority

### 7. Cross-Workspace Interference

**Threat:** Attacker uses Task from Workspace A to manipulate Run in Workspace B.

**Mitigation:**
```rust
constraint = task.run == run.key() @ WorkflowError::InvalidTransition
```

Account constraints verify that the Task's `run` field matches the Run account being passed. PDAs are also derived from the workspace, making cross-contamination impossible.

## Residual Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Clock boundary behavior | Low | Stress-test around exact deadline timestamps |
| Complex stage logic | Medium | v1 only supports simple linear stages |
| Keeper availability | Low | If no keeper runs, tasks won't escalate (but state remains valid) |
| Program upgrade authority | Medium | Production deployment should use multisig or immutable program |

## Recommendations for Production

1. **External audit** — Before mainnet deployment, engage a Solana security auditor
2. **Fuzz testing** — Use Trident or similar for property-based testing
3. **Multisig upgrade authority** — Protect program upgrade key
4. **Monitoring** — Alert on unexpected error rates or patterns
5. **Rate limiting** — Consider instruction-level rate limits for create operations
