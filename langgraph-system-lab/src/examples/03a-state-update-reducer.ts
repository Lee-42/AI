import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  END,
  MessagesValue,
  ReducedValue,
  START,
  StateGraph,
  StateSchema
} from "@langchain/langgraph";
import { z } from "zod";

const TaskState = new StateSchema({
  task: z.string(),
  status: z.string().default("pending"),
  completedSteps: new ReducedValue(z.number().default(0), {
    reducer: (current, increment) => current + increment
  }),
  history: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.string(),
      reducer: (current, step) => [...current, step]
    }
  )
});

const validateTask: typeof TaskState.Node = (state) => {
  console.log("validate_task sees:", state);

  return {
    status: "validated",
    completedSteps: 1,
    history: "validate_task"
  };
};

const executeTask: typeof TaskState.Node = (state) => {
  console.log("execute_task sees:", state);

  return {
    status: "completed",
    completedSteps: 1,
    history: "execute_task"
  };
};

const taskGraph = new StateGraph(TaskState)
  .addNode("validate_task", validateTask)
  .addNode("execute_task", executeTask)
  .addEdge(START, "validate_task")
  .addEdge("validate_task", "execute_task")
  .addEdge("execute_task", END)
  .compile();

const ConversationState = new StateSchema({
  messages: MessagesValue
});

const writeDraft: typeof ConversationState.Node = () => {
  return {
    messages: [
      new AIMessage({
        id: "assistant-reply",
        content: "（草稿）你好，我收到了你的消息。"
      })
    ]
  };
};

const reviseDraft: typeof ConversationState.Node = (state) => {
  console.log(
    "revise_draft sees last message:",
    state.messages.at(-1)?.content
  );

  return {
    messages: [
      new AIMessage({
        id: "assistant-reply",
        content: "你好！我已经收到你的消息。"
      })
    ]
  };
};

const conversationGraph = new StateGraph(ConversationState)
  .addNode("write_draft", writeDraft)
  .addNode("revise_draft", reviseDraft)
  .addEdge(START, "write_draft")
  .addEdge("write_draft", "revise_draft")
  .addEdge("revise_draft", END)
  .compile();

async function runCustomReducerDemo() {
  const input = {
    task: "学习 State 更新规则"
  };
  const result = await taskGraph.invoke(input);

  console.log("\n=== Demo 1: 普通字段与自定义 reducer ===");
  console.log("Graph: START -> validate_task -> execute_task -> END");
  console.log("Input:", input);
  console.log("Final state:", result);
  console.log("status: 后写入的 completed 覆盖 validated");
  console.log("completedSteps: 0 + 1 + 1 =", result.completedSteps);
  console.log("history: reducer 累积为", result.history);
}

async function runMessagesValueDemo() {
  const input = {
    messages: [
      new HumanMessage({
        id: "user-message",
        content: "你好"
      })
    ]
  };
  const result = await conversationGraph.invoke(input);

  console.log("\n=== Demo 2: MessagesValue 的消息 reducer ===");
  console.log("Graph: START -> write_draft -> revise_draft -> END");
  console.log(
    "Final messages:",
    result.messages.map((message) => ({
      id: message.id,
      type: message.getType(),
      content: message.content
    }))
  );
  console.log("Message count:", result.messages.length);
  console.log("相同 id 的修订会替换原消息，因此最终不是 3 条，而是 2 条。");
}

async function main() {
  await runCustomReducerDemo();
  await runMessagesValueDemo();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
