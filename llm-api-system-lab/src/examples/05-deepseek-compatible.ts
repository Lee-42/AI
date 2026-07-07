import { generateText } from "../llm/client.js";

// Force DeepSeek to show how a compatible provider fits the same facade.
const response = await generateText({
  provider: "deepseek",
  messages: [
    {
      role: "system",
      content: "你是一个简洁的 AI 应用开发课程助教。"
    },
    {
      role: "user",
      content: "解释一下 OpenAI-compatible API 的意义。"
    }
  ]
});

console.log(`[${response.provider}/${response.model}]`);
console.log(response.text);
