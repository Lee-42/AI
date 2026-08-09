import { config, getActiveModelConfig } from "./config.js";

const activeModel = getActiveModelConfig();

console.log("Deep Agents Planning Lab");
console.log("");
console.log(`Node.js: ${process.version}`);
console.log(`LLM_PROVIDER: ${config.llm.provider ?? "auto"}`);
console.log(`Active provider: ${activeModel.provider}`);
console.log(`Active model: ${activeModel.model}`);
console.log(`${activeModel.apiKeyName}: ${activeModel.apiKey ? "set" : "missing"}`);
