import { HumanMessage } from "@langchain/core/messages";
import { END, MessagesValue, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { getActiveModelConfig } from "../config.js";
import { createChatModel, requireActiveModelConfig } from "../provider.js";

const ChatState = new StateSchema({
  messages: MessagesValue
});

function createGraph() {
  const activeModel = requireActiveModelConfig();
  const model = createChatModel(activeModel);

  const callModel: typeof ChatState.Node = async (state) => {
    const response = await model.invoke(state.messages);

    return {
      messages: [response]
    };
  };

  return new StateGraph(ChatState)
    .addNode("call_model", callModel)
    .addEdge(START, "call_model")
    .addEdge("call_model", END)
    .compile();
}

async function main() {
  const activeModel = getActiveModelConfig();

  if (!activeModel.apiKey) {
    console.log(`Missing ${activeModel.apiKeyName}.`);
    console.log(`Copy .env.example to .env and set ${activeModel.apiKeyName} before running this example.`);
    return;
  }

  console.log(`Provider: ${activeModel.provider}`);
  console.log(`Model: ${activeModel.model}`);
  console.log("Graph: START -> call_model -> END");

  const graph = createGraph();
  const result = await graph.invoke({
    messages: [new HumanMessage("请用一句话解释 LangGraph 是什么。")]
  });

  console.log("Answer:", result.messages.at(-1)?.content);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
