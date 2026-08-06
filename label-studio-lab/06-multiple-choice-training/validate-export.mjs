#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const materialDirectory = dirname(fileURLToPath(import.meta.url));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const sourceTasks = readJson(
  resolve(materialDirectory, "multiple-choice-tasks.json"),
);
const answerKey = readJson(resolve(materialDirectory, "answer-key.json"));
const labelMap = readJson(resolve(materialDirectory, "label-map.json"));

const expectedById = new Map(
  answerKey.answers.map((answer) => [answer.question_id, answer]),
);
const allowedAnswers = new Set(labelMap.labels.map((label) => label.code));
const splits = ["train", "validation", "test"];

function buildSelfTestExport() {
  return sourceTasks.map((task, index) => {
    const expected = expectedById.get(task.data.question_id);

    return {
      id: index + 1,
      data: task.data,
      annotations: [
        {
          result: [
            {
              from_name: "answer",
              to_name: "question",
              type: "choices",
              value: { choices: [expected.answer] },
            },
          ],
        },
      ],
    };
  });
}

function loadExport(argument) {
  if (argument === "--self-test") {
    return buildSelfTestExport();
  }

  return readJson(resolve(process.cwd(), argument));
}

function activeAnnotations(task) {
  if (!Array.isArray(task.annotations)) {
    return [];
  }

  return task.annotations.filter(
    (annotation) =>
      annotation.was_cancelled !== true && annotation.cancelled !== true,
  );
}

function readChoice(task, questionId, errors) {
  const annotations = activeAnnotations(task);
  if (annotations.length !== 1) {
    errors.push(
      `${questionId}：需要恰好一个有效标注，实际为 ${annotations.length} 个`,
    );
    return null;
  }

  const results = (annotations[0].result || []).filter(
    (result) =>
      result.from_name === "answer" &&
      result.to_name === "question" &&
      result.type === "choices",
  );

  if (results.length !== 1) {
    errors.push(
      `${questionId}：需要恰好一个 answer choices 结果，实际为 ${results.length} 个`,
    );
    return null;
  }

  const choices = results[0]?.value?.choices;
  if (!Array.isArray(choices) || choices.length !== 1) {
    errors.push(`${questionId}：答案必须是单选结果`);
    return null;
  }

  return choices[0];
}

function validate(exportedTasks) {
  const errors = [];
  const seenIds = new Set();
  const answerCounts = new Map([...allowedAnswers].map((answer) => [answer, 0]));
  const splitCounts = new Map(splits.map((split) => [split, 0]));

  if (!Array.isArray(exportedTasks)) {
    return { errors: ["导出文件的最外层必须是任务数组"], answerCounts, splitCounts };
  }

  for (const [index, task] of exportedTasks.entries()) {
    const questionId = task?.data?.question_id;
    const location = questionId || `第 ${index + 1} 条任务`;

    if (typeof questionId !== "string" || questionId.length === 0) {
      errors.push(`${location}：缺少 data.question_id`);
      continue;
    }
    if (seenIds.has(questionId)) {
      errors.push(`${questionId}：question_id 重复`);
      continue;
    }
    seenIds.add(questionId);

    const expected = expectedById.get(questionId);
    if (!expected) {
      errors.push(`${questionId}：不是本案例的预期任务`);
    }

    if (typeof task?.data?.question !== "string" || task.data.question.length === 0) {
      errors.push(`${questionId}：缺少 data.question`);
    }

    const optionValues = Array.isArray(task?.data?.options)
      ? task.data.options.map((option) => option?.value)
      : [];
    if (
      optionValues.length !== allowedAnswers.size ||
      [...allowedAnswers].some((answer) => !optionValues.includes(answer))
    ) {
      errors.push(`${questionId}：data.options 必须完整包含 A、B、C、D`);
    }

    const split = task?.data?.split;
    if (!splits.includes(split)) {
      errors.push(`${questionId}：未知数据集切分“${split}”`);
    } else {
      splitCounts.set(split, splitCounts.get(split) + 1);
    }

    if (expected && expected.split !== split) {
      errors.push(
        `${questionId}：切分为“${split}”，参考切分为“${expected.split}”`,
      );
    }

    const actualAnswer = readChoice(task, questionId, errors);
    if (actualAnswer === null) {
      continue;
    }
    if (!allowedAnswers.has(actualAnswer)) {
      errors.push(`${questionId}：未知答案“${actualAnswer}”`);
      continue;
    }

    answerCounts.set(actualAnswer, answerCounts.get(actualAnswer) + 1);
    if (expected && expected.answer !== actualAnswer) {
      errors.push(
        `${questionId}：标注为“${actualAnswer}”，参考答案为“${expected.answer}”（${expected.rationale}）`,
      );
    }
  }

  for (const questionId of expectedById.keys()) {
    if (!seenIds.has(questionId)) {
      errors.push(`${questionId}：导出结果中缺少该任务`);
    }
  }

  return { errors, answerCounts, splitCounts };
}

const argument = process.argv[2];
if (!argument) {
  console.error("用法：node validate-export.mjs <export.json>");
  console.error("自测：node validate-export.mjs --self-test");
  process.exit(2);
}

let exportedTasks;
try {
  exportedTasks = loadExport(argument);
} catch (error) {
  console.error(`无法读取导出文件：${error.message}`);
  process.exit(2);
}

const { errors, answerCounts, splitCounts } = validate(exportedTasks);

console.log(`题目数量：${Array.isArray(exportedTasks) ? exportedTasks.length : 0}`);
console.log(
  `数据集切分：train=${splitCounts.get("train")}，validation=${splitCounts.get("validation")}，test=${splitCounts.get("test")}`,
);
console.log(
  `答案位置：A=${answerCounts.get("A")}，B=${answerCounts.get("B")}，C=${answerCounts.get("C")}，D=${answerCounts.get("D")}`,
);

if (errors.length > 0) {
  console.error(`\n发现 ${errors.length} 个问题：`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  argument === "--self-test"
    ? "\n材料自测通过。"
    : "\n导出结果结构正确，并与参考答案一致。",
);
