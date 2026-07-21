import assert from "node:assert/strict";
import {
  Command,
  END,
  INTERRUPT,
  MemorySaver,
  START,
  StateGraph,
  StateSchema,
  interrupt,
  isInterrupted
} from "@langchain/langgraph";
import { z } from "zod";

type ApprovalRequest = {
  kind: "email_approval";
  question: string;
  draft: string;
};

type ApprovalDecision = {
  approved: boolean;
  feedback: string;
};

type PendingReview = {
  status: "waiting_review";
  threadId: string;
  review: ApprovalRequest;
};

const ReviewState = new StateSchema({
  request: z.string(),
  draft: z.string().default(""),
  approved: z.boolean().nullable().default(null),
  feedback: z.string().default(""),
  result: z.string().default("")
});

const writeDraft: typeof ReviewState.Node = (state) => {
  const draft = `主题：${state.request}\n正文：项目周报已经整理完毕。`;
  console.log("[AI] 已生成邮件草稿");
  return { draft };
};

const waitForApproval: typeof ReviewState.Node = (state) => {
  const decision = interrupt<ApprovalRequest, ApprovalDecision>({
    kind: "email_approval",
    question: "是否发送这封邮件？",
    draft: state.draft
  });

  return {
    approved: decision.approved,
    feedback: decision.feedback
  };
};

const applyDecision: typeof ReviewState.Node = (state) => ({
  result: state.approved
    ? `已批准，模拟发送成功：${state.draft}`
    : `已拒绝：${state.feedback}`
});

const graph = new StateGraph(ReviewState)
  .addNode("write_draft", writeDraft)
  .addNode("wait_for_approval", waitForApproval)
  .addNode("apply_decision", applyDecision)
  .addEdge(START, "write_draft")
  .addEdge("write_draft", "wait_for_approval")
  .addEdge("wait_for_approval", "apply_decision")
  .addEdge("apply_decision", END)
  .compile({ checkpointer: new MemorySaver() });

function configFor(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

async function backendStartReview(
  threadId: string,
  request: string
): Promise<PendingReview> {
  console.log(`[后台] graph.invoke(input)，thread_id=${threadId}`);
  const pausedState = await graph.invoke({ request }, configFor(threadId));

  if (!isInterrupted<ApprovalRequest>(pausedState)) {
    throw new Error("Graph 没有在审核节点暂停");
  }

  const review = pausedState[INTERRUPT][0]?.value;
  if (!review) {
    throw new Error("没有读取到 interrupt payload");
  }

  console.log("[后台] 收到 __interrupt__，向前端返回 waiting_review");
  return { status: "waiting_review", threadId, review };
}

function frontendReview(
  pending: PendingReview,
  approved: boolean
): ApprovalDecision {
  console.log(`[前端] 展示审核卡片：${pending.review.question}`);
  console.log(`[前端] 用户选择：${approved ? "批准" : "拒绝"}`);

  return {
    approved,
    feedback: approved ? "同意发送" : "请先补充收件人"
  };
}

async function backendResumeReview(
  threadId: string,
  decision: ApprovalDecision
): Promise<typeof ReviewState.State> {
  console.log(`[后台] Command({ resume })，继续 thread_id=${threadId}`);
  return graph.invoke(
    new Command({ resume: decision }),
    configFor(threadId)
  );
}

async function main() {
  const approved = !process.argv.includes("--reject");
  const threadId = `email-review-${approved ? "approve" : "reject"}`;

  console.log("[前端] 请求后台生成并审核邮件");
  const pending = await backendStartReview(threadId, "发送本周项目进展");

  const decision = frontendReview(pending, approved);
  console.log("[前端] 将审核决定提交给后台");
  const finalState = await backendResumeReview(pending.threadId, decision);

  assert.equal(finalState.approved, approved);
  assert.equal(finalState.result.startsWith(approved ? "已批准" : "已拒绝"), true);

  console.log(`[AI] ${finalState.result}`);
  console.log("[后台] 返回 completed");
  console.log("[前端] 展示最终结果");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
