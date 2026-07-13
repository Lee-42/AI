import { generateText, getActiveProviderName } from "../llm/client.js";

const provider = getActiveProviderName();

const originalTask = [
  "请写一段课程讲义，主题是“续写模式的应用场景”。",
  "结构包含：1. 为什么需要续写；2. 典型场景；3. 后端设计要点。",
  "要求使用中文，面向 AI 应用开发初学者，表达清晰。"
].join("\n");

// 第一次请求故意把输出 token 限制得很小，用来模拟“模型还没写完就被截断”。
const firstResponse = await generateText({
  temperature: 0.2,
  maxOutputTokens: 120,
  messages: [
    {
      role: "system",
      content: "你是一个 AI 应用开发课程讲师，适合用工程化视角讲清楚概念。"
    },
    {
      role: "user",
      content: originalTask
    }
  ]
});

const partialContent = firstResponse.text.trim();

// 第二次请求才是续写模式的关键：带上原始任务、已有输出和明确的续写规则。
const continuationResponse = await generateText({
  temperature: 0.2,
  maxOutputTokens: 260,
  messages: [
    {
      role: "system",
      content: [
        "你是一个 AI 应用开发课程讲师。",
        "用户会给你原始任务和一段未完成的已有输出。",
        "你只负责从已有输出后面继续写，不要重复已有内容。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "原始任务：",
        originalTask,
        "",
        "已有输出：",
        partialContent,
        "",
        "续写要求：",
        "1. 只输出新增内容，不要重复“已有输出”。",
        "2. 从已有输出的最后一句或最后一个小标题后自然接上。",
        "3. 保持同样的语气、标题层级和课程讲义风格。",
        "4. 如果已有输出停在半句话中间，先补完这句话。"
      ].join("\n")
    }
  ]
});

const continuedContent = continuationResponse.text.trim();
const fullContent = [partialContent, continuedContent].filter(Boolean).join("\n");

console.log(`[${provider}/${firstResponse.model}]`);
console.log("\n--- 第一次生成：可能被截断的内容 ---\n");
console.log(partialContent);

console.log("\n--- 第二次生成：只续写新增内容 ---\n");
console.log(continuedContent);

console.log("\n--- 合并后的完整内容 ---\n");
console.log(fullContent);
