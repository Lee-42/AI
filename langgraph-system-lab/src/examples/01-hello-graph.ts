import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const HelloState = new StateSchema({
  name: z.string(),
  greeting: z.string().default("")
});

const sayHello: typeof HelloState.Node = (state) => {
  return {
    greeting: `${state.name}你好`
  };
};

const graph = new StateGraph(HelloState)
  .addNode("say_hello", sayHello)
  .addEdge(START, "say_hello")
  .addEdge("say_hello", END)
  .compile();

async function main() {
  const input = {
    name: "LangGraph"
  };

  const result = await graph.invoke(input);

  console.log("Graph: START -> say_hello -> END");
  console.log("Input:", input);
  console.log("Result:", result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
