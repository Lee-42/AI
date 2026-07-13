# LLM API System Lab

TypeScript examples for learning LLM API system design.

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill in `.env`, then run:

```bash
pnpm example:basic
```

Set the provider with `LLM_PROVIDER`:

```bash
LLM_PROVIDER=deepseek pnpm example:basic
LLM_PROVIDER=deepseek pnpm example:stream
LLM_PROVIDER=deepseek pnpm example:json
LLM_PROVIDER=deepseek pnpm example:vision
pnpm example:vision:url
pnpm example:vision:file
pnpm example:vision:stream-usage
LLM_PROVIDER=deepseek pnpm example:tool
LLM_PROVIDER=deepseek pnpm example:reasoning
pnpm example:cot
pnpm example:continue
pnpm example:schema
pnpm example:deepseek:web-search
pnpm example:deepseek:thinking-web-search
pnpm example:deepseek:image-tool
```

If `LLM_PROVIDER` is omitted, the app chooses OpenAI when `OPENAI_API_KEY` exists, then DeepSeek when `DEEPSEEK_API_KEY` exists.

## Scripts

```bash
pnpm dev
pnpm example:basic
pnpm example:stream
pnpm example:json
pnpm example:vision
pnpm example:vision:url
pnpm example:vision:file
pnpm example:vision:stream-usage
pnpm example:deepseek
pnpm example:tool
pnpm example:reasoning
pnpm example:cot
pnpm example:continue
pnpm example:schema
pnpm example:deepseek:web-search
pnpm example:deepseek:thinking-web-search
pnpm example:deepseek:image-tool
pnpm check
```

## Project Shape

```text
src/
  config.ts
  llm/
    client.ts
    types.ts
    providers/
      openai.ts
      deepseek.ts
  examples/
    01-basic-text.ts
    02-stream.ts
    03-json-output.ts
    04-vision-url.ts
    05-deepseek-compatible.ts
    06-tool-call.ts
    07-reasoning-comparison.ts
    08-deepseek-cot-stream.ts
    09-continuation.ts
    10-json-schema-format.ts
    11-vision-file.ts
    12-vision-stream-usage.ts
    13-deepseek-web-search.ts
    14-deepseek-thinking-web-search.ts
    15-deepseek-image-tool-count-strawberries.ts
```

The project starts with a small `src/llm` facade. Examples call the facade, and provider adapters translate requests to OpenAI Responses API or DeepSeek Chat Completions.

`04-vision-url.ts` also goes through the facade. OpenAI vision works through Responses API. DeepSeek's official API docs currently do not list a vision/image input model, so DeepSeek image calls require a separate provider/account that explicitly exposes a vision-capable DeepSeek-compatible model.

`08-deepseek-cot-stream.ts` calls DeepSeek directly because it needs the provider-specific `reasoning_content` field. Configure `DEEPSEEK_REASONING_MODEL` with a thinking-capable DeepSeek model, such as `deepseek-v4-pro`.

`09-continuation.ts` demonstrates continuation mode. It first limits output tokens to produce partial content, then sends the original task plus existing output back to the model and asks it to generate only the new continuation.

`10-json-schema-format.ts` demonstrates JSON Schema formatted output with nested objects, enums, arrays, and Zod runtime validation.

`04-vision-url.ts` demonstrates online image URL parsing. Set `IMAGE_URL` to a public image URL.

`11-vision-file.ts` demonstrates local image parsing through OpenAI Files API. Set `IMAGE_PATH` to a local image file path.

`12-vision-stream-usage.ts` streams an online image analysis response with OpenAI Responses API, then prints token usage from the completed stream event. Set `IMAGE_URL` to a public image URL.

`13-deepseek-web-search.ts` demonstrates DeepSeek web search through Tool Calls. DeepSeek decides when to call `web_search`; the Node.js backend performs the actual search, returns source links, and DeepSeek writes the final answer with citations. Set `TAVILY_API_KEY` for Tavily search, or omit it to use the DuckDuckGo HTML fallback for teaching/demo use.

`14-deepseek-thinking-web-search.ts` demonstrates the "think while searching" flow. It streams DeepSeek `reasoning_content`, collects streamed `tool_calls`, runs `web_search`, appends tool results back into the conversation, and lets the model continue until it can produce a sourced final answer.

`15-deepseek-image-tool-count-strawberries.ts` demonstrates using an `image_analyze` tool to give a DeepSeek main model image understanding. The tool calls an OpenAI vision model, returns structured strawberry-count facts, and DeepSeek writes the final answer. Set `STRAWBERRY_IMAGE_URL` to use your own public image.
