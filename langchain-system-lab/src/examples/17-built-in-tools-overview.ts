import { tools as openAITools } from "@langchain/openai";
import { tool } from "langchain";
import { z } from "zod";

const getWeather = tool(
  async ({ city }) => {
    return {
      city,
      weather: "晴",
      temperatureCelsius: 26,
      executedBy: "当前 Node.js 应用"
    };
  },
  {
    name: "get_weather",
    description: "查询指定城市的天气。",
    schema: z.object({
      city: z.string().describe("城市名称")
    })
  }
);

const webSearch = openAITools.webSearch({
  filters: {
    allowedDomains: ["docs.langchain.com"]
  },
  search_context_size: "low"
});

const codeInterpreter = openAITools.codeInterpreter({
  container: {
    memoryLimit: "1g"
  }
});

const fileSearch = openAITools.fileSearch({
  vectorStoreIds: ["vs_demo_not_sent_to_api"],
  maxNumResults: 3
});

function hasInvoke(value: unknown) {
  if (typeof value !== "object" || value === null || !("invoke" in value)) {
    return false;
  }

  return typeof value.invoke === "function";
}

async function main() {
  console.log("## 1. Client Tool：应用自己执行");
  console.log(
    JSON.stringify(
      {
        name: getWeather.name,
        description: getWeather.description,
        hasInvoke: hasInvoke(getWeather),
        executionLocation: "application"
      },
      null,
      2
    )
  );

  const weatherResult = await getWeather.invoke({ city: "杭州" });
  console.log("本地调用结果:");
  console.log(JSON.stringify(weatherResult, null, 2));

  console.log("\n## 2. Server Tool：把配置交给模型提供商");
  console.dir(
    {
      webSearch,
      codeInterpreter,
      fileSearch
    },
    { depth: 8 }
  );

  console.log("\n## 3. 执行位置对比");
  console.table([
    {
      tool: "get_weather",
      kind: "ClientTool",
      hasInvoke: hasInvoke(getWeather),
      executedBy: "应用进程"
    },
    {
      tool: String(webSearch.type),
      kind: "ServerTool",
      hasInvoke: hasInvoke(webSearch),
      executedBy: "模型提供商"
    },
    {
      tool: String(codeInterpreter.type),
      kind: "ServerTool",
      hasInvoke: hasInvoke(codeInterpreter),
      executedBy: "模型提供商"
    },
    {
      tool: String(fileSearch.type),
      kind: "ServerTool",
      hasInvoke: hasInvoke(fileSearch),
      executedBy: "模型提供商"
    }
  ]);

  console.log("\n## 观察重点");
  console.log("1. tool() 创建的是可由应用调用的 ClientTool，具有 invoke()。");
  console.log("2. webSearch 等 ServerTool 只是配置对象，本地没有 invoke()。");
  console.log("3. ServerTool 要作为 tools 参数传给支持它的模型，不能直接执行。");
  console.log("4. OpenAI ServerTool 不能因为接口兼容就直接交给 DeepSeek 使用。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
