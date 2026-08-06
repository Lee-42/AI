#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const materialDirectory = dirname(fileURLToPath(import.meta.url));
const coordinateTolerance = 5;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const sourceTasks = readJson(resolve(materialDirectory, "image-tasks.json"));
const answerKey = readJson(resolve(materialDirectory, "answer-key.json"));
const labelMap = readJson(resolve(materialDirectory, "label-map.json"));

const expectedByImageId = new Map(
  answerKey.images.map((image) => [image.image_id, image]),
);
const labelOrder = labelMap.labels.map((label) => label.display);
const allowedLabels = new Set(labelOrder);

function buildSelfTestExport() {
  return sourceTasks.map((task, taskIndex) => {
    const expected = expectedByImageId.get(task.data.image_id);
    return {
      id: taskIndex + 1,
      data: task.data,
      annotations: [
        {
          result: expected.objects.map((object, objectIndex) => ({
            id: `${task.data.image_id}-${objectIndex + 1}`,
            from_name: "objects",
            to_name: "image",
            type: "rectanglelabels",
            original_width: answerKey.coordinate_system.image_width,
            original_height: answerKey.coordinate_system.image_height,
            image_rotation: 0,
            value: {
              ...object.bbox_percent,
              rotation: 0,
              rectanglelabels: [object.label],
            },
          })),
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

function rectangleResults(annotation) {
  return (annotation.result || []).filter(
    (result) =>
      result.from_name === "objects" &&
      result.to_name === "image" &&
      result.type === "rectanglelabels",
  );
}

function resultLabel(result) {
  const labels = result?.value?.rectanglelabels;
  return Array.isArray(labels) && labels.length === 1 ? labels[0] : null;
}

function coordinateDelta(result, expected) {
  return Math.max(
    Math.abs(result.value.x - expected.bbox_percent.x),
    Math.abs(result.value.y - expected.bbox_percent.y),
    Math.abs(result.value.width - expected.bbox_percent.width),
    Math.abs(result.value.height - expected.bbox_percent.height),
  );
}

function validateCoordinates(result) {
  const keys = ["x", "y", "width", "height"];
  return keys.every(
    (key) =>
      Number.isFinite(result?.value?.[key]) &&
      result.value[key] >= 0 &&
      result.value[key] <= 100,
  );
}

function matchExpectedObjects(imageId, results, expectedObjects, errors) {
  const unusedResults = new Set(results.map((_, index) => index));

  for (const expected of expectedObjects) {
    const candidates = [...unusedResults]
      .filter((index) => resultLabel(results[index]) === expected.label)
      .map((index) => ({
        index,
        delta: coordinateDelta(results[index], expected),
      }))
      .sort((left, right) => left.delta - right.delta);

    if (candidates.length === 0) {
      errors.push(`${imageId}：缺少“${expected.label}”目标`);
      continue;
    }

    const best = candidates[0];
    unusedResults.delete(best.index);

    if (best.delta > coordinateTolerance) {
      errors.push(
        `${imageId}：“${expected.label}”框与参考边界最大偏差为 ${best.delta.toFixed(2)} 个百分点，超过 ${coordinateTolerance}`,
      );
    }
  }

  for (const index of unusedResults) {
    errors.push(
      `${imageId}：存在多余的“${resultLabel(results[index]) || "未知"}”矩形框`,
    );
  }
}

function validate(exportedTasks) {
  const errors = [];
  const seenImageIds = new Set();
  const labelCounts = new Map(labelOrder.map((label) => [label, 0]));

  if (!Array.isArray(exportedTasks)) {
    return {
      errors: ["导出文件的最外层必须是任务数组"],
      labelCounts,
      rectangleCount: 0,
    };
  }

  let rectangleCount = 0;

  for (const [taskIndex, task] of exportedTasks.entries()) {
    const imageId = task?.data?.image_id;
    const location = imageId || `第 ${taskIndex + 1} 条任务`;

    if (typeof imageId !== "string" || imageId.length === 0) {
      errors.push(`${location}：缺少 data.image_id`);
      continue;
    }
    if (seenImageIds.has(imageId)) {
      errors.push(`${imageId}：image_id 重复`);
      continue;
    }
    seenImageIds.add(imageId);

    const expected = expectedByImageId.get(imageId);
    if (!expected) {
      errors.push(`${imageId}：不是本案例的预期图片`);
      continue;
    }

    const annotations = activeAnnotations(task);
    if (annotations.length !== 1) {
      errors.push(
        `${imageId}：需要恰好一个有效标注，实际为 ${annotations.length} 个`,
      );
      continue;
    }

    const results = rectangleResults(annotations[0]);
    rectangleCount += results.length;

    for (const result of results) {
      const label = resultLabel(result);
      if (!label || !allowedLabels.has(label)) {
        errors.push(`${imageId}：存在空标签或未知矩形框标签`);
        continue;
      }
      if (!validateCoordinates(result)) {
        errors.push(`${imageId}：“${label}”框坐标无效`);
        continue;
      }
      labelCounts.set(label, labelCounts.get(label) + 1);
    }

    matchExpectedObjects(imageId, results, expected.objects, errors);
  }

  for (const imageId of expectedByImageId.keys()) {
    if (!seenImageIds.has(imageId)) {
      errors.push(`${imageId}：导出结果中缺少该图片任务`);
    }
  }

  return { errors, labelCounts, rectangleCount };
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

const { errors, labelCounts, rectangleCount } = validate(exportedTasks);

console.log(`图片数量：${Array.isArray(exportedTasks) ? exportedTasks.length : 0}`);
console.log(`矩形框数量：${rectangleCount}`);
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
    : "\n导出结果结构正确，并处于参考框容差范围内。",
);
