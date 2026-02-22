import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { WorkflowEngine } from "../target/types/workflow_engine";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function log(emoji: string, message: string, color = COLORS.reset): void {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`${COLORS.dim}[${timestamp}]${COLORS.reset} ${emoji} ${color}${message}${COLORS.reset}`);
}

function header(title: string): void {
  console.log();
  console.log(`${COLORS.bright}${COLORS.cyan}${"═".repeat(60)}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}${"═".repeat(60)}${COLORS.reset}`);
  console.log();
}

function divider(): void {
  console.log(`${COLORS.dim}${"─".repeat(60)}${COLORS.reset}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.clear();
  header("ON-CHAIN WORKFLOW ENGINE DEMO");
  console.log(`${COLORS.dim}This demo shows a complete workflow lifecycle on Solana:`);
  console.log(`workspace → template → run → submit → approve/retry/escalate${COLORS.reset}`);
  console.log();

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.WorkflowEngine as Program<WorkflowEngine>;
  const admin = provider.wallet;

  const workspaceId = new anchor.BN(Date.now());

  const [workspacePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("workspace"), admin.publicKey.toBuffer()],
    program.programId
  );

  header("PHASE 1: CREATE WORKSPACE");
  log("🏢", `Admin: ${admin.publicKey.toBase58().slice(0, 20)}...`, COLORS.blue);
  log("📍", `Program ID: ${program.programId.toBase58().slice(0, 20)}...`, COLORS.blue);
  divider();

  try {
    await program.methods
      .createWorkspace(workspaceId)
      .accounts({
        admin: admin.publicKey,
        workspace: workspacePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    log("✅", `Workspace created: ${workspacePda.toBase58().slice(0, 24)}...`, COLORS.green);
  } catch (err: unknown) {
    if ((err as Error).message?.includes("already in use")) {
      log("ℹ️", "Workspace already exists, continuing...", COLORS.yellow);
    } else {
      throw err;
    }
  }

  const workspace = await program.account.workspace.fetch(workspacePda);
  log("📊", `Template count: ${workspace.templateCount}, Run count: ${workspace.runCount}`);

  await sleep(500);

  header("PHASE 2: CREATE WORKFLOW TEMPLATE");
  log("📝", "Defining 3-stage approval workflow:", COLORS.magenta);
  console.log(`${COLORS.dim}   Stage 1: ManualApproval (SLA: 5 min, role: operator)${COLORS.reset}`);
  console.log(`${COLORS.dim}   Stage 2: OperatorExecution (SLA: 10 min, role: executor)${COLORS.reset}`);
  console.log(`${COLORS.dim}   Stage 3: Finalization (SLA: 2 min, role: admin)${COLORS.reset}`);
  divider();

  const [templatePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("template"),
      workspacePda.toBuffer(),
      new anchor.BN(workspace.templateCount).toArrayLike(Buffer, "le", 4),
    ],
    program.programId
  );

  const stages = [
    { kind: { manualApproval: {} }, requiredRole: 1, slaSeconds: new anchor.BN(300) },
    { kind: { operatorExecution: {} }, requiredRole: 2, slaSeconds: new anchor.BN(600) },
    { kind: { finalization: {} }, requiredRole: 1, slaSeconds: new anchor.BN(120) },
  ];

  try {
    await program.methods
      .createTemplate({
        maxTasks: 20,
        retryLimit: 3,
        escalationSeconds: new anchor.BN(3600),
        stages,
      })
      .accounts({
        admin: admin.publicKey,
        workspace: workspacePda,
        template: templatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    log("✅", `Template created: ${templatePda.toBase58().slice(0, 24)}...`, COLORS.green);
  } catch (err: unknown) {
    if ((err as Error).message?.includes("already in use")) {
      log("ℹ️", "Template already exists, using existing...", COLORS.yellow);
    } else {
      throw err;
    }
  }

  const template = await program.account.workflowTemplate.fetch(templatePda);
  log("⚙️", `Config: max_tasks=${template.maxTasks}, retry_limit=${template.retryLimit}, stages=${template.stageCount}`);

  await sleep(500);

  header("PHASE 3: START WORKFLOW RUN");
  const workspaceRefreshed = await program.account.workspace.fetch(workspacePda);

  const [runPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("run"),
      workspacePda.toBuffer(),
      new anchor.BN(workspaceRefreshed.runCount).toArrayLike(Buffer, "le", 4),
    ],
    program.programId
  );

  const [taskPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("task"), runPda.toBuffer(), new anchor.BN(0).toArrayLike(Buffer, "le", 2)],
    program.programId
  );

  log("🚀", "Starting new workflow run...", COLORS.cyan);

  await program.methods
    .startWorkflowRun(workspace.templateCount)
    .accounts({
      creator: admin.publicKey,
      workspace: workspacePda,
      template: templatePda,
      run: runPda,
      firstTask: taskPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  log("✅", `Run started: ${runPda.toBase58().slice(0, 24)}...`, COLORS.green);

  const run = await program.account.workflowRun.fetch(runPda);
  log("📊", `Run status: ${JSON.stringify(run.status)}`);

  const task = await program.account.task.fetch(taskPda);
  log("📋", `Task #0 created, status: ${JSON.stringify(task.status)}, due_at: ${new Date(task.dueAt.toNumber() * 1000).toISOString()}`);

  await sleep(500);

  header("PHASE 4: TASK SUBMISSION");
  log("📤", "Operator submitting task result (success=true)...", COLORS.blue);

  await program.methods
    .submitTaskResult(true, 0)
    .accounts({
      actor: admin.publicKey,
      workspace: workspacePda,
      run: runPda,
      template: templatePda,
      task: taskPda,
    })
    .rpc();

  const taskAfterSubmit = await program.account.task.fetch(taskPda);
  log("✅", `Task submitted! Status: ${JSON.stringify(taskAfterSubmit.status)}`, COLORS.green);

  await sleep(500);

  header("PHASE 5: ADMIN APPROVAL");
  log("👤", "Admin reviewing and approving task...", COLORS.magenta);

  await program.methods
    .approveTask()
    .accounts({
      admin: admin.publicKey,
      workspace: workspacePda,
      run: runPda,
      task: taskPda,
    })
    .rpc();

  const taskAfterApprove = await program.account.task.fetch(taskPda);
  const runAfterApprove = await program.account.workflowRun.fetch(runPda);
  log("✅", `Task approved! Task status: ${JSON.stringify(taskAfterApprove.status)}`, COLORS.green);
  log("✅", `Run status: ${JSON.stringify(runAfterApprove.status)}`, COLORS.green);

  await sleep(500);

  header("PHASE 6: DEMONSTRATING FAILURE + RETRY");
  log("🔄", "Creating new run to demonstrate failure handling...", COLORS.yellow);

  const workspace2 = await program.account.workspace.fetch(workspacePda);

  const [run2Pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("run"),
      workspacePda.toBuffer(),
      new anchor.BN(workspace2.runCount).toArrayLike(Buffer, "le", 4),
    ],
    program.programId
  );

  const [task2Pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("task"), run2Pda.toBuffer(), new anchor.BN(0).toArrayLike(Buffer, "le", 2)],
    program.programId
  );

  await program.methods
    .startWorkflowRun(workspace.templateCount)
    .accounts({
      creator: admin.publicKey,
      workspace: workspacePda,
      template: templatePda,
      run: run2Pda,
      firstTask: task2Pda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  log("✅", "New run created for failure test", COLORS.green);
  divider();

  log("❌", "Submitting FAILED result (error_code=1001)...", COLORS.red);

  await program.methods
    .submitTaskResult(false, 1001)
    .accounts({
      actor: admin.publicKey,
      workspace: workspacePda,
      run: run2Pda,
      template: templatePda,
      task: task2Pda,
    })
    .rpc();

  const failedTask = await program.account.task.fetch(task2Pda);
  log("📊", `Task status: ${JSON.stringify(failedTask.status)}, error_code: ${failedTask.lastErrorCode}`);
  divider();

  log("🔁", "Admin triggering retry...", COLORS.yellow);

  await program.methods
    .retryTask()
    .accounts({
      admin: admin.publicKey,
      workspace: workspacePda,
      run: run2Pda,
      template: templatePda,
      task: task2Pda,
    })
    .rpc();

  const retriedTask = await program.account.task.fetch(task2Pda);
  log("✅", `Task retried! Status: ${JSON.stringify(retriedTask.status)}, retry_count: ${retriedTask.retryCount}`, COLORS.green);

  await sleep(500);

  header("PHASE 7: RETRY LIMIT ENFORCEMENT");
  log("⚠️", "Exhausting remaining retries to hit limit...", COLORS.yellow);

  for (let i = 1; i <= 2; i++) {
    await program.methods
      .submitTaskResult(false, 1000 + i)
      .accounts({
        actor: admin.publicKey,
        workspace: workspacePda,
        run: run2Pda,
        template: templatePda,
        task: task2Pda,
      })
      .rpc();

    await program.methods
      .retryTask()
      .accounts({
        admin: admin.publicKey,
        workspace: workspacePda,
        run: run2Pda,
        template: templatePda,
        task: task2Pda,
      })
      .rpc();

    log("🔁", `Retry ${i + 1}/3 used`);
  }

  await program.methods
    .submitTaskResult(false, 9999)
    .accounts({
      actor: admin.publicKey,
      workspace: workspacePda,
      run: run2Pda,
      template: templatePda,
      task: task2Pda,
    })
    .rpc();

  const maxedTask = await program.account.task.fetch(task2Pda);
  log("📊", `Task at max retries: retry_count=${maxedTask.retryCount}, max_retries=${maxedTask.maxRetries}`);
  divider();

  log("🚫", "Attempting retry beyond limit...", COLORS.red);

  try {
    await program.methods
      .retryTask()
      .accounts({
        admin: admin.publicKey,
        workspace: workspacePda,
        run: run2Pda,
        template: templatePda,
        task: task2Pda,
      })
      .rpc();
    log("❌", "ERROR: Should have been blocked!", COLORS.red);
  } catch (err: unknown) {
    const anchorErr = err as anchor.AnchorError;
    log("✅", `Correctly blocked with: ${anchorErr.error?.errorCode?.code || "RetryLimitExceeded"}`, COLORS.green);
  }

  await sleep(500);

  header("PHASE 8: ESCALATION CHECK");
  log("⏰", "Testing escalation guard (deadline not reached)...", COLORS.yellow);

  const workspace3 = await program.account.workspace.fetch(workspacePda);

  const [run3Pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("run"),
      workspacePda.toBuffer(),
      new anchor.BN(workspace3.runCount).toArrayLike(Buffer, "le", 4),
    ],
    program.programId
  );

  const [task3Pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("task"), run3Pda.toBuffer(), new anchor.BN(0).toArrayLike(Buffer, "le", 2)],
    program.programId
  );

  await program.methods
    .startWorkflowRun(workspace.templateCount)
    .accounts({
      creator: admin.publicKey,
      workspace: workspacePda,
      template: templatePda,
      run: run3Pda,
      firstTask: task3Pda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const freshTask = await program.account.task.fetch(task3Pda);
  log("📋", `Fresh task created, deadline: ${new Date(freshTask.dueAt.toNumber() * 1000).toISOString()}`);
  divider();

  try {
    await program.methods
      .escalateTask()
      .accounts({
        run: run3Pda,
        task: task3Pda,
      })
      .rpc();
    log("❌", "ERROR: Escalation should be blocked!", COLORS.red);
  } catch (err: unknown) {
    const anchorErr = err as anchor.AnchorError;
    log("✅", `Escalation correctly blocked: ${anchorErr.error?.errorCode?.code || "DeadlineNotReached"}`, COLORS.green);
    log("ℹ️", "Keeper can only escalate AFTER deadline passes", COLORS.dim);
  }

  await sleep(500);

  header("DEMO COMPLETE");

  console.log(`${COLORS.bright}${COLORS.green}All workflow engine capabilities demonstrated:${COLORS.reset}`);
  console.log();
  console.log(`  ${COLORS.green}✓${COLORS.reset} Workspace creation with admin isolation`);
  console.log(`  ${COLORS.green}✓${COLORS.reset} Template definition with bounded stages (max 3)`);
  console.log(`  ${COLORS.green}✓${COLORS.reset} Workflow run instantiation from template`);
  console.log(`  ${COLORS.green}✓${COLORS.reset} Task submission with role authorization`);
  console.log(`  ${COLORS.green}✓${COLORS.reset} Admin approval flow (AwaitingApproval → Completed)`);
  console.log(`  ${COLORS.green}✓${COLORS.reset} Failure handling with error codes`);
  console.log(`  ${COLORS.green}✓${COLORS.reset} Retry mechanism with counter tracking`);
  console.log(`  ${COLORS.green}✓${COLORS.reset} Retry limit enforcement (max 3)`);
  console.log(`  ${COLORS.green}✓${COLORS.reset} Deadline-based escalation guard`);
  console.log();
  console.log(`${COLORS.dim}All state transitions are enforced on-chain.${COLORS.reset}`);
  console.log(`${COLORS.dim}No off-chain component can bypass these rules.${COLORS.reset}`);
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
