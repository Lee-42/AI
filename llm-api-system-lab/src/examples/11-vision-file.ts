import fs from "node:fs";
import { config } from "../config.js";
import { createOpenAIClient, getOpenAIDefaultVisionModel } from "../llm/providers/openai.js";

const imagePath = config.examples.imagePath;

if (!imagePath) {
  throw new Error("Missing IMAGE_PATH. Copy .env.example to .env and set IMAGE_PATH.");
}

if (!fs.existsSync(imagePath)) {
  throw new Error(`Local image does not exist: ${imagePath}`);
}

const stat = fs.statSync(imagePath);

if (!stat.isFile()) {
  throw new Error(`IMAGE_PATH is not a file: ${imagePath}`);
}

const client = createOpenAIClient();
const model = getOpenAIDefaultVisionModel();
let uploadedFileId: string | undefined;

try {
  // Files API 先把本地图片上传到 OpenAI，再在 Responses API 中用 file_id 引用。
  const file = await client.files.create({
    file: fs.createReadStream(imagePath),
    purpose: "vision"
  });

  uploadedFileId = file.id;

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "请解析这张本地上传图片的主要内容，并列出你能确定的关键信息。"
          },
          {
            type: "input_image",
            file_id: file.id,
            detail: "auto"
          }
        ]
      }
    ]
  });

  console.log(`[openai/${model}]`);
  console.log(`uploaded file_id: ${file.id}`);
  console.log(response.output_text);
} finally {
  if (uploadedFileId) {
    await client.files.delete(uploadedFileId).catch((error: unknown) => {
      console.warn(`Failed to delete uploaded file ${uploadedFileId}:`, error);
    });
  }
}
