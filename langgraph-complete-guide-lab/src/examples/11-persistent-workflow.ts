import assert from "node:assert/strict";
import {
  END,
  InMemoryStore,
  MemorySaver,
  START,
  StateGraph,
  StateSchema,
  type GraphNode
} from "@langchain/langgraph";
import { z } from "zod";

const WorkflowState = new StateSchema({
  action: z.enum(["save", "recall"]),
  preference: z.string().default(""),
  reply: z.string().default("")
});

const ContextSchema = z.object({
  userId: z.string().min(1)
});
type RuntimeContext = z.infer<typeof ContextSchema>;

const handlePreference: GraphNode<
  typeof WorkflowState,
  RuntimeContext
> = async (state, runtime) => {
  const userId = runtime.context?.userId;

  if (!userId || !runtime.store) {
    throw new Error("userId and store are required");
  }

  const namespace = ["users", userId, "preferences"];
  const key = "response-style";

  if (state.action === "save") {
    await runtime.store.put(namespace, key, {
      preference: state.preference
    });

    return { reply: `已记住：${state.preference}` };
  }

  const item = await runtime.store.get(namespace, key);
  const preference = item?.value.preference;

  return {
    reply:
      typeof preference === "string"
        ? `读取到长期记忆：${preference}`
        : "没有找到长期记忆"
  };
};

const store = new InMemoryStore();
const checkpointer = new MemorySaver();

const graph = new StateGraph(WorkflowState, ContextSchema)
  .addNode("handle_preference", handlePreference)
  .addEdge(START, "handle_preference")
  .addEdge("handle_preference", END)
  .compile({ checkpointer, store });

async function main() {
  const userContext = { userId: "user-42" };

  const saved = await graph.invoke(
    { action: "save", preference: "回答保持简洁" },
    {
      configurable: { thread_id: "thread-1" },
      context: userContext
    }
  );

  const recalled = await graph.invoke(
    { action: "recall" },
    {
      configurable: { thread_id: "thread-2" },
      context: userContext
    }
  );

  assert.equal(saved.reply, "已记住：回答保持简洁");
  assert.equal(recalled.reply, "读取到长期记忆：回答保持简洁");

  console.log("thread-1:", saved.reply);
  console.log("thread-2:", recalled.reply);
  console.log("\nSame user + different threads -> shared Store memory");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
