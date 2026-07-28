import { getSetupStatus } from "./config.js";
import { COLLECTION_NAMES } from "./vectorstores/collection-names.js";

function yesOrNo(value: boolean): string {
  return value ? "configured" : "not configured";
}

const status = getSetupStatus();

console.log("LangChain Commerce RAG Lab");
console.log("");
console.log(`Node.js: ${process.version}`);
console.log(`Chroma mode: ${status.chromaMode}`);
console.log(`Chroma URL: ${status.chromaUrl}`);
console.log(`Chroma Cloud: ${yesOrNo(status.chromaCloud)}`);
console.log(`Ark API key: ${yesOrNo(status.arkApiKey)}`);
console.log(`Text embedding model: ${yesOrNo(status.textEmbeddingModel)}`);
console.log(
  `Multimodal embedding model: ${yesOrNo(status.multimodalEmbeddingModel)}`
);
console.log(`Chat model: ${yesOrNo(status.chatModel)}`);
console.log(
  `LangSmith tracing: ${status.langsmithTracing ? "enabled" : "disabled"}`
);
console.log(
  `LangSmith credentials: ${yesOrNo(status.langsmithConfigured)}`
);
console.log("");
console.log("Planned collections:");

for (const name of Object.values(COLLECTION_NAMES)) {
  console.log(`  - ${name}`);
}

console.log("");
console.log("Project scaffold is ready. API and Chroma connections are deferred.");
