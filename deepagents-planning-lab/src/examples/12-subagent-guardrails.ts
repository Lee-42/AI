import { z } from "zod";

const scopeSchema = z.enum(["api", "data", "security"]);
const decisionSchema = z.enum(["PASS", "BLOCK"]);

const taskContractSchema = z.object({
  taskId: z.string().regex(/^TASK-\d{2}$/),
  agentName: z.string().min(1),
  scope: scopeSchema,
  releaseId: z.string().regex(/^REL-\d{4}-\d{2}$/),
  goal: z.string().min(10),
  acceptanceCriteria: z.array(z.string().min(5)).min(1),
  evidenceRequired: z.literal(true),
  maxOutputChars: z.number().int().min(100).max(500),
  timeoutMs: z.number().int().min(100).max(10_000),
  maxRetries: z.number().int().min(0).max(2)
});

const reviewResultSchema = z.object({
  taskId: z.string(),
  agentName: z.string(),
  scope: scopeSchema,
  decision: decisionSchema,
  summary: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  sourceVersion: z.string().min(1)
});

type TaskContract = z.infer<typeof taskContractSchema>;
type ReviewResult = z.infer<typeof reviewResultSchema>;
type Scope = z.infer<typeof scopeSchema>;

class RetryableWorkerError extends Error {}

type Worker = {
  scope: Scope;
  run: (task: TaskContract) => Promise<ReviewResult>;
};

let securityAttempts = 0;

const workerRegistry: Record<string, Worker> = {
  "api-primary": {
    scope: "api",
    run: async (task) => ({
      taskId: task.taskId,
      agentName: task.agentName,
      scope: "api",
      decision: "PASS",
      summary: "契约测试 128/128 通过。",
      evidenceIds: ["API-CONTRACT-128"],
      sourceVersion: "api-evidence-v3"
    })
  },
  "api-verifier": {
    scope: "api",
    run: async (task) => ({
      taskId: task.taskId,
      agentName: task.agentName,
      scope: "api",
      decision: "BLOCK",
      summary: "移动端仍调用已删除的 v1/profile 字段。",
      evidenceIds: ["API-MOBILE-V1-PROFILE"],
      sourceVersion: "mobile-contract-v7"
    })
  },
  "data-reviewer": {
    scope: "data",
    run: async (task) => ({
      taskId: task.taskId,
      agentName: task.agentName,
      scope: "data",
      decision: "BLOCK",
      summary: "两个旧租户缺少 tenant_id，迁移演练仅通过 48/50。",
      evidenceIds: ["MIGRATION-48-OF-50", "TENANT-ID-MISSING"],
      sourceVersion: "migration-evidence-v5"
    })
  },
  "security-reviewer": {
    scope: "security",
    run: async (task) => {
      securityAttempts += 1;
      if (securityAttempts === 1) {
        throw new RetryableWorkerError("临时证据服务不可用");
      }
      return {
        taskId: task.taskId,
        agentName: task.agentName,
        scope: "security",
        decision: "PASS",
        summary: "高危漏洞扫描为 0，安全门禁满足。",
        evidenceIds: ["SECURITY-HIGH-0"],
        sourceVersion: "security-scan-v9"
      };
    }
  }
};

function validateResult(task: TaskContract, value: unknown): ReviewResult {
  const result = reviewResultSchema.parse(value);
  if (result.taskId !== task.taskId) {
    throw new Error(`RESULT_TASK_MISMATCH:${task.taskId}`);
  }
  if (result.agentName !== task.agentName || result.scope !== task.scope) {
    throw new Error(`RESULT_SCOPE_MISMATCH:${task.taskId}`);
  }
  if (result.summary.length > task.maxOutputChars) {
    throw new Error(`RESULT_TOO_LARGE:${task.taskId}`);
  }
  if (task.evidenceRequired && result.evidenceIds.length === 0) {
    throw new Error(`RESULT_MISSING_EVIDENCE:${task.taskId}`);
  }
  return result;
}

