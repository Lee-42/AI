import { config, getActiveModelConfig } from "./config.js";

const activeModel = getActiveModelConfig();

console.log("LangGraph System Lab");
console.log("");
console.log("Available examples:");
console.log("  pnpm example:env    Check Node.js and provider configuration");
console.log("  pnpm example:hello  Run a graph without an LLM or API key");
console.log("  pnpm example:conditional  Route state through pass/fail branches");
console.log("  pnpm example:state:reducer  Compare overwrite and reducer updates");
console.log("  pnpm example:super-step  Observe parallel super-step boundaries");
console.log("  pnpm example:stream:state  Stream State updates and values");
console.log("  pnpm example:llm    Run a graph with one provider-backed LLM node");
console.log("");
console.log(`Node.js: ${process.version}`);
console.log(`LLM_PROVIDER: ${config.llm.provider ?? "auto"}`);
console.log(`Active provider: ${activeModel.provider}`);
console.log(`Active model: ${activeModel.model}`);
console.log(`${activeModel.apiKeyName}: ${activeModel.apiKey ? "set" : "missing"}`);
