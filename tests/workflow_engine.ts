import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { WorkflowEngine } from "../target/types/workflow_engine";

describe("workflow_engine integration tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.WorkflowEngine as Program<WorkflowEngine>;
  const admin = provider.wallet;

  let workspacePda: anchor.web3.PublicKey;
  let workspaceBump: number;
  let templatePda: anchor.web3.PublicKey;
  let runPda: anchor.web3.PublicKey;
  let taskPda: anchor.web3.PublicKey;

  const workspaceId = new anchor.BN(Date.now());

  before(async () => {
    [workspacePda, workspaceBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("workspace"), admin.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("workspace management", () => {
    it("creates a workspace", async () => {
      const tx = await program.methods
        .createWorkspace(workspaceId)
        .accounts({
          admin: admin.publicKey,
          workspace: workspacePda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const workspace = await program.account.workspace.fetch(workspacePda);
      expect(workspace.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(workspace.workspaceId.toNumber()).to.equal(workspaceId.toNumber());
      expect(workspace.templateCount).to.equal(0);
      expect(workspace.runCount).to.equal(0);

      console.log("  ✓ Workspace created:", workspacePda.toBase58().slice(0, 16) + "...");
    });
  });

  describe("template management", () => {
    it("creates a workflow template with 3 stages", async () => {
      [templatePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("template"),
          workspacePda.toBuffer(),
          new anchor.BN(0).toArrayLike(Buffer, "le", 4),
        ],
        program.programId
      );

      const stages = [
        { kind: { manualApproval: {} }, requiredRole: 1, slaSeconds: new anchor.BN(300) },
        { kind: { operatorExecution: {} }, requiredRole: 2, slaSeconds: new anchor.BN(600) },
        { kind: { finalization: {} }, requiredRole: 1, slaSeconds: new anchor.BN(120) },
      ];

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

      const template = await program.account.workflowTemplate.fetch(templatePda);
      expect(template.stageCount).to.equal(3);
      expect(template.maxTasks).to.equal(20);
      expect(template.retryLimit).to.equal(3);

      console.log("  ✓ Template created with 3 stages, retry_limit=3");
    });

    it("rejects template with > 3 retries", async () => {
      const [badTemplatePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("template"),
          workspacePda.toBuffer(),
          new anchor.BN(1).toArrayLike(Buffer, "le", 4),
        ],
        program.programId
      );

      try {
        await program.methods
          .createTemplate({
            maxTasks: 10,
            retryLimit: 5,
            escalationSeconds: new anchor.BN(3600),
            stages: [{ kind: { manualApproval: {} }, requiredRole: 1, slaSeconds: new anchor.BN(300) }],
          })
          .accounts({
            admin: admin.publicKey,
            workspace: workspacePda,
            template: badTemplatePda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have rejected retry_limit > 3");
      } catch (err: unknown) {
        const anchorErr = err as anchor.AnchorError;
        expect(anchorErr.error.errorCode.code).to.equal("InvalidTemplate");
        console.log("  ✓ Correctly rejected invalid retry_limit=5");
      }
    });
  });

  describe("workflow run lifecycle", () => {
    it("starts a workflow run and creates first task", async () => {
      const workspace = await program.account.workspace.fetch(workspacePda);

      [runPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("run"),
          workspacePda.toBuffer(),
          new anchor.BN(workspace.runCount).toArrayLike(Buffer, "le", 4),
        ],
        program.programId
      );

      [taskPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("task"), runPda.toBuffer(), new anchor.BN(0).toArrayLike(Buffer, "le", 2)],
        program.programId
      );

      await program.methods
        .startWorkflowRun(0)
        .accounts({
          creator: admin.publicKey,
          workspace: workspacePda,
          template: templatePda,
          run: runPda,
          firstTask: taskPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const run = await program.account.workflowRun.fetch(runPda);
      expect(run.status).to.deep.equal({ active: {} });

      const task = await program.account.task.fetch(taskPda);
      expect(task.status).to.deep.equal({ inProgress: {} });
      expect(task.retryCount).to.equal(0);

      console.log("  ✓ Run started, task#0 status=InProgress");
    });

    it("submits task result successfully -> awaiting_approval", async () => {
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

      const task = await program.account.task.fetch(taskPda);
      expect(task.status).to.deep.equal({ awaitingApproval: {} });

      console.log("  ✓ Task submitted, status=AwaitingApproval");
    });

    it("admin approves task -> completed", async () => {
      await program.methods
        .approveTask()
        .accounts({
          admin: admin.publicKey,
          workspace: workspacePda,
          run: runPda,
          task: taskPda,
        })
        .rpc();

      const task = await program.account.task.fetch(taskPda);
      expect(task.status).to.deep.equal({ completed: {} });

      const run = await program.account.workflowRun.fetch(runPda);
      expect(run.status).to.deep.equal({ completed: {} });

      console.log("  ✓ Task approved, status=Completed, run=Completed");
    });
  });

  describe("failure and retry flow", () => {
    let run2Pda: anchor.web3.PublicKey;
    let task2Pda: anchor.web3.PublicKey;

    it("creates second run for failure testing", async () => {
      const workspace = await program.account.workspace.fetch(workspacePda);

      [run2Pda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("run"),
          workspacePda.toBuffer(),
          new anchor.BN(workspace.runCount).toArrayLike(Buffer, "le", 4),
        ],
        program.programId
      );

      [task2Pda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("task"), run2Pda.toBuffer(), new anchor.BN(0).toArrayLike(Buffer, "le", 2)],
        program.programId
      );

      await program.methods
        .startWorkflowRun(0)
        .accounts({
          creator: admin.publicKey,
          workspace: workspacePda,
          template: templatePda,
          run: run2Pda,
          firstTask: task2Pda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("  ✓ Second run created for failure test");
    });

    it("submits failed result -> status=Failed", async () => {
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

      const task = await program.account.task.fetch(task2Pda);
      expect(task.status).to.deep.equal({ failed: {} });
      expect(task.lastErrorCode).to.equal(1001);

      console.log("  ✓ Task failed with error_code=1001");
    });

    it("admin retries failed task -> back to InProgress", async () => {
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

      const task = await program.account.task.fetch(task2Pda);
      expect(task.status).to.deep.equal({ inProgress: {} });
      expect(task.retryCount).to.equal(1);

      console.log("  ✓ Task retried, retry_count=1, status=InProgress");
    });

    it("exhausts all retries then blocks further retry", async () => {
      for (let i = 0; i < 2; i++) {
        await program.methods
          .submitTaskResult(false, 1002 + i)
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

      const task = await program.account.task.fetch(task2Pda);
      expect(task.retryCount).to.equal(3);
      expect(task.status).to.deep.equal({ failed: {} });

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
        expect.fail("Should have blocked retry at limit");
      } catch (err: unknown) {
        const anchorErr = err as anchor.AnchorError;
        expect(anchorErr.error.errorCode.code).to.equal("RetryLimitExceeded");
        console.log("  ✓ Retry blocked at max_retries=3");
      }
    });
  });

  describe("escalation flow", () => {
    it("escalate_task fails if deadline not reached", async () => {
      const workspace = await program.account.workspace.fetch(workspacePda);

      const [run3Pda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("run"),
          workspacePda.toBuffer(),
          new anchor.BN(workspace.runCount).toArrayLike(Buffer, "le", 4),
        ],
        program.programId
      );

      const [task3Pda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("task"), run3Pda.toBuffer(), new anchor.BN(0).toArrayLike(Buffer, "le", 2)],
        program.programId
      );

      await program.methods
        .startWorkflowRun(0)
        .accounts({
          creator: admin.publicKey,
          workspace: workspacePda,
          template: templatePda,
          run: run3Pda,
          firstTask: task3Pda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .escalateTask()
          .accounts({
            run: run3Pda,
            task: task3Pda,
          })
          .rpc();
        expect.fail("Should fail - deadline not reached");
      } catch (err: unknown) {
        const anchorErr = err as anchor.AnchorError;
        expect(anchorErr.error.errorCode.code).to.equal("DeadlineNotReached");
        console.log("  ✓ Escalation correctly blocked before deadline");
      }
    });
  });

  describe("authorization checks", () => {
    it("non-admin cannot approve tasks", async () => {
      const workspace = await program.account.workspace.fetch(workspacePda);
      const randomUser = anchor.web3.Keypair.generate();

      const sig = await provider.connection.requestAirdrop(
        randomUser.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const [randomWorkspace] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("workspace"), randomUser.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .approveTask()
          .accounts({
            admin: randomUser.publicKey,
            workspace: randomWorkspace,
            run: runPda,
            task: taskPda,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Random user should not approve");
      } catch {
        console.log("  ✓ Non-admin correctly blocked from approving");
      }
    });
  });

  describe("close run", () => {
    it("admin can close a completed run", async () => {
      await program.methods
        .closeRun()
        .accounts({
          actor: admin.publicKey,
          workspace: workspacePda,
          run: runPda,
        })
        .rpc();

      const run = await program.account.workflowRun.fetch(runPda);
      expect(run.status).to.deep.equal({ closed: {} });
      expect(run.closedAt.toNumber()).to.be.greaterThan(0);

      console.log("  ✓ Run closed successfully");
    });
  });
});