let activeWorkers = 0;
let peakWorkers = 0;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RetryableWorkerError(`TIMEOUT:${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function dispatch(task: TaskContract): Promise<ReviewResult> {
  const worker = workerRegistry[task.agentName];
  if (!worker) throw new Error(`UNKNOWN_SUBAGENT:${task.agentName}`);
  if (worker.scope !== task.scope) {
    throw new Error(`ROUTING_SCOPE_MISMATCH:${task.taskId}`);
  }

  activeWorkers += 1;
  peakWorkers = Math.max(peakWorkers, activeWorkers);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return validateResult(
          task,
          await withTimeout(worker.run(task), task.timeoutMs)
        );
      } catch (error) {
        const canRetry =
          error instanceof RetryableWorkerError && attempt < task.maxRetries;
        if (!canRetry) throw error;
      }
    }
  } finally {
    activeWorkers -= 1;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function consume(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await run(item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => consume()));
  return results;
}

function findConflicts(results: ReviewResult[]): string[] {
  const decisionsByScope = new Map<Scope, Set<string>>();
  for (const result of results) {
    const decisions = decisionsByScope.get(result.scope) ?? new Set<string>();
    decisions.add(result.decision);
    decisionsByScope.set(result.scope, decisions);
  }

  return [...decisionsByScope]
    .filter(([, decisions]) => decisions.size > 1)
    .map(
      ([scope, decisions]) =>
        `${scope}:${[...decisions].sort().join(" vs ")}`
    );
}

function task(
  taskId: string,
  agentName: string,
  scope: Scope,
  goal: string,
  maxRetries = 0
): TaskContract {
  return taskContractSchema.parse({
    taskId,
    agentName,
    scope,
    releaseId: "REL-2026-10",
    goal,
    acceptanceCriteria: ["必须给出 PASS 或 BLOCK，并附证据编号"],
    evidenceRequired: true,
    maxOutputChars: 300,
    timeoutMs: 2_000,
    maxRetries
  });
}

async function main() {
  // 失败模式 1：只有一句含糊目标，没有批次、边界、验收与预算。
  const incompleteHandoff = taskContractSchema.safeParse({
    agentName: "api-primary",
    goal: "帮我看一下 API"
  });
  if (incompleteHandoff.success) {
    throw new Error("不完整交接单意外通过。 ");
  }

  // 失败模式 2：Supervisor 选错专业 Agent，必须在执行前拒绝。
  let wrongRouteRejected = false;
  try {
    await dispatch(
      task("TASK-00", "data-reviewer", "api", "检查 API 契约测试是否满足发布门禁")
    );
  } catch (error) {
    wrongRouteRejected = String(error).includes("ROUTING_SCOPE_MISMATCH");
  }
  if (!wrongRouteRejected) throw new Error("错误路由没有被拒绝。 ");

  // 失败模式 3：结果即使符合基础 Schema，也不能突破当前任务的输出预算。
  const sizeCheckTask = task(
    "TASK-01",
    "api-primary",
    "api",
    "检查 API 契约测试是否满足发布门禁"
  );
  let oversizedResultRejected = false;
  try {
    validateResult(sizeCheckTask, {
      taskId: sizeCheckTask.taskId,
      agentName: sizeCheckTask.agentName,
      scope: sizeCheckTask.scope,
      decision: "PASS",
      summary: "超长原始结果".repeat(100),
      evidenceIds: ["RAW-DUMP"],
      sourceVersion: "raw-v1"
    });
  } catch (error) {
    oversizedResultRejected = String(error).includes("RESULT_TOO_LARGE");
  }
  if (!oversizedResultRejected) throw new Error("超大结果没有被拒绝。 ");

  const tasks = [
    task("TASK-11", "api-primary", "api", "独立检查服务端 API 契约门禁"),
    task("TASK-12", "api-verifier", "api", "独立复核移动端 API 兼容性"),
    task("TASK-13", "data-reviewer", "data", "检查数据迁移演练门禁"),
    task(
      "TASK-14",
      "security-reviewer",
      "security",
      "检查高危漏洞扫描门禁",
      1
    )
  ];

  const concurrencyLimit = 2;
  const results = await mapWithConcurrency(tasks, concurrencyLimit, dispatch);
  const coverage = {
    total: tasks.length,
    completed: results.length,
    failed: tasks.length - results.length
  };
  if (coverage.completed !== coverage.total || coverage.failed !== 0) {
    throw new Error("覆盖账本不完整，不能生成最终结论。 ");
  }
  if (peakWorkers > concurrencyLimit) {
    throw new Error(`并发失控：峰值 ${peakWorkers}，限制 ${concurrencyLimit}`);
  }
  if (securityAttempts !== 2) {
    throw new Error(`有限重试验收失败：实际尝试 ${securityAttempts} 次。`);
  }

  const conflicts = findConflicts(results);
  if (!conflicts.includes("api:BLOCK vs PASS")) {
    throw new Error(`没有识别 API 审查冲突：${conflicts.join(", ")}`);
  }

  // 有冲突时不让模型随意挑一个答案，显式转人工复核。
  const overallDecision =
    conflicts.length > 0
      ? "NEEDS_HUMAN_REVIEW"
      : results.some((result) => result.decision === "BLOCK")
        ? "BLOCK"
        : "PASS";

  console.log("12 Subagent 注意事项与防护实验");
  console.log(`不完整交接单：${incompleteHandoff.success ? "放行" : "拒绝"}`);
  console.log(`错误专业路由：${wrongRouteRejected ? "拒绝" : "放行"}`);
  console.log(`超大返回结果：${oversizedResultRejected ? "拒绝" : "放行"}`);
  console.log(`有界并发峰值：${peakWorkers}/${concurrencyLimit}`);
  console.log(`有限重试次数：${securityAttempts}（首次失败，第二次成功）`);
  console.log(`覆盖进度：${coverage.completed}/${coverage.total}`);
  console.log(`检测到的冲突：${conflicts.join(", ")}`);
  console.log(`整体结论：${overallDecision}`);
  console.log("模型 API 调用：0（离线控制平面实验）");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
