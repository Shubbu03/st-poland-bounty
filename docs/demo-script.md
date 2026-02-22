# Demo Script for Judges

This script walks through all program capabilities. Run each command and observe the output.

## Prerequisites

Ensure you have:
- Solana CLI configured (`solana config get` shows localhost)
- Anchor CLI 0.30.1
- Local validator running (or use `anchor test` which starts one)

## Step 1: Build

```bash
npm install
anchor build
```

**Expected:** Compiles without errors. Creates `target/deploy/workflow_engine.so`.

## Step 2: Run Integration Tests

```bash
anchor test
```

**Expected output:**
```
workflow_engine integration tests
  workspace management
    ✓ creates a workspace
  template management
    ✓ creates a workflow template with 3 stages
    ✓ rejects template with > 3 retries
  workflow run lifecycle
    ✓ starts a workflow run and creates first task
    ✓ submits task result successfully -> awaiting_approval
    ✓ admin approves task -> completed
  failure and retry flow
    ✓ creates second run for failure testing
    ✓ submits failed result -> status=Failed
    ✓ admin retries failed task -> back to InProgress
    ✓ exhausts all retries then blocks further retry
  escalation flow
    ✓ escalate_task fails if deadline not reached
  authorization checks
    ✓ non-admin cannot approve tasks
  close run
    ✓ admin can close a completed run
```

All tests pass, demonstrating:
- PDA derivation and account creation
- State transitions with authorization
- Bounded retry enforcement
- Deadline-based escalation guards

## Step 3: Run Model Tests

```bash
npm test
```

**Expected output:**
```
workflow_engine state model
  ✓ blocks unauthorized submit attempts
  ✓ blocks stale submission after deadline
  ✓ prevents retry past max limit
  ✓ prevents double-approval/double-completion path
  ✓ escalates only after deadline and stays idempotent on second call
```

These are pure TypeScript tests of the state machine logic, validating the same rules enforced on-chain.

## Step 4: Run Interactive Demo

```bash
npm run demo:scenario
```

**Expected:** A colorful terminal walkthrough showing:

1. **PHASE 1:** Workspace creation
2. **PHASE 2:** Template creation with 3 stages
3. **PHASE 3:** Workflow run instantiation
4. **PHASE 4:** Task submission (success)
5. **PHASE 5:** Admin approval
6. **PHASE 6:** Failure + retry cycle
7. **PHASE 7:** Retry limit enforcement (blocked at max)
8. **PHASE 8:** Escalation guard (blocked before deadline)

## Step 5: Run Keeper (Dry Run)

```bash
npm run keeper:dry-run
```

**Expected output:**
```
╔════════════════════════════════════════════════════════════╗
║           WORKFLOW ENGINE KEEPER SERVICE                   ║
║                                                            ║
║  The keeper monitors tasks and escalates overdue items.    ║
║  It enforces SLA deadlines by calling escalate_task.       ║
║                                                            ║
║  IMPORTANT: The keeper has NO special privileges.          ║
║  All rules are enforced on-chain - keeper is just a        ║
║  trigger mechanism, not a trusted authority.               ║
╚════════════════════════════════════════════════════════════╝

Running in DRY RUN mode. Use --live to execute real transactions.

[timestamp] [KEEPER] Starting keeper cycle (dry_run=true)
[timestamp] [KEEPER] Workspace: ...
[timestamp] [KEEPER] Found X pending task(s)
[timestamp] [KEEPER] Task ... OVERDUE by Ns
[timestamp] [KEEPER] [DRY RUN] Would escalate task ...
[timestamp] [KEEPER] Cycle complete. Escalations this run: N
```

## Step 6: View Dashboard

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:3000`.

**See:**
- Program invariants (max stages, max tasks, max retries)
- State machine transition table
- Traditional backend vs on-chain comparison
- Architecture overview with PDA derivations

## Key Points to Highlight

1. **All logic is on-chain** — The TypeScript code only calls instructions; it cannot bypass rules

2. **Authorization is cryptographic** — `has_one = admin` constraint, not an `if` statement

3. **Deadlines use blockchain clock** — `Clock::get()?.unix_timestamp`

4. **Retries are bounded** — `require!(retry_count < max_retries)`

5. **Keeper is permissionless** — Anyone can run it; it has no special authority

6. **Audit trail is immutable** — Every state change is a transaction

## What This Proves

This submission demonstrates:

1. A real production backend pattern (workflow orchestration) can be rebuilt on Solana
2. Business logic that traditionally lives in application servers can be enforced by blockchain programs
3. The resulting system is trustless, verifiable, and auditable
4. The mapping from traditional components to on-chain equivalents is clear and practical
