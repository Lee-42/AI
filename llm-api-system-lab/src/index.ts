import { config, getDefaultProvider } from "./config.js";

// This entrypoint is a quick project health check; examples hold real lessons.
console.log("LLM API System Lab");
console.log("");
console.log("Available scripts:");
console.log("  pnpm example:basic    Basic Responses API call");
console.log("  pnpm example:stream   Streaming text output");
console.log("  pnpm example:json     Structured JSON output");
console.log("  pnpm example:vision   Image URL analysis");
console.log("  pnpm example:deepseek OpenAI-compatible provider call");
console.log("  pnpm example:tool     Tool calling with local functions");
console.log("");
console.log("Provider selection:");
console.log("  LLM_PROVIDER=openai  pnpm example:basic");
console.log("  LLM_PROVIDER=deepseek pnpm example:basic");
console.log("  LLM_PROVIDER=deepseek pnpm example:vision");
console.log("  LLM_PROVIDER=deepseek pnpm example:tool");
console.log("");
console.log(`Active provider: ${getDefaultProvider()}`);
console.log(`Default OpenAI model: ${config.openai.model}`);
console.log(`Default DeepSeek model: ${config.deepseek.model}`);
console.log(`Default DeepSeek vision model: ${config.deepseek.visionModel}`);
