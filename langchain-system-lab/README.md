# LangChain System Lab

TypeScript examples for learning LangChain step by step.

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill one provider key if you want to run examples that call a model:

```bash
OPENAI_API_KEY=your_openai_api_key
# or
DEEPSEEK_API_KEY=your_deepseek_api_key
```

## Scripts

```bash
pnpm example:env
pnpm example:overview
pnpm example:middleware:basic
pnpm example:middleware:request
pnpm example:middleware:dynamic-model
pnpm example:structured:strategies
pnpm check
```

## Structure

```text
src/
  config.ts
  index.ts
  examples/
    01-env-check.ts
    02-agent-overview.ts
    03-middleware-basic.ts
    04-middleware-request-shape.ts
    05-dynamic-model-middleware.ts
    06-structured-output-strategies.ts
```

`02-agent-overview.ts` is the first "one file overview" example: model + tool + agent + invoke.
`03-middleware-basic.ts` prints the basic middleware lifecycle.
`04-middleware-request-shape.ts` prints summarized `wrapModelCall` and `wrapToolCall` request objects.
`05-dynamic-model-middleware.ts` selects a default or advanced model inside middleware.
`06-structured-output-strategies.ts` compares prompt-only JSON with LangChain `toolStrategy`.

OpenAI is the default provider because most LangChain examples follow that path first. DeepSeek is also supported as an OpenAI-compatible provider, which is useful for cost control and comparison during learning.
