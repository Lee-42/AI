import { z } from "zod";
import { config } from "../config.js";
import { createDeepSeekClient } from "../llm/providers/deepseek.js";
import { createOpenAIClient, getOpenAIDefaultVisionModel } from "../llm/providers/openai.js";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam
} from "openai/resources/chat/completions";

const defaultStrawberryImageUrl = "https://upload.wikimedia.org/wikipedia/commons/2/29/PerfectStrawberry.jpg";

if (!config.openai.apiKey) {
  throw new Error(
    [
      "Missing OPENAI_API_KEY.",
      "This example uses DeepSeek as the main reasoning model and OpenAI vision as the image_analyze tool.",
      "Set OPENAI_API_KEY, or replace analyzeImage() with another vision-capable provider."
    ].join(" ")
  );
}

const ImageAnalyzeArgs = z.object({
  imageUrl: z.string().url(),
  task: z.enum(["count_objects"]),
  targetObject: z.string().min(1)
});

const ImageCountResult = z.object({
  targetObject: z.string(),
  count: z.number().int().nonnegative(),
  confidence: z.enum(["low", "medium", "high"]),
  visibleEvidence: z.array(z.string()),
  uncertainRegions: z.number().int().nonnegative(),
  notes: z.string()
});

type ImageCountResult = z.infer<typeof ImageCountResult>;

const mainClient = createDeepSeekClient();
const visionClient = createOpenAIClient();
const mainModel = config.deepseek.model;
const visionModel = getOpenAIDefaultVisionModel();
const imageUrl = config.examples.strawberryImageUrl ?? config.examples.imageUrl ?? defaultStrawberryImageUrl;

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "image_analyze",
      description: "Analyze an image with a vision model and return structured visual facts.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["imageUrl", "task", "targetObject"],
        properties: {
          imageUrl: {
            type: "string",
            description: "The public image URL to analyze."
          },
          task: {
            type: "string",
            enum: ["count_objects"],
            description: "The image analysis task."
          },
          targetObject: {
            type: "string",
            description: "The object to count, for example: strawberry or 草莓."
          }
        }
      }
    }
  }
];

function imageCountJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["targetObject", "count", "confidence", "visibleEvidence", "uncertainRegions", "notes"],
    properties: {
      targetObject: {
        type: "string",
        description: "The object counted in the image."
      },
      count: {
        type: "integer",
        minimum: 0,
        description: "The best estimated count of the target object."
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Confidence in the count."
      },
      visibleEvidence: {
        type: "array",
        description: "Short visual observations supporting the count.",
        items: {
          type: "string"
        }
      },
      uncertainRegions: {
        type: "integer",
        minimum: 0,
        description: "Number of ambiguous or partially occluded regions."
      },
      notes: {
        type: "string",
        description: "Any caveats about occlusion, overlap, image quality, or ambiguity."
      }
    }
  };
}

async function analyzeImage(args: unknown) {
  const { imageUrl, targetObject } = ImageAnalyzeArgs.parse(args);

  const response = await visionClient.responses.create({
    model: visionModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Count the visible ${targetObject} objects in this image.`,
              "Return only the JSON object required by the schema.",
              "If an object is partially hidden, include it only when you can see enough visual evidence.",
              "Mention uncertainty in notes instead of inflating the count."
            ].join("\n")
          },
          {
            type: "input_image",
            image_url: imageUrl,
            detail: "high"
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "image_count_result",
        strict: true,
        schema: imageCountJsonSchema()
      }
    },
    max_output_tokens: 800
  });

  const parsed = ImageCountResult.parse(JSON.parse(response.output_text)) satisfies ImageCountResult;
  const usage = response.usage
    ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens
      }
    : undefined;

  return {
    imageProvider: "openai",
    imageModel: visionModel,
    imageUrl,
    ...parsed,
    ...(usage ? { usage } : {})
  };
}

function isFunctionToolCall(
  toolCall: ChatCompletionMessageToolCall
): toolCall is ChatCompletionMessageFunctionToolCall {
  return toolCall.type === "function";
}

function parseToolArguments(toolCall: ChatCompletionMessageFunctionToolCall): unknown {
  const rawArguments = toolCall.function.arguments || "{}";

  try {
    return JSON.parse(rawArguments);
  } catch (error) {
    throw new Error(`Invalid JSON arguments for ${toolCall.function.name}: ${rawArguments}`, {
      cause: error
    });
  }
}

async function runToolCall(
  toolCall: ChatCompletionMessageFunctionToolCall
): Promise<ChatCompletionToolMessageParam> {
  const toolName = toolCall.function.name;
  const args = parseToolArguments(toolCall);
  const result = toolName === "image_analyze" ? await analyzeImage(args) : { error: `Unknown tool: ${toolName}` };

  console.log(`\n[tool:${toolName}]`);
  console.log(JSON.stringify(result, null, 2));

  return {
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(result)
  };
}

const messages: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: [
      "你是一个 AI 课程助教，负责演示“主模型 + image 工具 + 视觉模型”的调用链。",
      "你不能凭空猜测图片内容。凡是需要看图、数物体或识别视觉细节时，必须调用 image_analyze。",
      "image_analyze 会返回结构化视觉事实，你要基于工具结果用中文回答。",
      "最终回答需要说明：主模型负责推理，image 工具背后调用了视觉模型。"
    ].join("\n")
  },
  {
    role: "user",
    content: [
      "请使用 image 工具数一数这张图片里有几个草莓。",
      `图片 URL：${imageUrl}`,
      "请给出数量、置信度和不确定原因。"
    ].join("\n")
  }
];

let finalAnswer = "";

for (let round = 1; round <= 2; round += 1) {
  console.log(`\n[deepseek/${mainModel}] round ${round}`);

  const response = await mainClient.chat.completions.create({
    model: mainModel,
    messages,
    tools,
    tool_choice: "auto"
  });

  const assistantMessage = response.choices[0]?.message;

  if (!assistantMessage) {
    throw new Error("DeepSeek did not return an assistant message.");
  }

  const toolCalls = assistantMessage.tool_calls ?? [];

  messages.push({
    role: "assistant",
    content: assistantMessage.content ?? null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
  });

  if (toolCalls.length === 0) {
    finalAnswer = assistantMessage.content ?? "";
    break;
  }

  for (const toolCall of toolCalls) {
    if (!isFunctionToolCall(toolCall)) {
      throw new Error(`Unsupported tool call type: ${toolCall.type}`);
    }

    messages.push(await runToolCall(toolCall));
  }
}

if (!finalAnswer) {
  messages.push({
    role: "user",
    content: "工具调用已经完成。不要继续调用工具，请基于 image_analyze 的结果给出最终中文答案。"
  });

  const response = await mainClient.chat.completions.create({
    model: mainModel,
    messages,
    tool_choice: "none"
  });

  finalAnswer = response.choices[0]?.message.content ?? "";
}

console.log("\n--- final answer ---\n");
console.log(finalAnswer);
