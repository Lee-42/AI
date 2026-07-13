import { config } from "../config.js";
import { createOpenAIClient, getOpenAIDefaultVisionModel } from "../llm/providers/openai.js";

const imageUrl = config.examples.imageUrl;

if (!imageUrl) {
  throw new Error("Missing IMAGE_URL. Copy .env.example to .env and set IMAGE_URL.");
}

const client = createOpenAIClient();
const model = getOpenAIDefaultVisionModel();

const stream = await client.responses.create({
  model,
  stream: true,
  input: [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "请解析这张图片。",
            "要求：",
            "1. 先用一句话概括图片内容。",
            "2. 再列出你能确定的关键信息。",
            "3. 不确定的内容明确说不确定。"
          ].join("\n")
        },
        {
          type: "input_image",
          image_url: imageUrl,
          detail: "auto"
        }
      ]
    }
  ]
});

console.log(`[openai/${model}]`);
console.log("\n--- streamed answer ---\n");

let finalUsage:
  | {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      input_tokens_details?: { cached_tokens?: number };
      output_tokens_details?: { reasoning_tokens?: number };
    }
  | undefined;

for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  }

  if (event.type === "response.completed") {
    finalUsage = event.response.usage;
  }
}

process.stdout.write("\n");

if (!finalUsage) {
  console.warn("\nNo usage information was returned in the completed stream event.");
  process.exit(0);
}

console.log("\n--- token usage ---\n");
console.log(`input_tokens: ${finalUsage.input_tokens}`);
console.log(`output_tokens: ${finalUsage.output_tokens}`);
console.log(`total_tokens: ${finalUsage.total_tokens}`);

if (finalUsage.input_tokens_details) {
  console.log(`cached_input_tokens: ${finalUsage.input_tokens_details.cached_tokens ?? 0}`);
}

if (finalUsage.output_tokens_details) {
  console.log(`reasoning_output_tokens: ${finalUsage.output_tokens_details.reasoning_tokens ?? 0}`);
}

console.log(
  [
    "",
    "Note:",
    "input_tokens includes both the text prompt and image input.",
    "The API usage object does not always split image tokens into a separate field.",
    "To estimate image-only cost, compare this run with a text-only request using the same prompt."
  ].join("\n")
);
