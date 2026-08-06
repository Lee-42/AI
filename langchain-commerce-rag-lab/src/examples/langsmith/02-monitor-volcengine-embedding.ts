import { Client } from "langsmith";
import { config } from "../../config.js";
import { createTextEmbeddings } from "../../embeddings/create-text-embeddings.js";
import type { EmbeddingRequestMetrics } from "../../embeddings/doubao-text-embeddings.js";
import { createTracedDoubaoEmbedding } from "../../observability/trace-doubao-embedding.js";

function requireConfig(
  value: string | undefined,
  environmentVariable: string
): string {
  if (!value) {
    throw new Error(`${environmentVariable} is required for this lesson`);
  }

  return value;
}

async function main(): Promise<void> {
  if (!config.langsmith.tracing) {
    throw new Error(
      "Set LANGSMITH_TRACING=true before running this lesson"
    );
  }

  const metrics: EmbeddingRequestMetrics[] = [];
  const embeddings = createTextEmbeddings({
    onRequestComplete: (requestMetrics) => {
      metrics.push(requestMetrics);
    }
  });
  const client = new Client({
    apiKey: requireConfig(
      config.langsmith.apiKey,
      "LANGSMITH_API_KEY"
    ),
    apiUrl: config.langsmith.endpoint,
    ...(config.langsmith.workspaceId
      ? { workspaceId: config.langsmith.workspaceId }
      : {})
  });

  const tracedEmbedding = createTracedDoubaoEmbedding(
    async ({ text }) => {
      const vector = await embeddings.embedQuery(text);
      const latestMetrics = metrics.at(-1);

      return {
        vector,
        model:
          latestMetrics?.model ??
          requireConfig(
            config.ark.textEmbeddingModel,
            "ARK_TEXT_EMBEDDING_MODEL"
          ),
        totalTokens: latestMetrics?.totalTokens
      };
    },
    {
      client,
      projectName: config.langsmith.project,
      tracingEnabled: true
    }
  );

  try {
    const result = await tracedEmbedding({
      text: "Aurora Air 14 是一款适合移动办公的轻薄笔记本电脑。"
    });

    console.log("13-02 用 LangSmith 监控火山引擎数据");
    console.log("");
    console.log(`LangSmith Project: ${config.langsmith.project}`);
    console.log(`实际模型: ${result.model}`);
    console.log(`向量维度: ${result.vector.length}`);
    console.log(
      `向量预览: [${result.vector
        .slice(0, 4)
        .map((value) => value.toFixed(6))
        .join(", ")}, ...]`
    );

    if (result.totalTokens !== undefined) {
      console.log(`本次用量: ${result.totalTokens} tokens`);
    }
  } finally {
    // CLI 很快退出，必须等后台队列把 trace 发送完。
    await client.awaitPendingTraceBatches();
  }

  console.log("Trace 上传完成，可前往 LangSmith Tracing 查看。");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 13-02 课运行失败: ${message}`);
  process.exitCode = 1;
});
