import { Client } from "langsmith";
import { config } from "../../config.js";
import {
  createRunTypeDemo,
  RUN_TYPE_CATALOG
} from "../../observability/run-type-demo.js";

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
  const runDemo = createRunTypeDemo({
    client,
    projectName: config.langsmith.project,
    tracingEnabled: true
  });

  try {
    const result = await runDemo({
      question: "推荐一款适合移动办公的轻薄电脑"
    });

    console.log("13-04 traceable 支持的 run_type");
    console.log("");

    for (const item of RUN_TYPE_CATALOG) {
      console.log(`${item.type.padEnd(10)} ${item.meaning}`);
    }

    console.log("");
    console.log(`演示答案: ${result.answer}`);
    console.log(`引用 SKU: ${result.citedSkus.join(", ")}`);
    console.log("外部模型调用: 0");
    console.log("模型 Token 用量: 0");
  } finally {
    // 等待整棵离线演示调用树上传完成。
    await client.awaitPendingTraceBatches();
  }

  console.log("Trace 上传完成，可在 LangSmith 中展开调用树。");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 13-04 课运行失败: ${message}`);
  process.exitCode = 1;
});
