import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { createAgent, fakeModel, tool, type ToolRuntime } from "langchain";
import { z } from "zod";

const stateSchema = z.object({
  userProfile: z.object({
    userId: z.string(),
    name: z.string(),
    level: z.enum(["beginner", "intermediate", "advanced"])
  }),
  recentTopics: z.array(z.string()).default([])
});

const contextSchema = z.object({
  requestId: z.string(),
  tenantId: z.string(),
  authToken: z.string()
});

type ToolState = z.infer<typeof stateSchema> & {
  messages: BaseMessage[];
};

type ToolContext = z.infer<typeof contextSchema>;

const recommendLearningPlan = tool(
  async ({ topic }, runtime: ToolRuntime<ToolState, ToolContext>) => {
    const canAccessMemberContent = runtime.context.authToken.startsWith("course-token-");

    return JSON.stringify(
      {
        fromToolArgs: {
          topic
        },
        fromRuntimeContext: {
          requestId: runtime.context.requestId,
          tenantId: runtime.context.tenantId,
          canAccessMemberContent
        },
        fromRuntimeState: {
          userId: runtime.state.userProfile.userId,
          name: runtime.state.userProfile.name,
          level: runtime.state.userProfile.level,
          recentTopics: runtime.state.recentTopics,
          messageCount: runtime.state.messages.length
        },
        toolCallId: runtime.toolCallId
      },
      null,
      2
    );
  },
  {
    name: "recommend_learning_plan",
    description: "根据学习主题、用户状态和运行时上下文，生成学习建议。",
    schema: z.object({
      topic: z.string().describe("用户当前想学习的主题")
    })
  }
);

function printMessage(message: BaseMessage, index: number) {
  console.log(`\n${index + 1}. ${message.constructor.name} (${message.type})`);
  console.log(typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2));

  if (AIMessage.isInstance(message) && message.tool_calls?.length) {
    console.log("tool_calls:");
    console.log(JSON.stringify(message.tool_calls, null, 2));
  }

  if (ToolMessage.isInstance(message)) {
    console.log(`tool_call_id: ${message.tool_call_id}`);
  }
}

async function main() {
  const model = fakeModel()
    .respond(
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "recommend_learning_plan",
            args: {
              topic: "LangChain tools 状态传递"
            },
            id: "tool_call_state_001",
            type: "tool_call"
          }
        ]
      })
    )
    .respond(new AIMessage("我已经根据工具返回的用户状态和请求上下文，生成了个性化学习建议。"));

  const agent = createAgent({
    model,
    tools: [recommendLearningPlan],
    stateSchema,
    contextSchema,
    systemPrompt: "你是一个中文学习助手。需要个性化建议时调用 recommend_learning_plan 工具。"
  });

  const response = await agent.invoke(
    {
      messages: [
        {
          role: "user",
          content: "我想继续学习 LangChain tools 的状态传递，帮我安排一下。"
        }
      ],
      userProfile: {
        userId: "user_1001",
        name: "小李",
        level: "intermediate"
      },
      recentTopics: ["stream 流式输出", "message 内部结构", "agent invoke"]
    },
    {
      context: {
        requestId: "req_20260716_001",
        tenantId: "course-lab",
        authToken: "course-token-demo"
      }
    }
  );

  console.log("## Agent messages");
  response.messages.forEach(printMessage);

  console.log("\n## 观察重点");
  console.log("1. topic 来自 tool schema，是模型显式传给工具的参数。");
  console.log("2. requestId、tenantId、authToken 来自 runtime.context，不需要让模型生成。");
  console.log("3. userProfile、recentTopics、messages 来自 runtime.state，是 Agent 当前状态。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
