import assert from "node:assert/strict";
import test from "node:test";
import { createDeepAgent } from "deepagents";
import { FakeToolCallingModel, todoListMiddleware } from "langchain";
import {
  extractLastMessageText,
  formatTodos,
  readVirtualTextFile,
  TodoProgressReporter
} from "../src/planning.js";

const INITIAL_TODOS = [
  { content: "读取数据", status: "in_progress" as const },
  { content: "生成报告", status: "pending" as const }
];

test("formatTodos renders all three pieces of todo state", () => {
  const output = formatTodos(INITIAL_TODOS);

  assert.match(output, /1\. ◉ \[in_progress\] 读取数据/);
  assert.match(output, /2\. ○ \[pending\] 生成报告/);
});

test("TodoProgressReporter only emits when the full list changes", () => {
  const reporter = new TodoProgressReporter();

  assert.ok(reporter.render(INITIAL_TODOS));
  assert.equal(reporter.render(INITIAL_TODOS), undefined);
  assert.ok(
    reporter.render([
      { content: "读取数据", status: "completed" },
      { content: "生成报告", status: "in_progress" }
    ])
  );
});

test("readVirtualTextFile supports current and legacy text storage", () => {
  assert.equal(
    readVirtualTextFile(
      { "/report.md": { content: "# current" } },
      "/report.md"
    ),
    "# current"
  );
  assert.equal(
    readVirtualTextFile(
      { "/legacy.md": { content: ["# legacy", "content"] } },
      "/legacy.md"
    ),
    "# legacy\ncontent"
  );
  assert.equal(
    readVirtualTextFile(
      { "/image.png": { content: new Uint8Array([1, 2, 3]) } },
      "/image.png"
    ),
    undefined
  );
});

test("extractLastMessageText handles string and text-block content", () => {
  assert.equal(
    extractLastMessageText([{ content: "第一条" }, { content: "最终回复" }]),
    "最终回复"
  );
  assert.equal(
    extractLastMessageText([
      {
        content: [
          { type: "text", text: "第一段" },
          { type: "reasoning", reasoning: "hidden" },
          { type: "text", text: "第二段" }
        ]
      }
    ]),
    "第一段\n第二段"
  );
});

test("Deep Agent persists write_todos updates in agent state", async () => {
  const model = new FakeToolCallingModel({
    toolCalls: [
      [
        {
          name: "write_todos",
          args: {
            todos: [
              { content: "读取数据", status: "in_progress" },
              { content: "生成报告", status: "pending" }
            ]
          },
          id: "todo-1"
        }
      ],
      [
        {
          name: "write_todos",
          args: {
            todos: [
              { content: "读取数据", status: "completed" },
              { content: "生成报告", status: "completed" }
            ]
          },
          id: "todo-2"
        }
      ],
      []
    ]
  });

  const agent = createDeepAgent({
    model,
    middleware: [todoListMiddleware()]
  });
  const result = await agent.invoke({
    messages: [{ role: "user", content: "完成两步教学任务" }]
  });

  assert.deepEqual(result.todos, [
    { content: "读取数据", status: "completed" },
    { content: "生成报告", status: "completed" }
  ]);
});
