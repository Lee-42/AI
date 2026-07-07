import { z } from "zod";
import { config, getDefaultProvider } from "../config.js";
import { createDeepSeekClient } from "../llm/providers/deepseek.js";
import { createOpenAIClient } from "../llm/providers/openai.js";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam
} from "openai/resources/chat/completions";

const provider = getDefaultProvider();
const client = provider === "deepseek" ? createDeepSeekClient() : createOpenAIClient();
const model = provider === "deepseek" ? config.deepseek.model : config.openai.model;

const GetLessonInfoArgs = z.object({
  title: z.string()
});

const CalculateStudyDaysArgs = z.object({
  lessonCount: z.number().int().positive(),
  minutesPerLesson: z.number().positive(),
  minutesPerDay: z.number().positive()
});

const lessonDatabase = [
  {
    title: "LLM调用工具方法",
    chapter: "06 LLM API系统设计",
    lessonCount: 3,
    minutesPerLesson: 18,
    keyPoints: ["工具定义", "参数 schema", "本地函数执行", "tool 结果回传"]
  },
  {
    title: "LLM对回复进行stream流式输出",
    chapter: "06 LLM API系统设计",
    lessonCount: 2,
    minutesPerLesson: 15,
    keyPoints: ["delta", "流式转发", "完整回复保存"]
  }
];

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_lesson_info",
      description: "查询课程小节信息，包括所属章节、建议学习小节数和关键知识点。",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["title"],
        properties: {
          title: {
            type: "string",
            description: "课程小节标题，例如：LLM调用工具方法"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_study_days",
      description: "根据小节数量、单节分钟数和每天可学习分钟数，计算预计学习天数。",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["lessonCount", "minutesPerLesson", "minutesPerDay"],
        properties: {
          lessonCount: {
            type: "integer",
            description: "需要学习的小节数量"
          },
          minutesPerLesson: {
            type: "number",
            description: "每个小节预计学习分钟数"
          },
          minutesPerDay: {
            type: "number",
            description: "每天可投入学习分钟数"
          }
        }
      }
    }
  }
];

function getLessonInfo(args: unknown) {
  const { title } = GetLessonInfoArgs.parse(args);
  const lesson = lessonDatabase.find((item) => item.title.includes(title) || title.includes(item.title));

  if (!lesson) {
    return {
      found: false,
      message: `没有找到课程小节：${title}`
    };
  }

  return {
    found: true,
    ...lesson
  };
}

function calculateStudyDays(args: unknown) {
  const { lessonCount, minutesPerLesson, minutesPerDay } = CalculateStudyDaysArgs.parse(args);
  const totalMinutes = lessonCount * minutesPerLesson;

  return {
    lessonCount,
    minutesPerLesson,
    minutesPerDay,
    totalMinutes,
    days: Math.ceil(totalMinutes / minutesPerDay)
  };
}

function isFunctionToolCall(
  toolCall: ChatCompletionMessageToolCall
): toolCall is ChatCompletionMessageFunctionToolCall {
  return toolCall.type === "function";
}

function parseToolArguments(toolCall: ChatCompletionMessageFunctionToolCall): unknown {
  const rawArguments = toolCall.function.arguments || "{}";
  return JSON.parse(rawArguments);
}

async function runToolCall(
  toolCall: ChatCompletionMessageFunctionToolCall
): Promise<ChatCompletionToolMessageParam> {
  const args = parseToolArguments(toolCall);
  const toolName = toolCall.function.name;

  // 工具真正由后端执行，模型只负责决定“调用哪个工具”和“传什么参数”。
  const result =
    toolName === "get_lesson_info"
      ? getLessonInfo(args)
      : toolName === "calculate_study_days"
        ? calculateStudyDays(args)
        : { error: `Unknown tool: ${toolName}` };

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
      "你是一个 AI 课程助教。",
      "当问题需要查询课程信息或精确计算时，必须调用工具。",
      "最终用简洁中文回答，并说明你使用了哪些工具。"
    ].join("\n")
  },
  {
    role: "user",
    content:
      "我准备学习“LLM调用工具方法”。请先查询这个知识点的课程定位，再计算如果我每天学习 35 分钟，预计几天完成。"
  }
];

let finalAnswer = "";

// 最多允许三轮工具调用，避免模型反复请求工具导致示例卡住。
for (let round = 1; round <= 3; round += 1) {
  const response = await client.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: "auto"
  });

  const assistantMessage = response.choices[0]?.message;

  if (!assistantMessage) {
    throw new Error("LLM did not return an assistant message.");
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
  const response = await client.chat.completions.create({
    model,
    messages,
    tool_choice: "none"
  });

  finalAnswer = response.choices[0]?.message.content ?? "";
}

console.log(`\n[${provider}/${model}]`);
console.log(finalAnswer);
