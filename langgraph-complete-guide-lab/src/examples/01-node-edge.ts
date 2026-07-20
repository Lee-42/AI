import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

// State 是整张图共享的数据结构。
const GraphState = new StateSchema({
  name: z.string(),
  normalizedName: z.string().default(""),
  greeting: z.string().default("")
});

// Node 1：读取 name，只返回自己负责的局部 State 更新。
const normalizeName: typeof GraphState.Node = (state) => {
  console.log("[node] normalize_name");

  return {
    normalizedName: state.name.trim()
  };
};

// Node 2：能读取上一个 Node 已经写入 State 的 normalizedName。
const sayHello: typeof GraphState.Node = (state) => {
  console.log("[node] say_hello");

  return {
    greeting: `你好，${state.normalizedName}！`
  };
};

// Edge 决定 Node 的执行顺序。
const graph = new StateGraph(GraphState)
  .addNode("normalize_name", normalizeName)
  .addNode("say_hello", sayHello)
  .addEdge(START, "normalize_name")
  .addEdge("normalize_name", "say_hello")
  .addEdge("say_hello", END)
  .compile();

async function main() {
  const input = {
    name: "  LangGraph  "
  };

  console.log("Graph: START -> normalize_name -> say_hello -> END");
  console.log("Input:", input);

  const result = await graph.invoke(input);

  console.log("Result:", result);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
