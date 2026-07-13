import { z } from "zod";
import { generateJsonText, getActiveProviderName } from "../llm/client.js";

const LessonPlanSchema = z
  .object({
    title: z.string(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    learning_goal: z.string(),
    estimated_minutes: z.number().int().positive(),
    prerequisites: z.array(z.string()),
    exercises: z.array(
      z
        .object({
          type: z.enum(["quiz", "coding", "discussion"]),
          prompt: z.string(),
          acceptance_criteria: z.array(z.string())
        })
        .strict()
    )
  })
  .strict();

const lessonPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "difficulty",
    "learning_goal",
    "estimated_minutes",
    "prerequisites",
    "exercises"
  ],
  properties: {
    title: {
      type: "string",
      description: "课程小节标题"
    },
    difficulty: {
      type: "string",
      enum: ["easy", "medium", "hard"],
      description: "课程难度"
    },
    learning_goal: {
      type: "string",
      description: "学完这一节后，学生应该掌握的核心目标"
    },
    estimated_minutes: {
      type: "integer",
      description: "预计学习分钟数"
    },
    prerequisites: {
      type: "array",
      description: "学习这一节前最好已经了解的知识点",
      items: {
        type: "string"
      }
    },
    exercises: {
      type: "array",
      description: "配套练习",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "prompt", "acceptance_criteria"],
        properties: {
          type: {
            type: "string",
            enum: ["quiz", "coding", "discussion"],
            description: "练习类型"
          },
          prompt: {
            type: "string",
            description: "练习题目"
          },
          acceptance_criteria: {
            type: "array",
            description: "判断练习是否完成的标准",
            items: {
              type: "string"
            }
          }
        }
      }
    }
  }
};

const provider = getActiveProviderName();

const response = await generateJsonText({
  schemaName: "lesson_plan",
  jsonSchema: lessonPlanJsonSchema,
  temperature: 0.2,
  messages: [
    {
      role: "system",
      content: [
        "你是一个 AI 应用开发课程助教。",
        "你必须根据给定 JSON Schema 输出合法 JSON。",
        "不要输出 Markdown、解释文字或代码块。"
      ].join("\n")
    },
    {
      role: "user",
      content: "为“使用 JSON Schema 进行格式化输出”设计一个课程小节学习计划。"
    }
  ]
});

const parsed = LessonPlanSchema.parse(JSON.parse(response.text));

console.log(`[${provider}/${response.model}]`);
console.log(JSON.stringify(parsed, null, 2));
