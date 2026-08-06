#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const materialDirectory = dirname(fileURLToPath(import.meta.url));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const sourceTasks = readJson(resolve(materialDirectory, "ecommerce-reviews.json"));
const answerKey = readJson(resolve(materialDirectory, "answer-key.json"));
const labelMap = readJson(resolve(materialDirectory, "label-map.json"));

const expectedById = new Map(
  answerKey.answers.map((answer) => [answer.review_id, answer]),
);
const allowedLabels = new Set(labelMap.labels.map((label) => label.display));
const labelOrder = labelMap.labels.map((label) => label.display);

function buildSelfTestExport() {
  return sourceTasks.map((task, index) => {
    const answer = expectedById.get(task.data.review_id);

    return {
      id: index + 1,
      data: task.data,
      annotations: [
        {
          result: [
            {
              from_name: "sentiment",
              to_name: "review",
              type: "choices",
              value: {
                choices: [answer.label],
              },
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

function validate(exportedTasks) {
  const errors = [];
  const seenIds = new Set();
  const labelCounts = new Map(labelOrder.map((label) => [label, 0]));

  if (!Array.isArray(exportedTasks)) {
    return {
      errors: ["导出文件的最外层必须是任务数组"],
      labelCounts,
    };
  }

  for (const [index, task] of exportedTasks.entries()) {
    const reviewId = task?.data?.review_id;
    const location = reviewId || `第 ${index + 1} 条任务`;

    if (typeof reviewId !== "string" || reviewId.length === 0) {
      errors.push(`${location}：缺少 data.review_id`);
      continue;
    }

    if (seenIds.has(reviewId)) {
      errors.push(`${reviewId}：review_id 重复`);
      continue;
    }
    seenIds.add(reviewId);

    if (!expectedById.has(reviewId)) {
      errors.push(`${reviewId}：不是本案例的预期任务`);
    }

    if (typeof task?.data?.text !== "string" || task.data.text.length === 0) {
      errors.push(`${reviewId}：缺少 data.text`);
    }

    const annotations = activeAnnotations(task);
    if (annotations.length !== 1) {
      errors.push(
        `${reviewId}：需要恰好一个有效标注，实际为 ${annotations.length} 个`,
      );
      continue;
    }

    const sentimentResults = (annotations[0].result || []).filter(
      (result) =>
        result.from_name === "sentiment" &&
        result.to_name === "review" &&
        result.type === "choices",
    );

    if (sentimentResults.length !== 1) {
      errors.push(
        `${reviewId}：需要恰好一个 sentiment choices 结果，实际为 ${sentimentResults.length} 个`,
      );
      continue;
    }

    const choices = sentimentResults[0]?.value?.choices;
    if (!Array.isArray(choices) || choices.length !== 1) {
      errors.push(`${reviewId}：情绪标签必须是单选结果`);
      continue;
    }

    const actualLabel = choices[0];
    if (!allowedLabels.has(actualLabel)) {
      errors.push(`${reviewId}：未知标签“${actualLabel}”`);
      continue;
    }

    labelCounts.set(actualLabel, labelCounts.get(actualLabel) + 1);

    const expected = expectedById.get(reviewId);
    if (expected && expected.label !== actualLabel) {
      errors.push(
        `${reviewId}：标注为“${actualLabel}”，参考答案为“${expected.label}”（${expected.rationale}）`,
      );
    }
  }

  for (const reviewId of expectedById.keys()) {
    if (!seenIds.has(reviewId)) {
      errors.push(`${reviewId}：导出结果中缺少该任务`);
    }
  }

  return { errors, labelCounts };
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

const { errors, labelCounts } = validate(exportedTasks);

console.log(`任务数量：${Array.isArray(exportedTasks) ? exportedTasks.length : 0}`);
for (const label of labelOrder) {
  console.log(`${label}：${labelCounts.get(label)}`);
}

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
