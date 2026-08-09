import assert from "node:assert/strict";
import test from "node:test";
import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { FakeToolCallingModel } from "langchain";
import { z } from "zod";
import {
  createLargeTeachingLog,
  findOffloadedPaths,
  getToolObservations,
  TARGET_INCIDENT_CODE,
  TARGET_LINE_NUMBER,
  TARGET_ORDER_ID,
  TARGET_TRACE_ID
} from "../src/offload.js";

test("teaching log is large and hides the target beyond the preview", () => {
  const log = createLargeTeachingLog();
  const lines = log.split("\n");

  assert.ok(log.length > 80_000);
  assert.equal(lines.length, 5_000);
  assert.doesNotMatch(lines.slice(0, 10).join("\n"), new RegExp(TARGET_ORDER_ID));

  const targetLine = lines[TARGET_LINE_NUMBER - 1];
  assert.match(targetLine ?? "", new RegExp(TARGET_ORDER_ID));
  assert.match(targetLine ?? "", new RegExp(TARGET_INCIDENT_CODE));
  assert.match(targetLine ?? "", new RegExp(TARGET_TRACE_ID));
});

test("createLargeTeachingLog rejects a log without the target line", () => {
  assert.throws(
    () => createLargeTeachingLog(TARGET_LINE_NUMBER - 1),
    /lineCount must be at least/
  );
});

test("findOffloadedPaths only returns large tool result files", () => {
  assert.deepEqual(
    findOffloadedPaths({
      "/notes/report.md": { content: "report" },
      "/large_tool_results/tool-b.txt": { content: "b" },
      "/large_tool_results/tool-a.txt": { content: "a" }
    }),
    [
      "/large_tool_results/tool-a.txt",
      "/large_tool_results/tool-b.txt"
    ]
  );
});

test("getToolObservations extracts tool messages and text blocks", () => {
  assert.deepEqual(
    getToolObservations([
      { content: "user message" },
      {
        id: "tool-message-1",
        tool_call_id: "call-1",
        name: "grep",
        content: [
          { type: "text", text: "first match" },
          { type: "text", text: "second match" }
        ]
      }
    ]),
    [
      {
        id: "tool-message-1:call-1",
        name: "grep",
        content: "first match\nsecond match"
      }
    ]
  );
});

test("Deep Agent offloads a large tool result into StateBackend", async () => {
  const largeLog = createLargeTeachingLog();
  const loadLargeLog = tool(async () => largeLog, {
    name: "load_large_log",
    description: "Return a large teaching log.",
    schema: z.object({})
  });
  const model = new FakeToolCallingModel({
    toolCalls: [
      [{ name: "load_large_log", args: {}, id: "large-result-1" }],
      []
    ]
  });
  const agent = createDeepAgent({ model, tools: [loadLargeLog] });

  const result = await agent.invoke({
    messages: [{ role: "user", content: "Load the teaching log." }]
  });
  const paths = findOffloadedPaths(result.files);

  assert.deepEqual(paths, ["/large_tool_results/large-result-1.txt"]);
  assert.equal(result.files?.[paths[0] ?? ""]?.content, largeLog);

  const loadObservation = getToolObservations(result.messages).find(
    (observation) => observation.name === "load_large_log"
  );
  assert.match(loadObservation?.content ?? "", /result too large/i);
  assert.match(loadObservation?.content ?? "", /large-result-1\.txt/);
  assert.ok((loadObservation?.content.length ?? Infinity) < largeLog.length);
});
