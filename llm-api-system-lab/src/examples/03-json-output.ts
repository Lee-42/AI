import { z } from "zod";
import { generateJsonText, getActiveProviderName } from "../llm/client.js";

// 本例演示 LLM 的结构化输出能力：让自然语言模型按固定 JSON 结构返回数据。
// zod 负责运行时校验，避免业务代码直接信任模型输出。
const CoursePointSchema = z.object({
  title: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  key_points: z.array(z.string()).min(3).max(6)
});

// JSON Schema 负责约束模型生成格式，是“让模型按规则输出”的关键。
const coursePointJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "difficulty", "key_points"],
  properties: {
    title: { type: "string" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    key_points: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string" }
    }
  }
};

const provider = getActiveProviderName();

// generateJsonText 会在不同供应商下选择合适的结构化输出策略。
const response = await generateJsonText({
  schemaName: "course_point",
  jsonSchema: coursePointJsonSchema,
  messages: [
    {
      role: "system",
      content: "你是一个 AI 应用开发课程助教，只输出 JSON，不要输出 Markdown。"
    },
    {
      role: "user",
      content: "把“LLM API 系统设计”整理成一个课程知识点对象。"
    }
  ]
});

// 模型输出必须先解析并校验，通过后才能进入业务流程。
const parsed = CoursePointSchema.parse(JSON.parse(response.text));

console.log(`[${provider}/${response.model}]`);
console.log(parsed);
