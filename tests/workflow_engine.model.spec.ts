import { expect } from "chai";

import { approveTask, escalateTask, retryTask, submitTaskResult, TaskModel } from "./helpers/workflow-model";

function baseTask(overrides?: Partial<TaskModel>): TaskModel {
  return {
    status: "in_progress",
    retryCount: 0,
    maxRetries: 3,
    dueAt: 1_800_000_000,
    ...overrides
  };
}

describe("workflow_engine state model", () => {
  it("blocks unauthorized submit attempts", () => {
    expect(() => submitTaskResult(baseTask(), "keeper", 1_700_000_000, true)).to.throw("unauthorized");
  });

  it("blocks stale submission after deadline", () => {
    expect(() => submitTaskResult(baseTask(), "operator", 1_900_000_000, true)).to.throw("deadline_passed");
  });

  it("prevents retry past max limit", () => {
    expect(() =>
      retryTask(
        baseTask({
          status: "failed",
          retryCount: 3
        }),
        "admin",
        1_700_000_000,
        1_700_000_100
      )
    ).to.throw("retry_limit_exceeded");
  });

  it("prevents double-approval/double-completion path", () => {
    const approved = approveTask(baseTask({ status: "awaiting_approval" }), "admin");
    expect(approved.status).to.equal("completed");
    expect(() => approveTask(approved, "admin")).to.throw("invalid_transition");
  });

  it("escalates only after deadline and stays idempotent on second call", () => {
    const escalated = escalateTask(baseTask(), "keeper", 1_900_000_000);
    expect(escalated.status).to.equal("escalated");
    expect(() => escalateTask(escalated, "keeper", 1_900_000_001)).to.throw("invalid_transition");
  });
});
