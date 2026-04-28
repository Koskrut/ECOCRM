export const WORKFLOW_EVALUATOR_TIMEOUT_MS = 1000;
export const WORKFLOW_ACTION_TIMEOUT_MS = 30000;
export const WORKFLOW_TOTAL_RULE_TIMEOUT_MS = 60000;

export type WorkflowTimeoutWhere = "evaluator" | `action_${number}` | "total";

export class WorkflowTimeoutError extends Error {
  constructor(readonly where: WorkflowTimeoutWhere) {
    super("timeout_exceeded");
    this.name = "WorkflowTimeoutError";
  }
}

export async function withWorkflowTimeout<T>(
  where: WorkflowTimeoutWhere,
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T> | T,
): Promise<T> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new WorkflowTimeoutError(where));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(fn(controller.signal)), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
