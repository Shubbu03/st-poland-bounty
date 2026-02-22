# On-Chain Workflow Engine

**Superteam Poland Bounty Submission**  
[Bounty Link](https://superteam.fun/earn/listing/rebuild-production-backend-systems-as-on-chain-rust-programs)

This project rebuilds a production backend pattern—**workflow orchestration**—as an on-chain Solana Anchor program. Instead of trusting a centralized server to manage approvals, retries, and escalations, all business logic is enforced by the blockchain.

## Devnet Deployment

| Resource | Link |
|----------|------|
| **Program ID** | [ETggxWEvQkEu3EPh5APnpY9C5oDMnNDStYtsgaaCW3BB](https://explorer.solana.com/address/ETggxWEvQkEu3EPh5APnpY9C5oDMnNDStYtsgaaCW3BB?cluster=devnet) |
| **Live Demo** | [workflow-bounty.vercel.app](https://workplace-bounty.vercel.app/)|

## What This Solves

Traditional workflow engines (Temporal, AWS Step Functions, custom approval systems) rely on:
- A trusted server to enforce state transitions
- Mutable databases for audit trails
- Application-level authorization that can be bypassed

By moving this on-chain:
- **No trusted operator** — rules are in the program, not middleware
- **Immutable audit trail** — every transition is a blockchain transaction
- **Verifiable state** — anyone can read account data and verify invariants

## The Pattern Being Rebuilt

This is a **multi-stage approval workflow** commonly used in:
- Procurement systems (submit → review → approve)
- CI/CD pipelines (build → test → deploy)
- Ticketing systems (open → in progress → resolved)
- SLA management (deadline tracking → escalation)

### Traditional Implementation
```
┌─────────────────────────────────────────────────────────┐
│  Backend Server                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ Auth Layer  │→ │ Workflow    │→ │ PostgreSQL DB   │ │
│  │ (JWT/RBAC)  │  │ Controller  │  │ (mutable state) │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│         ↓                                               │
│  ┌─────────────┐                                       │
│  │ Cron Job    │ → deadline checks                     │
│  └─────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

### On-Chain Implementation
```
┌──────────────────────────────────────────────────────────┐
│  Solana Program (workflow_engine)                        │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────┐ │
│  │ Account      │→ │ Instruction   │→ │ PDA State     │ │
│  │ Constraints  │  │ Handlers      │  │ (immutable)   │ │
│  │ (has_one,    │  │ (submit,      │  │               │ │
│  │  signer)     │  │  approve...)  │  │               │ │
│  └──────────────┘  └───────────────┘  └───────────────┘ │
│         ↓                                                │
│  ┌──────────────┐                                       │
│  │ Keeper       │ → permissionless deadline trigger     │
│  │ (no special  │                                       │
│  │  privileges) │                                       │
│  └──────────────┘                                       │
└──────────────────────────────────────────────────────────┘
```

## Mapping: Traditional → On-Chain

| Concept | Traditional Backend | This Program |
|---------|--------------------| -------------|
| User session | JWT tokens | Transaction signers |
| Role check | Middleware `if (user.role === 'admin')` | `has_one = admin` account constraint |
| State storage | PostgreSQL row | PDA account data |
| State transition | Controller method | Program instruction |
| Audit log | Log file / audit table | Blockchain transaction history |
| Deadline check | Cron job queries DB | `Clock::get()?.unix_timestamp` |
| Retry counter | DB column + app logic | `u8` field + `require!` macro |
| Admin approval | API endpoint with auth | `approve_task` instruction with signer check |

## Program Architecture

### Accounts (State)

```
Workspace (PDA: ["workspace", admin])
├── admin: Pubkey
├── template_count: u32
├── run_count: u32
└── created_at: i64

WorkflowTemplate (PDA: ["template", workspace, index])
├── workspace: Pubkey
├── max_tasks: u16 (≤ 20)
├── retry_limit: u8 (≤ 3)
├── escalation_seconds: i64
├── stage_count: u8 (≤ 3)
└── stages: Vec<StageDefinition>

WorkflowRun (PDA: ["run", workspace, index])
├── workspace: Pubkey
├── template: Pubkey
├── creator: Pubkey
├── status: Active | Escalated | Completed | Closed
└── timestamps

Task (PDA: ["task", run, index])
├── run: Pubkey
├── status: InProgress | AwaitingApproval | Failed | Escalated | Completed
├── retry_count: u8
├── max_retries: u8
├── due_at: i64
└── last_error_code: u16
```

### Instructions

| Instruction | Who Can Call | On-Chain Enforcement |
|-------------|--------------|---------------------|
| `create_workspace` | Anyone | Creates PDA seeded by admin pubkey |
| `create_template` | Workspace admin | `has_one = admin`, validates stages ≤ 3, retries ≤ 3 |
| `start_workflow_run` | Anyone | Template must exist, creates first task |
| `submit_task_result` | Creator or admin | `now <= due_at`, status must be InProgress or Failed |
| `approve_task` | Admin only | Status must be AwaitingApproval |
| `retry_task` | Admin only | Status must be Failed, retry_count < max |
| `escalate_task` | Anyone (keeper) | `now > due_at`, status not Completed/Escalated |
| `close_run` | Creator or admin | Run not already closed |

### State Machine

```
                    ┌──────────────────┐
                    │    InProgress    │
                    └────────┬─────────┘
                             │
              submit_task_result()
                             │
            ┌────────────────┴────────────────┐
            │                                 │
            ▼                                 ▼
   ┌─────────────────┐               ┌───────────────┐
   │ AwaitingApproval│               │    Failed     │◄────┐
   └────────┬────────┘               └───────┬───────┘     │
            │                                │             │
       approve_task()                  retry_task()        │
            │                                │             │
            ▼                                └─────────────┘
   ┌─────────────────┐                            (if retry_count < max)
   │    Completed    │
   └─────────────────┘

   ─────────────────────────────────────────────────────────
   At ANY point if now > due_at and status not terminal:
   
   escalate_task() ──► ┌─────────────┐
                       │  Escalated  │
                       └─────────────┘
```

## Bounded Constraints (v1)

These limits prevent unbounded on-chain resource consumption:

- **Max stages per template:** 3
- **Max tasks per run:** 20
- **Max retries per task:** 3
- **Escalation policy:** Single policy (deadline → escalated)

## Project Structure

```
.
├── programs/workflow_engine/    # Anchor Rust program
│   ├── src/
│   │   ├── lib.rs              # Entry point
│   │   ├── instructions/       # All instruction handlers
│   │   ├── state/              # Account definitions
│   │   ├── errors.rs           # Custom error codes
│   │   └── constant.rs         # Program constants
├── tests/
│   ├── workflow_engine.ts      # Anchor integration tests
│   └── workflow_engine.model.spec.ts  # State machine model tests
├── scripts/
│   └── demo-scenario.ts        # Interactive demo
├── keeper/
│   └── index.ts                # Deadline enforcement service
├── app/                        # Judge-facing dashboard
└── docs/
    ├── architecture.md
    ├── threat-model.md
    └── demo-script.md
```

## Quick Start

### Prerequisites
- Rust + Cargo
- Solana CLI (1.18+)
- Anchor CLI (0.30+)
- Node.js (18+)

### Build & Test

```bash
# Install dependencies
npm install

# Build the program
anchor build

# Sync program keys (updates declare_id! and Anchor.toml)
anchor keys sync

# Run state machine model tests (no validator needed)
npm test
```

### Running Locally

The interactive demo requires a running Solana validator with the program deployed.

**Terminal 1 — Start local validator:**
```bash
solana-test-validator
```

**Terminal 2 — Deploy and run:**
```bash
# Deploy to local validator
anchor deploy

# Run the full demo scenario
npm run demo:local
```

The demo walks through:
1. Workspace creation
2. Template creation (3 stages, retry_limit=3)
3. Run instantiation
4. Task submission (success → awaiting approval)
5. Admin approval (→ completed)
6. Failure + retry cycle
7. Retry limit enforcement
8. Escalation guard (deadline check)

### Running on Devnet

```bash
# Ensure you have devnet SOL
solana config set --url devnet
solana airdrop 2

# Run demo against deployed devnet program
npm run demo:devnet
```

### Anchor Test (All-in-One)

`anchor test` handles everything automatically — starts validator, deploys, runs tests, and shuts down:

```bash
anchor test
```

### Keeper Service

The keeper monitors tasks and triggers escalation for overdue items.

```bash
# Local - dry run (shows what would be escalated)
npm run keeper:dry-run

# Local - live mode (actually calls escalate_task)
npm run keeper:live

# Devnet - live mode
npm run keeper:devnet
```

The keeper:
- Scans all active tasks in a workspace
- Identifies tasks past their `due_at` deadline
- Calls `escalate_task` instruction
- Maintains idempotency state to prevent double-escalation

**Important:** The keeper has no special privileges. It's just a trigger mechanism. All enforcement happens on-chain.

### Dashboard

```bash
cd app
npm install
npm run dev
```

Opens at `http://localhost:3000` — interactive UI to explore the program, create workflows, and submit tasks.

## Security Model

See [docs/threat-model.md](docs/threat-model.md) for full details.

Key points:
- **Authorization:** Signer checks + account constraints, not application logic
- **Replay protection:** Status-gated transitions prevent double-completion
- **Keeper abuse impossible:** Keeper can only call permissionless instructions; on-chain rules are authoritative
- **Bounded growth:** Vector lengths and counts are capped

## What Makes This a Valid Bounty Submission

1. **Real backend pattern:** Workflow orchestration is used in production systems (Temporal, AWS Step Functions, Jira, etc.)

2. **Complete on-chain port:** All business logic (authorization, state transitions, deadline enforcement, retry limits) is in the Solana program

3. **Working tests:** Both unit tests for the state machine model and integration tests that deploy to localnet

4. **Practical keeper:** Demonstrates how off-chain services interact with on-chain programs without having special privileges

5. **Clear value proposition:** Shows what you gain by moving this pattern on-chain (trustlessness, immutability, verifiability)

## License

MIT
