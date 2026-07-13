import { z } from "zod";
import { config } from "../config.js";
import { createDeepSeekClient } from "../llm/providers/deepseek.js";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam
} from "openai/resources/chat/completions";

type DeepSeekDelta = ChatCompletionChunk["choices"][number]["delta"] & {
  reasoning_content?: string;
};

type DeepSeekThinkingSearchRequest = Omit<
  ChatCompletionCreateParamsStreaming,
  "model" | "messages" | "reasoning_effort"
> & {
  model: string;
  messages: ChatCompletionMessageParam[];
  reasoning_effort?: "high" | "max";
  thinking?: {
    type: "enabled";
  };
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface PendingToolCall {
  index: number;
  id?: string;
  type?: string;
  functionName: string;
  arguments: string;
}

type ToolCallDelta = NonNullable<DeepSeekDelta["tool_calls"]>[number];

const WebSearchArgs = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(5).optional().default(3)
});

const client = createDeepSeekClient();
const model = config.deepseek.reasoningModel;

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the public web for fresh information and return source links.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "The web search query."
          },
          maxResults: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "Maximum number of search results to return."
          }
        }
      }
    }
  }
];

const messages: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: [
      "你是一个会边思考边联网搜索的 AI 课程助教。",
      "遇到最新信息、当前文档、新闻、价格、版本、事实核验或需要来源的问题时，必须调用 web_search。",
      "你可以先思考问题缺口，再决定搜索关键词；搜索结果不足时可以继续搜索。",
      "最多进行 3 轮搜索；拿到官方文档或足够来源后必须直接回答，不要为了完美继续搜索。",
      "最终用中文回答，并列出来源 URL。",
      "如果搜索结果不足以确认结论，必须明确说明不确定。"
    ].join("\n")
  },
  {
    role: "user",
    content: [
      "请边想边搜，调研 DeepSeek API 是否有内置 Web Search 能力。",
      "如果没有，请说明如何用 function calling 自己实现联网搜索，并给出 TypeScript 后端实现思路。",
      "答案控制在 800 字以内；代码只给核心流程，不要展开完整项目。"
    ].join("\n")
  }
];

function createThinkingSearchRequest(): DeepSeekThinkingSearchRequest {
  const isLegacyReasoner = model.includes("reasoner");

  return {
    model,
    messages,
    stream: true,
    max_tokens: 2200,
    tools,
    tool_choice: "auto",
    // deepseek-reasoner 默认就是推理模型，新 thinking 模型需要显式开启思考模式。
    ...(isLegacyReasoner
      ? {}
      : {
          reasoning_effort: config.deepseek.reasoningEffort,
          thinking: { type: "enabled" }
        })
  };
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string): string {
  return decodeHtml(value.replaceAll(/<[^>]*>/g, ""));
}

function normalizeDuckDuckGoUrl(rawUrl: string): string {
  const decodedUrl = decodeHtml(rawUrl);

  if (!decodedUrl.startsWith("//duckduckgo.com/l/?")) {
    return decodedUrl;
  }

  const url = new URL(`https:${decodedUrl}`);
  const redirected = url.searchParams.get("uddg");
  return redirected ? decodeURIComponent(redirected) : decodedUrl;
}

async function searchWithDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; llm-api-system-lab/0.1)"
    }
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const titleMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis)];
  const snippetMatches = [...html.matchAll(/<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gis)];

  return titleMatches.slice(0, maxResults).map((match, index) => {
    const rawUrl = match[1] ?? "";
    const rawTitle = match[2] ?? "";
    const rawSnippet = snippetMatches[index]?.[1] ?? "";

    return {
      title: stripHtml(rawTitle),
      url: normalizeDuckDuckGoUrl(rawUrl),
      snippet: stripHtml(rawSnippet)
    };
  });
}

async function searchWithTavily(query: string, maxResults: number): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();

  if (!apiKey || apiKey.startsWith("your_")) {
    return searchWithDuckDuckGo(query, maxResults);
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      snippet?: string;
    }>;
  };

  return (data.results ?? []).slice(0, maxResults).map((item) => ({
    title: item.title ?? "Untitled",
    url: item.url ?? "",
    snippet: item.content ?? item.snippet ?? ""
  }));
}

async function webSearch(args: unknown) {
  const { query, maxResults } = WebSearchArgs.parse(args);
  const results = await searchWithTavily(query, maxResults);

  return {
    query,
    results,
    note:
      "Use these sources to answer. If the results are insufficient or conflict, say so explicitly."
  };
}

