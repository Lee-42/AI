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
LLM_PROVIDER=deepseek pnpm example:tool
LLM_PROVIDER=deepseek pnpm example:reasoning
pnpm example:cot
```

If `LLM_PROVIDER` is omitted, the app chooses OpenAI when `OPENAI_API_KEY` exists, then DeepSeek when `DEEPSEEK_API_KEY` exists.

## Scripts

```bash
pnpm dev
pnpm example:basic
pnpm example:stream
pnpm example:json
pnpm example:vision
pnpm example:deepseek
pnpm example:tool
pnpm example:reasoning
pnpm example:cot
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
```

The project starts with a small `src/llm` facade. Examples call the facade, and provider adapters translate requests to OpenAI Responses API or DeepSeek Chat Completions.

`04-vision-url.ts` also goes through the facade. DeepSeek vision calls require a vision-capable model configured with `DEEPSEEK_VISION_MODEL`.

`08-deepseek-cot-stream.ts` calls DeepSeek directly because it needs the provider-specific `reasoning_content` field. Configure `DEEPSEEK_REASONING_MODEL` with a thinking-capable DeepSeek model, such as `deepseek-v4-pro`.
