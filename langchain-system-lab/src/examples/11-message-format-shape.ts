import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";

const toolCallId = "call_weather_001";

const recommendedInputMessages = [
  {
    role: "system",
    content: "你是一个简洁的中文助手。"
  },
  {
    role: "user",
    content: "请查询杭州今天的天气，并告诉我适不适合散步。"
  }
];

const internalMessages: BaseMessage[] = [
  new SystemMessage("你是一个简洁的中文助手。"),
  new HumanMessage("请查询杭州今天的天气，并告诉我适不适合散步。"),
  new AIMessage({
    content: "",
    tool_calls: [
      {
        name: "get_weather",
        args: { city: "杭州" },
        id: toolCallId,
        type: "tool_call"
      }
    ],
    response_metadata: {
      finish_reason: "tool_calls"
    }
  }),
  new ToolMessage({
    content: "杭州今天晴天，气温 25C，微风。",
    name: "get_weather",
    tool_call_id: toolCallId,
    status: "success",
    artifact: {
      raw: {
        city: "杭州",
        temperatureCelsius: 25,
        wind: "微风"
      }
    }
  }),
  new AIMessage({
    content: "杭州今天晴天、25C、微风，比较适合散步。",
    response_metadata: {
      finish_reason: "stop"
    }
  })
];

function summarizeMessage(message: BaseMessage) {
  const summary: Record<string, unknown> = {
    className: message.constructor.name,
    type: message.type,
    content: message.content,
    text: message.text,
    name: message.name ?? null,
    id: message.id ?? null,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata
  };

  if (AIMessage.isInstance(message)) {
    summary.tool_calls = message.tool_calls ?? [];
    summary.invalid_tool_calls = message.invalid_tool_calls ?? [];
    summary.usage_metadata = message.usage_metadata ?? null;
  }

  if (ToolMessage.isInstance(message)) {
    summary.tool_call_id = message.tool_call_id;
    summary.status = message.status ?? null;
    summary.artifact = message.artifact ?? null;
  }

  return summary;
}

function printJson(title: string, value: unknown) {
  console.log(`\n## ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

printJson("推荐的输入格式：普通 role/content 对象", recommendedInputMessages);

printJson(
  "LangChain 内部 message 对象摘要",
  internalMessages.map((message) => summarizeMessage(message))
);

printJson(
  "适合持久化或调试的序列化结果：message.toDict()",
  internalMessages.map((message) => message.toDict())
);

const aiToolCallMessage = internalMessages.find(
  (message) => AIMessage.isInstance(message) && message.tool_calls?.length
);
const toolResultMessage = internalMessages.find((message) => ToolMessage.isInstance(message));

printJson("AIMessage.tool_calls 与 ToolMessage.tool_call_id 的对应关系", {
  aiToolCallId: AIMessage.isInstance(aiToolCallMessage) ? aiToolCallMessage.tool_calls?.[0]?.id : null,
  toolMessageCallId: ToolMessage.isInstance(toolResultMessage) ? toolResultMessage.tool_call_id : null
});
