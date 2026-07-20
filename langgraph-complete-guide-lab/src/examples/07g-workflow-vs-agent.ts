import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { createAgent, fakeModel, tool } from "langchain";
import { z } from "zod";

const getWeather = tool(
  async ({ city }) => {
    console.log(`[tool] get_weather(${city})`);
    return `${city}：晴，26°C，微风。`;
  },
  {
    name: "get_weather",
    description: "查询指定城市的天气",
    schema: z.object({ city: z.string() })
  }
);

async function runWorkflow() {
  console.log("## Workflow");
  console.log("[code] next = get_weather");
  const weather = await getWeather.invoke({ city: "上海" });
  console.log("[code] next = END");
  console.log(`result: ${weather}\n`);
}

function describeMessage(message: BaseMessage): string {
  if (AIMessage.isInstance(message) && message.tool_calls?.length) {
    return `AIMessage -> 请求调用 ${message.tool_calls[0].name}`;
  }

  return `${message.constructor.name} -> ${String(message.content)}`;
}

async function runAgent() {
  console.log("## Agent");

  // fakeModel 只让运行结果可重复；这两条 response 代表真实模型的两轮决定。
  const model = fakeModel()
    .respond(
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "get_weather",
            args: { city: "上海" },
            id: "weather_call_1",
            type: "tool_call"
          }
        ]
      })
    )
    .respond(new AIMessage("上海天气晴朗、微风，适合散步。"));

  const agent = createAgent({ model, tools: [getWeather] });
  const result = await agent.invoke({
    messages: [{ role: "user", content: "上海适合散步吗？" }]
  });

  result.messages.forEach((message, index) => {
    console.log(`${index + 1}. ${describeMessage(message)}`);
  });
}

async function main() {
  await runWorkflow();
  await runAgent();

  console.log("\nBoundary:");
  console.log("Workflow -> 代码决定下一步");
  console.log("Agent    -> 模型输出决定调用工具还是结束");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
