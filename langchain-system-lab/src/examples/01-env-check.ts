import { config, getActiveModelConfig } from "../config.js";

const requiredNodeMajor = 22;
const currentNodeMajor = Number(process.versions.node.split(".")[0]);
const activeModel = getActiveModelConfig();

console.log("LangChain environment check");
console.log("");
console.log(`Node.js: ${process.version}`);
console.log(`Required Node.js major: ${requiredNodeMajor}+`);
console.log(`Node.js status: ${currentNodeMajor >= requiredNodeMajor ? "ok" : "upgrade needed"}`);
console.log(`LLM_PROVIDER: ${config.llm.provider ?? "auto"}`);
console.log(`Active provider: ${activeModel.provider}`);
console.log(`Active model: ${activeModel.model}`);
if (activeModel.baseURL) {
  console.log(`Base URL: ${activeModel.baseURL}`);
}
console.log(`OPENAI_API_KEY: ${config.openai.apiKey ? "set" : "missing"}`);
console.log(`DEEPSEEK_API_KEY: ${config.deepseek.apiKey ? "set" : "missing"}`);
console.log(`LANGSMITH_TRACING: ${config.langsmith.tracing}`);

if (!activeModel.apiKey) {
  console.log("");
  console.log(`Set ${activeModel.apiKeyName} in .env before running examples with ${activeModel.provider}.`);
}
