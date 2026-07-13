import { z } from "zod";
import { config } from "../config.js";
import { createDeepSeekClient } from "../llm/providers/deepseek.js";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam
} from "openai/resources/chat/completions";

const WebSearchArgs = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(5).optional().default(3)
});

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const client = createDeepSeekClient();
const model = config.deepseek.model;

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

function isFunctionToolCall(
  toolCall: ChatCompletionMessageToolCall
): toolCall is ChatCompletionMessageFunctionToolCall {
  return toolCall.type === "function";
}

function parseToolArguments(toolCall: ChatCompletionMessageFunctionToolCall): unknown {
  return JSON.parse(toolCall.function.arguments || "{}");
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

const messages: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: [
      "你是一个会联网搜索的 AI 课程助教。",
      "当用户询问最新信息、当前文档、新闻、价格、版本或需要来源的问题时，必须先调用 web_search。",
      "你可以根据搜索结果决定是否继续搜索。",
      "最终用中文回答，并列出来源 URL。",
      "如果搜索结果不足以确认结论，必须明确说明不确定。"
    ].join("\n")
  },
  {
    role: "user",
    content:
      "请联网搜索 DeepSeek API 当前是否有内置 Web Search 工具，并说明如何用 DeepSeek 实现联网搜索。"
  }
];

let finalAnswer = "";

for (let round = 1; round <= 3; round += 1) {
  console.log(`\n[deepseek/${model}] round ${round}`);

  const response = await client.chat.completions.create({
    model,
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
  const response = await client.chat.completions.create({
    model,
    messages,
    tool_choice: "none"
  });

  finalAnswer = response.choices[0]?.message.content ?? "";
}

console.log("\n--- final answer ---\n");
console.log(finalAnswer);
