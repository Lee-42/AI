import type { Client } from "langsmith";
import type { RunType } from "langsmith/schemas";
import { traceable } from "langsmith/traceable";

export const RUN_TYPE_CATALOG = [
  {
    type: "chain",
    meaning: "组织多个步骤的业务流程"
  },
  {
    type: "llm",
    meaning: "调用语言模型"
  },
  {
    type: "embedding",
    meaning: "把文本或图片转换为向量"
  },
  {
    type: "prompt",
    meaning: "把变量格式化为模型输入"
  },
  {
    type: "tool",
    meaning: "执行工具或外部动作"
  },
  {
    type: "retriever",
    meaning: "检索相关文档或上下文"
  },
  {
    type: "parser",
    meaning: "把模型原始输出转换为结构化结果"
  }
] as const satisfies ReadonlyArray<{
  type: RunType;
  meaning: string;
}>;

export type RunTypeDemoResult = {
  answer: string;
  citedSkus: string[];
  observedRunTypes: RunType[];
};

type RunTypeDemoOptions = {
  client?: Client;
  projectName?: string;
  tracingEnabled?: boolean;
};

function createTraceConfig(
  name: string,
  runType: RunType,
  options: RunTypeDemoOptions,
  metadata: Record<string, string> = {}
) {
  return {
    name,
    run_type: runType,
    client: options.client,
    project_name: options.projectName,
    tracingEnabled: options.tracingEnabled,
    tags: ["lesson-13-04", `run-type:${runType}`],
    metadata: {
      lesson: "13-04",
      dataSource: "offline-demo",
      ...metadata
    }
  };
}

export function createRunTypeDemo(
  options: RunTypeDemoOptions = {}
) {
  const embedQuery = traceable(
    async ({ text }: { text: string }) => ({
      // 三维固定向量只用于展示 run 类型，不调用任何模型。
      vector: [0.12, -0.04, 0.99],
      inputLength: text.length
    }),
    createTraceConfig(
      "demo-query-embedding",
      "embedding",
      options
    )
  );

  const retrieveProducts = traceable(
    async ({ queryVector }: { queryVector: number[] }) => [
      {
        page_content: "Aurora Air 14：轻薄便携，适合移动办公。",
        type: "Document" as const,
        metadata: {
          sku: "LAPTOP-AIR-14",
          score: 0.93,
          queryDimension: queryVector.length
        }
      }
    ],
    createTraceConfig(
      "demo-product-retriever",
      "retriever",
      options
    )
  );

  const checkInventory = traceable(
    async ({ sku }: { sku: string }) => ({
      sku,
      available: true,
      stock: 12
    }),
    createTraceConfig("demo-inventory-tool", "tool", options)
  );

  const formatPrompt = traceable(
    async ({
      question,
      context,
      stock
    }: {
      question: string;
      context: string;
      stock: number;
    }) => ({
      messages: [
        {
          role: "system",
          content: "只根据给定商品资料回答，并标注 SKU。"
        },
        {
          role: "user",
          content: `${question}\n资料：${context}\n库存：${stock}`
        }
      ]
    }),
    createTraceConfig("demo-prompt-template", "prompt", options)
  );

  const callFakeModel = traceable(
    async ({
      messages
    }: {
      messages: Array<{ role: string; content: string }>;
    }) => ({
      choices: [
        {
          message: {
            role: "assistant",
            content:
              "推荐 Aurora Air 14，适合移动办公。[LAPTOP-AIR-14]"
          }
        }
      ],
      // 这是离线假模型，因此 token 必须明确记录为 0。
      usage_metadata: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0
      },
      receivedMessageCount: messages.length
    }),
    createTraceConfig("demo-fake-llm", "llm", options, {
      ls_provider: "offline-demo",
      ls_model_name: "deterministic-no-model"
    })
  );

  const parseAnswer = traceable(
    async ({
      content
    }: {
      content: string;
    }): Promise<Omit<RunTypeDemoResult, "observedRunTypes">> => {
      const citedSkus = [
        ...content.matchAll(/\[([A-Z0-9-]+)\]/gu)
      ].map((match) => match[1]);

      return {
        answer: content.replace(/\s*\[[A-Z0-9-]+\]/gu, ""),
        citedSkus
      };
    },
    createTraceConfig("demo-output-parser", "parser", options)
  );

  return traceable(
    async ({
      question
    }: {
      question: string;
    }): Promise<RunTypeDemoResult> => {
      const embedding = await embedQuery({ text: question });
      const documents = await retrieveProducts({
        queryVector: embedding.vector
      });
      const topDocument = documents[0];

      if (!topDocument) {
        throw new Error("Offline demo expected one document");
      }

      const inventory = await checkInventory({
        sku: topDocument.metadata.sku
      });
      const prompt = await formatPrompt({
        question,
        context: topDocument.page_content,
        stock: inventory.stock
      });
      const modelOutput = await callFakeModel(prompt);
      const content =
        modelOutput.choices[0]?.message.content ?? "";
      const parsed = await parseAnswer({ content });

      return {
        ...parsed,
        observedRunTypes: RUN_TYPE_CATALOG.map((item) => item.type)
      };
    },
    createTraceConfig("demo-commerce-rag-chain", "chain", options)
  );
}
