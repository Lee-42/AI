#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const materialDirectory = dirname(fileURLToPath(import.meta.url));
const allowedSplits = new Set(["train", "validation", "test"]);
const allowedAnswers = new Set(["A", "B", "C", "D"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildSelfTestExport() {
  const tasks = readJson(resolve(materialDirectory, "multiple-choice-tasks.json"));
  const answerKey = readJson(resolve(materialDirectory, "answer-key.json"));
  const expectedById = new Map(
    answerKey.answers.map((answer) => [answer.question_id, answer.answer]),
  );

  return tasks.map((task, index) => ({
    id: index + 1,
    data: task.data,
    annotations: [
      {
        result: [
          {
            from_name: "answer",
            to_name: "question",
            type: "choices",
            value: {
              choices: [expectedById.get(task.data.question_id)],
            },
          },
        ],
      },
    ],
  }));
}

function loadTasks(argument) {
  if (argument === "--self-test") {
    return buildSelfTestExport();
  }

  return readJson(resolve(process.cwd(), argument));
}

function extractAnswer(task) {
  const annotations = Array.isArray(task.annotations)
    ? task.annotations.filter(
        (annotation) =>
          annotation.was_cancelled !== true && annotation.cancelled !== true,
      )
    : [];

  if (annotations.length !== 1) {
    throw new Error(
      `${task?.data?.question_id || "未知题目"}：需要恰好一个有效标注`,
    );
  }

  const results = (annotations[0].result || []).filter(
    (result) =>
      result.from_name === "answer" &&
      result.to_name === "question" &&
      result.type === "choices",
  );
  const choices = results[0]?.value?.choices;

  if (results.length !== 1 || !Array.isArray(choices) || choices.length !== 1) {
    throw new Error(
      `${task?.data?.question_id || "未知题目"}：缺少唯一的 answer choices 结果`,
    );
  }
  if (!allowedAnswers.has(choices[0])) {
    throw new Error(
      `${task?.data?.question_id || "未知题目"}：答案必须是 A、B、C 或 D`,
    );
  }

  return choices[0];
}

function formatUserMessage(data) {
  const optionTexts = data.option_texts;
  if (
    !optionTexts ||
    [...allowedAnswers].some((answer) => typeof optionTexts[answer] !== "string")
  ) {
    throw new Error(`${data.question_id}：data.option_texts 不完整`);
  }

  return [
    `题目：${data.question}`,
    "选项：",
    ...[...allowedAnswers].map((answer) => `${answer}. ${optionTexts[answer]}`),
    "请只回答 A、B、C 或 D。",
  ].join("\n");
}

function convert(tasks, requestedSplit) {
  if (!Array.isArray(tasks)) {
    throw new Error("导出文件的最外层必须是任务数组");
  }

  const matchingTasks = tasks
    .filter((task) => task?.data?.split === requestedSplit)
    .sort((left, right) =>
      left.data.question_id.localeCompare(right.data.question_id),
    );

  return matchingTasks.map((task) => {
    const data = task.data;
    if (
      typeof data.question_id !== "string" ||
      typeof data.question !== "string" ||
      typeof data.knowledge_area !== "string"
    ) {
      throw new Error("任务缺少 question_id、question 或 knowledge_area");
    }

    return {
      messages: [
        {
          role: "system",
          content: "你是一个严谨的单项选择题助手。只输出正确选项的字母，不要解释。",
        },
        {
          role: "user",
          content: formatUserMessage(data),
        },
        {
          role: "assistant",
          content: extractAnswer(task),
        },
      ],
      metadata: {
        question_id: data.question_id,
        split: data.split,
        knowledge_area: data.knowledge_area,
        guideline_version: "1.0",
      },
    };
  });
}

const [inputArgument, requestedSplit] = process.argv.slice(2);
if (!inputArgument || !allowedSplits.has(requestedSplit)) {
  console.error(
    "用法：node convert-export-to-sft.mjs <export.json|--self-test> <train|validation|test>",
  );
  process.exit(2);
}

try {
  const tasks = loadTasks(inputArgument);
  const samples = convert(tasks, requestedSplit);

  for (const sample of samples) {
    process.stdout.write(`${JSON.stringify(sample)}\n`);
  }
  console.error(`已转换 ${samples.length} 条 ${requestedSplit} 样本。`);
} catch (error) {
  console.error(`转换失败：${error.message}`);
  process.exit(1);
}
