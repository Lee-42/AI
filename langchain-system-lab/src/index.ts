import { config, getActiveModelConfig } from "./config.js";

const activeModel = getActiveModelConfig();

console.log("LangChain System Lab");
console.log("");
console.log("Available examples:");
console.log("  pnpm example:env       Check local Node/pnpm/API-key environment");
console.log("  pnpm example:overview  Model + tool + agent overview");
console.log("  pnpm example:middleware:basic  Basic middleware lifecycle logger");
console.log("  pnpm example:middleware:request  Inspect middleware request shapes");
console.log("  pnpm example:middleware:dynamic-model  Select a model in middleware");
console.log("  pnpm example:structured:strategies  Compare prompt JSON and toolStrategy");
console.log("");
console.log(`Node.js: ${process.version}`);
console.log(`LLM_PROVIDER: ${config.llm.provider ?? "auto"}`);
console.log(`Active provider: ${activeModel.provider}`);
console.log(`Active model: ${activeModel.model}`);
console.log(`${activeModel.apiKeyName}: ${activeModel.apiKey ? "set" : "missing"}`);
