export type ActorRole = "admin" | "operator" | "creator" | "keeper";

export type TaskStatus =
  | "in_progress"
  | "awaiting_approval"
  | "failed"
  | "escalated"
  | "completed";

export type TaskModel = {
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  dueAt: number;
};

export function submitTaskResult(
  task: TaskModel,
  actorRole: ActorRole,
  nowUnix: number,
  success: boolean
): TaskModel {
  if (actorRole !== "operator" && actorRole !== "creator" && actorRole !== "admin") {
    throw new Error("unauthorized");
  }
  if (nowUnix > task.dueAt) {
    throw new Error("deadline_passed");
  }
  if (task.status !== "in_progress" && task.status !== "failed") {
    throw new Error("invalid_transition");
  }
  return {
    ...task,
    status: success ? "awaiting_approval" : "failed"
  };
}

export function approveTask(task: TaskModel, actorRole: ActorRole): TaskModel {
  if (actorRole !== "admin") {
    throw new Error("unauthorized");
  }
  if (task.status !== "awaiting_approval") {
    throw new Error("invalid_transition");
  }
  return { ...task, status: "completed" };
}

export function retryTask(task: TaskModel, actorRole: ActorRole, nowUnix: number, newDueAt: number): TaskModel {
  if (actorRole !== "admin") {
    throw new Error("unauthorized");
  }
  if (task.status !== "failed") {
    throw new Error("invalid_transition");
  }
  if (task.retryCount >= task.maxRetries) {
    throw new Error("retry_limit_exceeded");
  }
  if (newDueAt <= nowUnix) {
    throw new Error("invalid_due_at");
  }
  return {
    ...task,
    retryCount: task.retryCount + 1,
    dueAt: newDueAt,
    status: "in_progress"
  };
}

export function escalateTask(task: TaskModel, actorRole: ActorRole, nowUnix: number): TaskModel {
  if (actorRole !== "keeper" && actorRole !== "admin") {
    throw new Error("unauthorized");
  }
  if (nowUnix <= task.dueAt) {
    throw new Error("deadline_not_reached");
  }
  if (task.status === "completed" || task.status === "escalated") {
    throw new Error("invalid_transition");
  }
  return {
    ...task,
    status: "escalated"
  };
}
