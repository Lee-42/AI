import { config } from "../config.js";
import { generateImageText, getActiveProviderName } from "../llm/client.js";

const imageUrl = config.examples.imageUrl;

if (!imageUrl) {
  throw new Error("Missing IMAGE_URL. Copy .env.example to .env and set IMAGE_URL.");
}

const provider = getActiveProviderName();

// 本例演示 LLM 的视觉理解能力：把图片和文字问题一起交给模型分析。
const response = await generateImageText({
  imageUrl,
  prompt: "请识别这张图片的主要内容，并列出三个可能的应用场景。",
  detail: "auto"
});

console.log(`[${provider}/${response.model}]`);
console.log(response.text);
