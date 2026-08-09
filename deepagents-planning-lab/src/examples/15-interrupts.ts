import {
  Annotation,
  Command,
  END,
  INTERRUPT,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  isInterrupted
} from "@langchain/langgraph";
import { createDeepAgent } from "deepagents";
import { FakeToolCallingModel, tool } from "langchain";
import { z } from "zod";

type Approval = {
  approved: boolean;
  reviewer: string;
};

const ReleaseState = Annotation.Root({
  releaseId: Annotation<string>(),
  approved: Annotation<boolean>(),
  executed: Annotation<boolean>(),
  audit: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => []
  })
});

let graphReviewNodeRuns = 0;
let deploymentExecutions = 0;

const getGraphReviewNodeRuns = () => graphReviewNodeRuns;
const getDeploymentExecutions = () => deploymentExecutions;

const releaseGraph = new StateGraph(ReleaseState)
  .addNode("business_review", (state) => {
    graphReviewNodeRuns += 1;

    // Graph 中断可放在任意节点、任意条件分支，不要求附近存在 Tool。
    const decision = interrupt({
      kind: "release_approval",
      releaseId: state.releaseId,
      question: `是否批准发布 ${state.releaseId}？`
    }) as Approval;

    return {
      approved: decision.approved,
      audit: [`${decision.reviewer}:${decision.approved ? "APPROVE" : "REJECT"}`]
    };
  })
  .addNode("deploy", (state) => {
    // interrupt() 恢复时会从节点开头重放，所以副作用放在中断之后的独立节点。
    if (state.approved) deploymentExecutions += 1;
    return {
      executed: state.approved,
      audit: [state.approved ? "DEPLOYED" : "SKIPPED"]
    };
  })
  .addEdge(START, "business_review")
  .addEdge("business_review", "deploy")
  .addEdge("deploy", END)
  .compile({ checkpointer: new MemorySaver() });

type InterruptValue = {
  actionRequests: Array<{
    name: string;
    args: Record<string, unknown>;
    description: string;
  }>;
  reviewConfigs: Array<{
    actionName: string;
    allowedDecisions: string[];
  }>;
};

let emailExecutions = 0;
let deliveredTo = "";

const getEmailExecutions = () => emailExecutions;

const sendReleaseEmail = tool(
  async ({ to, subject, body }) => {
    emailExecutions += 1;
    deliveredTo = to;
    return JSON.stringify({ delivered: true, to, subject, body });
  },
  {
    name: "send_release_email",
    description: "向指定收件人发送发布通知；该操作会产生外部副作用。",
    schema: z.object({
      to: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1)
    })
  }
);

const agentModel = new FakeToolCallingModel({
  toolCalls: [
    [
      {
        name: "send_release_email",
        args: {
          to: "all@example.com",
          subject: "REL-2026-12 发布通知",
          body: "发布已准备完成。"
        },
        id: "send-release-email"
      }
    ],
    []
  ]
});

const releaseAgent = createDeepAgent({
  name: "release-communication-agent",
  model: agentModel,
  tools: [sendReleaseEmail],
  checkpointer: new MemorySaver(),
  // Deep Agent 的高层策略：只拦截指定 Tool，并约束人工可以怎样处理。
  interruptOn: {
    send_release_email: {
      allowedDecisions: ["approve", "edit", "reject"]
    }
  }
});

function getFirstInterruptValue(result: unknown): unknown {
  if (!isInterrupted(result)) throw new Error("预期流程暂停，但没有收到中断。 ");
  return result[INTERRUPT][0]?.value;
}

async function runGraphInterruptDemo() {
  const config = { configurable: { thread_id: "lesson-15-graph" } };
  const paused = await releaseGraph.invoke(
    { releaseId: "REL-2026-12", approved: false, executed: false },
    config
  );

  const request = getFirstInterruptValue(paused) as {
    kind: string;
    releaseId: string;
    question: string;
  };
  if (request.kind !== "release_approval" || getDeploymentExecutions() !== 0) {
    throw new Error("Graph 中断没有在部署副作用之前暂停。 ");
  }

  const resumed = await releaseGraph.invoke(
    new Command({
      resume: { approved: true, reviewer: "release-manager" } satisfies Approval
    }),
    config
  );

  if (
    !resumed.executed ||
    getDeploymentExecutions() !== 1 ||
    getGraphReviewNodeRuns() !== 2
  ) {
    throw new Error("Graph 恢复语义验证失败。 ");
  }

  return { request, resumed };
}

async function runDeepAgentInterruptDemo() {
  const config = { configurable: { thread_id: "lesson-15-deep-agent" } };
  const paused = await releaseAgent.invoke(
    {
      messages: [
        {
          role: "user",
          content: "发送 REL-2026-12 发布通知。"
        }
      ]
    },
    config
  );

  const request = getFirstInterruptValue(paused) as InterruptValue;
  const action = request.actionRequests[0];
  const review = request.reviewConfigs[0];
  if (
    action?.name !== "send_release_email" ||
    review?.actionName !== "send_release_email" ||
    getEmailExecutions() !== 0
  ) {
    throw new Error("Deep Agent 没有在敏感 Tool 执行前暂停。 ");
  }

  // 人工不接受模型给出的群发地址，使用 edit 修改 Tool 参数后恢复。
  const resumed = await releaseAgent.invoke(
    new Command({
      resume: {
        decisions: [
          {
            type: "edit",
            editedAction: {
              name: "send_release_email",
              args: {
                ...action.args,
                to: "release-owners@example.com"
              }
            }
          }
        ]
      }
    }),
    config
  );

  if (
    isInterrupted(resumed) ||
    getEmailExecutions() !== 1 ||
    deliveredTo !== "release-owners@example.com"
  ) {
    throw new Error("Deep Agent 编辑参数后恢复执行失败。 ");
  }

  return { action, review };
}

async function main() {
  const graph = await runGraphInterruptDemo();
  const agent = await runDeepAgentInterruptDemo();

  console.log("15 Deep Agent 与 LangGraph 中断差异实验\n");
  console.log("LangGraph：业务节点级中断");
  console.log(`- 中断类型：${graph.request.kind}`);
  console.log(`- 中断问题：${graph.request.question}`);
  console.log(`- Review 节点运行次数：${graphReviewNodeRuns}（恢复时节点从头重放）`);
  console.log(`- 部署副作用次数：${deploymentExecutions}`);
  console.log(`- 最终状态：${graph.resumed.executed ? "DEPLOYED" : "SKIPPED"}`);

  console.log("\nDeep Agent：敏感 Tool 调用级中断");
  console.log(`- 待审 Tool：${agent.action.name}`);
  console.log(`- 模型原收件人：${String(agent.action.args.to)}`);
  console.log(`- 可选决策：${agent.review.allowedDecisions.join(" / ")}`);
  console.log(`- 人工编辑后收件人：${deliveredTo}`);
  console.log(`- Tool 副作用次数：${emailExecutions}`);

  console.log("\n共同底座：MemorySaver + thread_id + Command({ resume })");
  console.log("模型 API 调用：0（使用 FakeToolCallingModel）");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
