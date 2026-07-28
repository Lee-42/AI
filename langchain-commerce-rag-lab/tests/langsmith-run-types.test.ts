import assert from "node:assert/strict";
import test from "node:test";
import {
  createRunTypeDemo,
  RUN_TYPE_CATALOG
} from "../src/observability/run-type-demo.js";

test("catalog contains every supported LangSmith run type once", () => {
  const types = RUN_TYPE_CATALOG.map((item) => item.type);

  assert.deepEqual(types, [
    "chain",
    "llm",
    "embedding",
    "prompt",
    "tool",
    "retriever",
    "parser"
  ]);
  assert.equal(new Set(types).size, types.length);
});

test("offline run type demo produces a structured answer", async () => {
  const runDemo = createRunTypeDemo({ tracingEnabled: false });
  const result = await runDemo({
    question: "推荐轻薄电脑"
  });

  assert.equal(result.answer, "推荐 Aurora Air 14，适合移动办公。");
  assert.deepEqual(result.citedSkus, ["LAPTOP-AIR-14"]);
  assert.equal(result.observedRunTypes.length, 7);
});
