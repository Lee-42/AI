import { generateText, getActiveProviderName } from "../llm/client.js";

const provider = getActiveProviderName();

// Unified facade: provider-specific SDK details stay under src/llm.
const response = await generateText({
  messages: [
    {
      role: "user",
      content: "用三句话解释什么是 LLM API。"
    }
  ]
});

console.log(`[${provider}/${response.model}]`);
console.log(response.text);