function elapsedSeconds(startedAt: number): number {
  return Math.round((Date.now() - startedAt) / 1000);
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

function collectToolCallDelta(pendingToolCalls: Map<number, PendingToolCall>, toolCallDelta: ToolCallDelta): void {
  const index = toolCallDelta.index ?? pendingToolCalls.size;
  const pending =
    pendingToolCalls.get(index) ??
    ({
      index,
      functionName: "",
      arguments: ""
    } satisfies PendingToolCall);

  if (toolCallDelta.id) {
    pending.id = toolCallDelta.id;
  }

  if (toolCallDelta.type) {
    pending.type = toolCallDelta.type;
  }

  if (toolCallDelta.function?.name) {
    pending.functionName += toolCallDelta.function.name;
  }

  if (toolCallDelta.function?.arguments) {
    pending.arguments += toolCallDelta.function.arguments;
  }

  pendingToolCalls.set(index, pending);
}

function buildToolCalls(pendingToolCalls: Map<number, PendingToolCall>): ChatCompletionMessageToolCall[] {
  return [...pendingToolCalls.values()]
    .sort((left, right) => left.index - right.index)
    .map((pending) => {
      if (!pending.id || !pending.functionName) {
        throw new Error(`Incomplete streamed tool call: ${JSON.stringify(pending)}`);
      }

      return {
        id: pending.id,
        type: "function",
        function: {
          name: pending.functionName,
          arguments: pending.arguments || "{}"
        }
      };
    });
}

async function runToolCall(
  toolCall: ChatCompletionMessageFunctionToolCall
): Promise<ChatCompletionToolMessageParam> {
  const toolName = toolCall.function.name;
  const args = parseToolArguments(toolCall);
  const result = toolName === "web_search" ? await webSearch(args) : { error: `Unknown tool: ${toolName}` };

  console.log(`\n[tool:${toolName}]`);
  console.log(JSON.stringify(result, null, 2));

  return {
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(result)
  };
}

async function streamAssistantTurn(round: number) {
  const startedAt = Date.now();
  const pendingToolCalls = new Map<number, PendingToolCall>();
  let reasoningContent = "";
  let finalContent = "";
  let hasPrintedReasoningTitle = false;
  let hasPrintedAnswerTitle = false;
  let hasPrintedToolNotice = false;

  console.log(`\n\n[deepseek/${model}] round ${round}`);

  const stream = await client.chat.completions.create(
    createThinkingSearchRequest() as ChatCompletionCreateParamsStreaming
  );

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta as DeepSeekDelta | undefined;

    if (!delta) {
      continue;
    }

    const reasoningDelta = delta.reasoning_content ?? "";
    const contentDelta = typeof delta.content === "string" ? delta.content : "";

    if (reasoningDelta) {
      if (!hasPrintedReasoningTitle) {
        console.log("=== 已思考（流式输出）===");
        hasPrintedReasoningTitle = true;
      }

      reasoningContent += reasoningDelta;
      process.stdout.write(reasoningDelta);
    }

    if (contentDelta) {
      if (!hasPrintedAnswerTitle) {
        console.log(`\n\n=== 回答草稿（思考用时 ${elapsedSeconds(startedAt)} 秒）===`);
        hasPrintedAnswerTitle = true;
      }

      finalContent += contentDelta;
      process.stdout.write(contentDelta);
    }

    for (const toolCallDelta of delta.tool_calls ?? []) {
      if (!hasPrintedToolNotice) {
        console.log(`\n\n=== 发现需要搜索，正在生成 web_search 参数 ===`);
        hasPrintedToolNotice = true;
      }

      collectToolCallDelta(pendingToolCalls, toolCallDelta);
    }
  }

  if (!reasoningContent && !finalContent && pendingToolCalls.size === 0) {
    console.log("\n[提示] 本轮没有返回 reasoning_content、content 或 tool_calls。");
  }

  const toolCalls = buildToolCalls(pendingToolCalls);

  messages.push({
    role: "assistant",
    content: finalContent || null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
  });

  return {
    finalContent,
    toolCalls
  };
}

const maxToolRounds = 3;
let finalAnswer = "";

for (let round = 1; round <= maxToolRounds; round += 1) {
  const { finalContent, toolCalls } = await streamAssistantTurn(round);

  if (toolCalls.length === 0) {
    finalAnswer = finalContent;
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
  console.log("\n\n=== 工具轮次已结束，强制生成最终回答 ===");

  messages.push({
    role: "user",
    content: [
      "工具调用轮次已结束。不要再调用工具，也不要输出任何 tool_calls 或 DSML 工具标记。",
      "请只基于上面已经返回的 web_search 搜索结果，直接给出最终中文答案。",
      "答案控制在 800 字以内；如需代码，仅给 20 行以内核心片段，并且必须完整收尾。",
      "必须列出来源 URL；如果证据不足，请说明不确定。"
    ].join("\n")
  });

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: 2200,
    tool_choice: "none"
  });

  finalAnswer = response.choices[0]?.message.content ?? "";
  console.log(finalAnswer);
}

console.log("\n");
