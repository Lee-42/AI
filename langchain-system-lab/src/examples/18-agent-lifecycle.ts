import { AIMessage } from "@langchain/core/messages";
import { createAgent, createMiddleware, fakeModel, tool } from "langchain";
import { z } from "zod";

type LifecycleEvent = {
  order: number;
  event: string;
  detail: string;
};

const events: LifecycleEvent[] = [];

function record(event: string, detail = "-") {
  events.push({
    order: events.length + 1,
    event,
    detail
  });
}

const getCourseProgress = tool(
  async ({ section }) => {
    record("tool body", `执行 get_course_progress(${section})`);

    return {
      section,
      completedLessons: 20,
      nextLesson: "agent 调用的生命周期"
    };
  },
  {
    name: "get_course_progress",
    description: "查询指定课程章节的学习进度。",
    schema: z.object({
      section: z.string().describe("课程章节名称")
    })
  }
);

const lifecycleMiddleware = createMiddleware({
  name: "LifecycleObserver",

  beforeAgent: (state) => {
    record("beforeAgent", `messages=${state.messages.length}`);
  },

  beforeModel: (state) => {
    record("beforeModel", `messages=${state.messages.length}`);
  },

  wrapModelCall: async (request, handler) => {
    record("wrapModelCall: before", `messages=${request.messages.length}`);
    const response = await handler(request);
    record(
      "wrapModelCall: after",
      `toolCalls=${response.tool_calls?.length ?? 0}`
    );
    return response;
  },

  afterModel: (state) => {
    const lastMessage = state.messages.at(-1);
    const toolCallCount = AIMessage.isInstance(lastMessage)
      ? (lastMessage.tool_calls?.length ?? 0)
      : 0;

    record("afterModel", `toolCalls=${toolCallCount}`);
  },

  wrapToolCall: async (request, handler) => {
    record("wrapToolCall: before", request.toolCall.name);
    const result = await handler(request);
    record("wrapToolCall: after", request.toolCall.name);
    return result;
  },

  afterAgent: (state) => {
    record("afterAgent", `messages=${state.messages.length}`);
  }
});

async function main() {
  const model = fakeModel()
    .respond(
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "get_course_progress",
            args: {
              section: "深入浅出 LangChain"
            },
            id: "lifecycle_tool_call_001",
            type: "tool_call"
          }
        ]
      })
    )
    .respond(new AIMessage("你已经完成 20 节，接下来学习 Agent 调用的生命周期。"));

  const agent = createAgent({
    model,
    tools: [getCourseProgress],
    middleware: [lifecycleMiddleware],
    systemPrompt: "你是课程助手。需要学习进度时调用工具，然后回答用户。"
  });

  record("application", "准备调用 agent.invoke");

  const response = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "我学到哪里了？"
      }
    ]
  });

  record("application", "agent.invoke 已返回");

  console.log("## Agent 生命周期事件");
  console.table(events);

  console.log("\n## 最终结果");
  console.log(`messages 数量: ${response.messages.length}`);
  console.log(`最终回答: ${response.messages.at(-1)?.content}`);

  console.log("\n## 钩子调用次数");
  console.table(
    Object.entries(
      events.reduce<Record<string, number>>((counts, item) => {
        counts[item.event] = (counts[item.event] ?? 0) + 1;
        return counts;
      }, {})
    ).map(([event, count]) => ({ event, count }))
  );

  console.log("\n## 观察重点");
  console.log("1. beforeAgent 和 afterAgent 在一次正常 invoke 中各执行一次。");
  console.log("2. 模型调用两次，所以 model 相关钩子也执行两轮。");
  console.log("3. 第一轮模型返回 tool_calls，Agent 执行工具后再次调用模型。");
  console.log("4. 第二轮模型没有 tool_calls，Agent 结束循环并返回最终 state。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
