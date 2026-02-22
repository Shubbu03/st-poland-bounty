import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { WorkflowEngine } from "../target/types/workflow_engine";

type KeeperState = {
  processedEscalations: Record<string, number>;
  lastRunAt: number;
};

type PendingTask = {
  runPda: anchor.web3.PublicKey;
  taskPda: anchor.web3.PublicKey;
  taskIndex: number;
  dueAt: number;
  status: string;
};

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(level: "info" | "warn" | "error" | "success", message: string): void {
  const timestamp = new Date().toISOString();
  const colors = {
    info: COLORS.cyan,
    warn: COLORS.yellow,
    error: COLORS.red,
    success: COLORS.green,
  };
  console.log(`${COLORS.dim}[${timestamp}]${COLORS.reset} ${colors[level]}[KEEPER]${COLORS.reset} ${message}`);
}

function loadState(statePath: string): KeeperState {
  if (!existsSync(statePath)) {
    return { processedEscalations: {}, lastRunAt: 0 };
  }
  return JSON.parse(readFileSync(statePath, "utf8")) as KeeperState;
}

function saveState(statePath: string, state: KeeperState): void {
  const parent = dirname(statePath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function escalationKey(runPda: anchor.web3.PublicKey, taskPda: anchor.web3.PublicKey): string {
  return `${runPda.toBase58()}:${taskPda.toBase58()}`;
}

async function fetchPendingTasks(
  program: Program<WorkflowEngine>,
  workspacePda: anchor.web3.PublicKey
): Promise<PendingTask[]> {
  const pendingTasks: PendingTask[] = [];

  const allRuns = await program.account.workflowRun.all([
    {
      memcmp: {
        offset: 8,
        bytes: workspacePda.toBase58(),
      },
    },
  ]);

  for (const runAccount of allRuns) {
    const run = runAccount.account;
    const runPda = runAccount.publicKey;

    if ("completed" in run.status || "closed" in run.status) {
      continue;
    }

    const allTasks = await program.account.task.all([
      {
        memcmp: {
          offset: 8 + 32,
          bytes: runPda.toBase58(),
        },
      },
    ]);

    for (const taskAccount of allTasks) {
      const task = taskAccount.account;

      if ("completed" in task.status || "escalated" in task.status) {
        continue;
      }

      const statusKey = Object.keys(task.status)[0];

      pendingTasks.push({
        runPda,
        taskPda: taskAccount.publicKey,
        taskIndex: task.taskIndex,
        dueAt: task.dueAt.toNumber(),
        status: statusKey,
      });
    }
  }

  return pendingTasks;
}

async function runKeeperCycle(dryRun: boolean): Promise<void> {
  log("info", `Starting keeper cycle (dry_run=${dryRun})`);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.WorkflowEngine as Program<WorkflowEngine>;
  const admin = provider.wallet;

  const [workspacePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("workspace"), admin.publicKey.toBuffer()],
    program.programId
  );

  const nowUnix = Math.floor(Date.now() / 1000);
  const statePath = resolve(process.cwd(), ".keeper/state.json");
  const state = loadState(statePath);

  log("info", `Workspace: ${workspacePda.toBase58().slice(0, 20)}...`);
  log("info", `Current time: ${new Date(nowUnix * 1000).toISOString()}`);

  let pendingTasks: PendingTask[];

  try {
    pendingTasks = await fetchPendingTasks(program, workspacePda);
  } catch (err) {
    log("warn", "Could not fetch on-chain tasks, using seed data for demo");
    pendingTasks = generateSeedTasks(nowUnix);
  }

  log("info", `Found ${pendingTasks.length} pending task(s)`);

  let escalationCount = 0;

  for (const task of pendingTasks) {
    const key = escalationKey(task.runPda, task.taskPda);

    if (state.processedEscalations[key] !== undefined) {
      log("info", `Task ${task.taskPda.toBase58().slice(0, 12)}... already processed, skipping`);
      continue;
    }

    if (nowUnix <= task.dueAt) {
      const remaining = task.dueAt - nowUnix;
      log("info", `Task ${task.taskPda.toBase58().slice(0, 12)}... deadline in ${remaining}s, skipping`);
      continue;
    }

    log("warn", `Task ${task.taskPda.toBase58().slice(0, 12)}... OVERDUE by ${nowUnix - task.dueAt}s`);

    if (dryRun) {
      log("info", `[DRY RUN] Would escalate task ${task.taskPda.toBase58().slice(0, 12)}...`);
      state.processedEscalations[key] = nowUnix;
      escalationCount++;
      continue;
    }

    try {
      const tx = await program.methods
        .escalateTask()
        .accounts({
          run: task.runPda,
          task: task.taskPda,
        })
        .rpc();

      log("success", `Escalated task ${task.taskPda.toBase58().slice(0, 12)}... tx: ${tx.slice(0, 20)}...`);
      state.processedEscalations[key] = nowUnix;
      escalationCount++;
    } catch (err: unknown) {
      const errMsg = (err as Error).message || String(err);
      if (errMsg.includes("DeadlineNotReached")) {
        log("info", `Clock drift - deadline not reached on-chain yet`);
      } else if (errMsg.includes("InvalidTransition")) {
        log("info", `Task already transitioned, marking as processed`);
        state.processedEscalations[key] = nowUnix;
      } else {
        log("error", `Failed to escalate: ${errMsg}`);
      }
    }
  }

  state.lastRunAt = nowUnix;
  saveState(statePath, state);

  log("info", `Cycle complete. Escalations this run: ${escalationCount}`);
  log("info", `Total processed escalations: ${Object.keys(state.processedEscalations).length}`);
}

function generateSeedTasks(nowUnix: number): PendingTask[] {
  return [
    {
      runPda: anchor.web3.Keypair.generate().publicKey,
      taskPda: anchor.web3.Keypair.generate().publicKey,
      taskIndex: 0,
      dueAt: nowUnix - 120,
      status: "inProgress",
    },
    {
      runPda: anchor.web3.Keypair.generate().publicKey,
      taskPda: anchor.web3.Keypair.generate().publicKey,
      taskIndex: 1,
      dueAt: nowUnix - 60,
      status: "awaitingApproval",
    },
    {
      runPda: anchor.web3.Keypair.generate().publicKey,
      taskPda: anchor.web3.Keypair.generate().publicKey,
      taskIndex: 2,
      dueAt: nowUnix + 300,
      status: "inProgress",
    },
  ];
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || args.includes("-d") || !args.includes("--live");

console.log();
console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║           WORKFLOW ENGINE KEEPER SERVICE                   ║");
console.log("║                                                            ║");
console.log("║  The keeper monitors tasks and escalates overdue items.    ║");
console.log("║  It enforces SLA deadlines by calling escalate_task.       ║");
console.log("║                                                            ║");
console.log("║  IMPORTANT: The keeper has NO special privileges.          ║");
console.log("║  All rules are enforced on-chain - keeper is just a        ║");
console.log("║  trigger mechanism, not a trusted authority.               ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log();

if (dryRun) {
  console.log(`${COLORS.yellow}Running in DRY RUN mode. Use --live to execute real transactions.${COLORS.reset}`);
  console.log();
}

runKeeperCycle(dryRun)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
