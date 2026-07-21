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

type ReviewRequest = {
  question: string;
  action: string;
};

const ApprovalState = new StateSchema({
  action: z.string(),
  approved: z.boolean().nullable().default(null),
  result: z.string().default("")
});

let reviewNodeRuns = 0;
let actionRuns = 0;

const reviewAction: typeof ApprovalState.Node = (state) => {
  // 这个计数只为演示 Node 重入，不能替换成真实业务副作用。
  reviewNodeRuns += 1;
  console.log(`[review] 第 ${reviewNodeRuns} 次进入 Node`);

  const approved = interrupt<ReviewRequest, boolean>({
    question: "是否执行这个操作？",
    action: state.action
  });

  return { approved };
};

const executeAction: typeof ApprovalState.Node = (state) => {
  if (!state.approved) {
    return { result: "操作已取消" };
  }

  actionRuns += 1;
  console.log(`[execute] 第 ${actionRuns} 次执行模拟发送`);
  return { result: `${state.action}：执行成功` };
};

const graph = new StateGraph(ApprovalState)
  .addNode("review", reviewAction)
  .addNode("execute", executeAction)
  .addEdge(START, "review")
  .addEdge("review", "execute")
  .addEdge("execute", END)
  .compile({ checkpointer: new MemorySaver() });

async function main() {
  const config = {
    configurable: { thread_id: "interrupt-rules-001" }
  };

  console.log("## 第一次 invoke");
  const pausedState = await graph.invoke(
    { action: "发送项目周报" },
    config
  );

  assert.equal(isInterrupted<ReviewRequest>(pausedState), true);
  if (!isInterrupted<ReviewRequest>(pausedState)) {
    throw new Error("Graph 没有按预期暂停");
  }

  console.log("[caller] Graph 已暂停：", pausedState[INTERRUPT][0]?.value);
  assert.equal(reviewNodeRuns, 1);
  assert.equal(actionRuns, 0);

  console.log("\n## 使用 Command({ resume: true }) 恢复");
  const finalState = await graph.invoke(
    new Command({ resume: true }),
    config
  );

  assert.equal(reviewNodeRuns, 2);
  assert.equal(actionRuns, 1);
  assert.equal(finalState.result, "发送项目周报：执行成功");

  console.log("[caller] 最终结果：", finalState.result);
  console.log(`\nreview Node 进入 ${reviewNodeRuns} 次`);
  console.log(`模拟发送只执行 ${actionRuns} 次`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
