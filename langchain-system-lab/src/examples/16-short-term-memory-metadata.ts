import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  END,
  MemorySaver,
  MessagesValue,
  START,
  StateGraph,
  StateSchema,
  type StateSnapshot
} from "@langchain/langgraph";
import { z } from "zod";

const ShortTermMemoryState = new StateSchema({
  messages: MessagesValue,
  userName: z.string().default(""),
  turnCount: z.number().default(0)
});

function messageText(content: HumanMessage["content"]) {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function findName(text: string) {
  return text.match(/我叫(?!什么)\s*([^，。！？\s]+)/)?.[1];
}

const memoryAgentNode: typeof ShortTermMemoryState.Node = (state) => {
  const latestHumanMessage = [...state.messages].reverse().find(HumanMessage.isInstance);
  const input = latestHumanMessage ? messageText(latestHumanMessage.content) : "";
  const userName = findName(input) ?? state.userName;

  const reply = input.includes("叫什么名字")
    ? userName
      ? `你叫${userName}。这是我从当前 thread 的 state 中读到的。`
      : "我还不知道你的名字。"
    : userName
      ? `你好，${userName}。我已经把名字写入当前 thread 的 state。`
      : "你好，我还不知道你的名字。";

  return {
    messages: [new AIMessage(reply)],
    userName,
    turnCount: state.turnCount + 1
  };
};

const checkpointer = new MemorySaver();

const graph = new StateGraph(ShortTermMemoryState)
  .addNode("memory_agent", memoryAgentNode)
  .addEdge(START, "memory_agent")
  .addEdge("memory_agent", END)
  .compile({ checkpointer });

const threadConfig = {
  configurable: {
    thread_id: "course-thread-001"
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeWrites(writes: unknown) {
  if (!isRecord(writes)) {
    return "当前版本未提供";
  }

  return Object.keys(writes).join(", ") || "无节点写入";
}

function printMetadata(label: string, snapshot: StateSnapshot) {
  const metadata = snapshot.metadata as Record<string, unknown> | undefined;
  const values = snapshot.values as typeof ShortTermMemoryState.State;

  console.log(`\n## ${label}`);
  console.log(`state.userName: ${values.userName}`);
  console.log(`state.turnCount: ${values.turnCount}`);
  console.log(`state.messages.length: ${values.messages.length}`);
  console.log("checkpoint metadata:");
  console.log(
    JSON.stringify(
      {
        metadataKeys: Object.keys(metadata ?? {}),
        source: metadata?.source,
        step: metadata?.step,
        writesFromNodes: summarizeWrites(metadata?.writes),
        parents: metadata?.parents,
        threadId: metadata?.thread_id
      },
      null,
      2
    )
  );
}

async function printMetadataHistory() {
  const rows: Array<Record<string, unknown>> = [];

  for await (const snapshot of graph.getStateHistory(threadConfig)) {
    const metadata = snapshot.metadata as Record<string, unknown> | undefined;
    const values = snapshot.values as Partial<typeof ShortTermMemoryState.State>;

    rows.push({
      step: metadata?.step,
      source: metadata?.source,
      writesFromNodes: summarizeWrites(metadata?.writes),
      messageCount: values.messages?.length ?? 0,
      checkpointId: snapshot.config.configurable?.checkpoint_id
    });
  }

  console.log("\n## 当前 thread 的 checkpoint 历史（从新到旧）");
  console.table(rows);
}

async function main() {
  const firstResult = await graph.invoke(
    {
      messages: [new HumanMessage("你好，我叫小李。")]
    },
    threadConfig
  );

  console.log(`第一轮回答: ${firstResult.messages.at(-1)?.content}`);
  printMetadata("第一轮结束后的最新状态", await graph.getState(threadConfig));

  const secondResult = await graph.invoke(
    {
      messages: [new HumanMessage("我叫什么名字？")]
    },
    threadConfig
  );

  console.log(`\n第二轮回答: ${secondResult.messages.at(-1)?.content}`);
  printMetadata("第二轮结束后的最新状态", await graph.getState(threadConfig));

  await printMetadataHistory();

  console.log("\n## 观察重点");
  console.log("1. 相同 thread_id 让第二轮读取到第一轮保存的 userName 和 messages。");
  console.log("2. values 是记忆内容，metadata 是 checkpoint 的产生过程。");
  console.log("3. step 是图的 super-step，不是对话轮数或消息数量。");
  console.log("4. 当前版本未在 metadata 中暴露 writes，观察节点增量可使用 updates 流。");
  console.log("5. MemorySaver 只适合本地学习，进程退出后数据就消失。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
