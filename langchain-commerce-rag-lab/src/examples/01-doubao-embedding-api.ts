import { config } from "../config.js";
import {
  DoubaoTextEmbeddings,
  type EmbeddingRequestMetrics
} from "../embeddings/doubao-text-embeddings.js";

function requireConfig(
  value: string | undefined,
  environmentVariable: string
): string {
  if (!value) {
    throw new Error(
      `${environmentVariable} is required. Configure it in .env before ` +
        "running pnpm lesson:01."
    );
  }

  return value;
}

function preview(vector: number[], length = 8): string {
  return vector
    .slice(0, length)
    .map((value) => value.toFixed(6))
    .join(", ");
}

async function main(): Promise<void> {
  // 指标只用于教学观察，不改变 Provider 对外返回 number[][] 的契约。
  const metrics: EmbeddingRequestMetrics[] = [];
  const embeddings = new DoubaoTextEmbeddings({
    apiKey: requireConfig(config.ark.apiKey, "ARK_API_KEY"),
    baseURL: config.ark.baseURL,
    model: requireConfig(
      config.ark.textEmbeddingModel,
      "ARK_TEXT_EMBEDDING_MODEL"
    ),
    apiMode: config.ark.textEmbeddingApiMode,
    onRequestComplete: (requestMetrics) => {
      metrics.push(requestMetrics);
    }
  });

  // 刻意选择两种“笔记本”，为后续观察中文歧义召回做准备。
  const texts = [
    "Aurora Air 14 是一款轻薄便携的办公笔记本电脑。",
    "晨光 A5 是一本适合手写记录的纸质笔记本。"
  ];
  const vectors = await embeddings.embedDocuments(texts);
  const latestMetrics = metrics.at(-1);
  const totalTokens = metrics.reduce((total, item) => {
    return total + (item.totalTokens ?? 0);
  }, 0);

  console.log("01 跑通豆包 Embedding 模型 API");
  console.log("");
  console.log(`API 模式: ${config.ark.textEmbeddingApiMode}`);
  console.log(`实际模型: ${latestMetrics?.model ?? "unknown"}`);
  console.log(`输入数量: ${texts.length}`);
  console.log(`向量数量: ${vectors.length}`);
  console.log(`向量维度: ${vectors[0]?.length ?? 0}`);

  // 完整向量很长，只展示前 8 维确认 API 返回了有限数值。
  vectors.forEach((vector, index) => {
    console.log("");
    console.log(`[${index}] ${texts[index]}`);
    console.log(`向量预览: [${preview(vector)}, ...]`);
  });

  if (metrics.some((item) => item.totalTokens !== undefined)) {
    console.log("");
    console.log(`本次用量: ${totalTokens} tokens`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 01 课运行失败: ${message}`);
  process.exitCode = 1;
});
