import { getActiveProviderName, streamText } from "../llm/client.js";

const provider = getActiveProviderName();

console.log(`[${provider}]`);

// The facade normalizes OpenAI Responses events and Chat Completions chunks.
const stream = streamText({
  messages: [
    {
      role: "user",
      content: "请用五个要点解释 LLM API 流式输出适合哪些场景。"
    }
  ]
});

for await (const delta of stream) {
  process.stdout.write(delta);
}

process.stdout.write("\n");
