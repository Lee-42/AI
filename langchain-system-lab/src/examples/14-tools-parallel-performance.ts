import { AIMessage } from "@langchain/core/messages";
import { createAgent, createMiddleware, fakeModel, tool } from "langchain";
import { z } from "zod";

type Metric = {
  phase: "model" | "tool";
  name: string;
  callId?: string;
  startedAfterMs: number;
  durationMs: number;
  status: "success" | "error";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type RunReport = {
  label: string;
  totalDurationMs: number;
  metrics: Metric[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const getWeather = tool(
  async ({ city }) => {
    await sleep(400);
    return JSON.stringify({ city, weather: "晴", temperature: "26 C" });
  },
  {
    name: "get_weather",
    description: "查询城市天气。",
    schema: z.object({
      city: z.string().describe("城市名称")
    })
  }
);

const getAttractions = tool(
  async ({ city }) => {
    await sleep(600);
    return JSON.stringify({ city, attractions: ["西湖", "灵隐寺"] });
  },
  {
    name: "get_attractions",
    description: "查询城市景点。",
    schema: z.object({
      city: z.string().describe("城市名称")
    })
  }
);

function createPerformanceMonitor(label: string) {
  const metrics: Metric[] = [];
  let runStartedAt = performance.now();

  const middleware = createMiddleware({
    name: `PerformanceMonitor_${label}`,

    wrapModelCall: async (request, handler) => {
      const startedAt = performance.now();

      try {
        const response = await handler(request);
        const usage = response.usage_metadata;

        metrics.push({
          phase: "model",
          name: "chat_model",
          startedAfterMs: Math.round(startedAt - runStartedAt),
          durationMs: Math.round(performance.now() - startedAt),
          status: "success",
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
          totalTokens: usage?.total_tokens
        });

        return response;
      } catch (error) {
        metrics.push({
          phase: "model",
          name: "chat_model",
          startedAfterMs: Math.round(startedAt - runStartedAt),
          durationMs: Math.round(performance.now() - startedAt),
          status: "error"
        });
        throw error;
      }
    },

    wrapToolCall: async (request, handler) => {
      const startedAt = performance.now();

      try {
        const result = await handler(request);

        metrics.push({
          phase: "tool",
          name: request.toolCall.name,
          callId: request.toolCall.id,
          startedAfterMs: Math.round(startedAt - runStartedAt),
          durationMs: Math.round(performance.now() - startedAt),
          status: "success"
        });

        return result;
      } catch (error) {
        metrics.push({
          phase: "tool",
          name: request.toolCall.name,
          callId: request.toolCall.id,
          startedAfterMs: Math.round(startedAt - runStartedAt),
          durationMs: Math.round(performance.now() - startedAt),
          status: "error"
        });
        throw error;
      }
    }
  });

  return {
    middleware,
    start() {
      metrics.length = 0;
      runStartedAt = performance.now();
      return runStartedAt;
    },
    metrics
  };
}

function createSerialModel() {
  return fakeModel()
    .respond(
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "get_weather",
            args: { city: "杭州" },
            id: "serial_weather_001",
            type: "tool_call"
          }
        ],
        usage_metadata: {
          input_tokens: 120,
          output_tokens: 20,
          total_tokens: 140
        }
      })
    )
    .respond(
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "get_attractions",
            args: { city: "杭州" },
            id: "serial_attractions_001",
            type: "tool_call"
          }
        ],
        usage_metadata: {
          input_tokens: 180,
          output_tokens: 24,
          total_tokens: 204
        }
      })
    )
    .respond(
      new AIMessage({
        content: "杭州天气晴朗，可以游览西湖和灵隐寺。",
        usage_metadata: {
          input_tokens: 260,
          output_tokens: 36,
          total_tokens: 296
        }
      })
    );
}

function createParallelModel() {
  return fakeModel()
    .respond(
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "get_weather",
            args: { city: "杭州" },
            id: "parallel_weather_001",
            type: "tool_call"
          },
          {
            name: "get_attractions",
            args: { city: "杭州" },
            id: "parallel_attractions_001",
            type: "tool_call"
          }
        ],
        usage_metadata: {
          input_tokens: 120,
          output_tokens: 28,
          total_tokens: 148
        }
      })
    )
    .respond(
      new AIMessage({
        content: "杭州天气晴朗，可以游览西湖和灵隐寺。",
        usage_metadata: {
          input_tokens: 250,
          output_tokens: 35,
          total_tokens: 285
        }
      })
    );
}

async function runAgent(
  label: string,
  model: ReturnType<typeof fakeModel>
): Promise<RunReport> {
  const monitor = createPerformanceMonitor(label);
  const agent = createAgent({
    model,
    tools: [getWeather, getAttractions],
    middleware: [monitor.middleware],
    systemPrompt: "你是旅行助手。查询天气和景点后回答用户。"
  });

  const startedAt = monitor.start();

  await agent.invoke({
    messages: [
      {
        role: "user",
        content: "杭州天气怎么样？再推荐两个景点。"
      }
    ]
  });

  return {
    label,
    totalDurationMs: Math.round(performance.now() - startedAt),
    metrics: [...monitor.metrics]
  };
}

function printReport(report: RunReport) {
  const modelMetrics = report.metrics.filter((metric) => metric.phase === "model");
  const toolMetrics = report.metrics.filter((metric) => metric.phase === "tool");
  const tokenTotal = modelMetrics.reduce(
    (total, metric) => total + (metric.totalTokens ?? 0),
    0
  );

  console.log(`\n## ${report.label}`);
  console.table(
    [...report.metrics]
      .sort((left, right) => left.startedAfterMs - right.startedAfterMs)
      .map((metric) => ({
        phase: metric.phase,
        name: metric.name,
        callId: metric.callId ?? "-",
        startedAfterMs: metric.startedAfterMs,
        durationMs: metric.durationMs,
        status: metric.status,
        totalTokens: metric.totalTokens ?? "-"
      }))
  );
  console.log(`model 调用次数: ${modelMetrics.length}`);
  console.log(`tool 调用次数: ${toolMetrics.length}`);
  console.log(`token 总量: ${tokenTotal}`);
  console.log(`Agent 总耗时: ${report.totalDurationMs} ms`);
}

async function main() {
  const serialReport = await runAgent("串行基线：两个 tool 分两轮调用", createSerialModel());
  const parallelReport = await runAgent("并行优化：两个 tool 在同一轮调用", createParallelModel());

  printReport(serialReport);
  printReport(parallelReport);

  const savedMs = serialReport.totalDurationMs - parallelReport.totalDurationMs;
  const savedPercent = Math.round((savedMs / serialReport.totalDurationMs) * 100);

  console.log("\n## 对比结论");
  console.log(`减少耗时: ${savedMs} ms（约 ${savedPercent}%）`);
  console.log("同一个 AIMessage 中的多个 tool_calls 会被并发执行。");
  console.log("并行总耗时接近最慢工具，而不是所有工具耗时之和。");
  console.log("只有互不依赖、并发安全的工具才适合这样优化。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
