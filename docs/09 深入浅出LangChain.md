# 09 深入浅出 LangChain

这一章开始学习 LangChain。

从课程小节看，这一章主要走的是 LangChain JS/TypeScript 方向，后面会涉及：

- 用一段代码看 LangChain 全貌。
- LangChain 是什么。
- Agent 返回结果。
- middleware。
- 动态选择 LLM。
- 结构化输出。
- stream 流式输出。
- tools 调用。
- message 格式。
- agent 生命周期。
- MCP 服务调用。

所以这一节“环境准备”不需要讲太复杂。

先记住目标：

```text
准备一个能运行 LangChain JS 示例的 Node.js 环境。
```

## 01 环境准备

LangChain 不是模型本身。

它是一个应用开发框架，用来帮我们组织：

```text
模型调用
Prompt
Tools
Agent
Streaming
Middleware
Memory
RAG
MCP
```

所以环境准备的重点不是训练模型，而是准备好：

```text
Node.js
包管理器
LangChain 依赖
模型 API Key
TypeScript 运行环境
```

### 1. 本机环境检查

当前本机环境已经满足学习要求：

```text
Node.js: v22.18.0
pnpm: 10.14.0
npm: 10.9.3
```

LangChain JS 官方安装文档要求 Node.js 22+。

所以当前环境可以继续学习。

### 2. 为什么这一章用 Node.js？

LangChain 同时有 Python 和 JavaScript/TypeScript 版本。

这套课程后面的小节里出现了：

```text
createAgent
middleware
stream
tools
message
MCP
```

这些内容和 LangChain JS/TS 的学习路径更贴近。

而我们前面已经有一个 TypeScript 项目：

```text
llm-api-system-lab
```

但 LangChain 这一章单独新建项目：

```text
langchain-system-lab
```

这样它不会和前面的 LLM API 基础实验混在一起。

### 3. 最小依赖

本章已经新建独立项目：

```text
langchain-system-lab
```

项目已安装最小依赖：

```text
langchain
@langchain/core
@langchain/openai
dotenv
zod
tsx
typescript
```

官方安装命令对应是：

```bash
pnpm add langchain @langchain/core
pnpm add @langchain/openai
```

如果后面要使用其他模型提供商，再安装对应集成包。

### 4. API Key 准备

LangChain 只是框架。

它调用模型时仍然需要模型服务商的 API Key。

常见环境变量包括：

```text
OPENAI_API_KEY
DEEPSEEK_API_KEY
ANTHROPIC_API_KEY
GOOGLE_API_KEY
```

具体用哪个，取决于后续示例选择哪个模型。

如果用 OpenAI 集成，通常会用：

```text
OPENAI_API_KEY
```

当前示例默认使用 OpenAI 集成。

但项目已经兼容 DeepSeek：

```text
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

建议学习阶段这样理解：

```text
默认用 OpenAI 跟着 LangChain 官方示例走。
同时保留 DeepSeek 兼容配置，用来练习 OpenAI-compatible provider。
```

DeepSeek 适合做低成本学习和对照实验。

但 LangChain 的新特性、工具调用细节、结构化输出、stream、middleware 等内容，官方示例通常会先以 OpenAI 为主。

所以不建议把课程示例写死成 DeepSeek。

更推荐现在这种方式：

```text
代码层面抽出 provider 配置。
示例逻辑不关心具体模型厂商。
需要时通过环境变量切换。
```

### 5. 推荐项目结构

当前项目结构：

```text
langchain-system-lab/
  package.json
  .env.example
  src/
    config.ts
    index.ts
    examples/
      01-env-check.ts
      02-agent-overview.ts
```

这样好处是：

- 和 `llm-api-system-lab` 分开。
- 方便单独安装 LangChain 依赖。
- 前面 LLM API 示例和后面 LangChain 示例可以对比学习。

### 6. 环境验证方式

真正安装 LangChain 后，可以用下面几步验证：

```bash
cd langchain-system-lab
node -v
pnpm -v
pnpm check
pnpm example:env
```

当前已经验证：

```text
pnpm check 通过
pnpm example:env 通过
pnpm dev 通过
```

环境准备不追求复杂。

只要能做到：

```text
Node 版本正确
依赖能安装
API Key 能读取
TypeScript 能运行
```

就可以进入下一节。

### 7. 本节小结

这一节记住四句话：

```text
1. LangChain 是 AI 应用开发框架，不是大模型本身。
2. 这一章主要使用 LangChain JS/TypeScript。
3. 当前本机 Node.js v22.18.0、pnpm 10.14.0，满足学习要求。
4. 先准备环境，下一节再通过代码看 LangChain 的整体形态。
```

## 02 用一段代码来看 LangChain 的全貌

这一节先不追求复杂。

我们用一个最小 agent 示例看 LangChain 的整体结构：

```text
Model + Tool + Agent + Invoke
```

对应文件：

```text
langchain-system-lab/src/examples/02-agent-overview.ts
```

运行方式：

```bash
cd langchain-system-lab
pnpm example:overview
```

如果没有设置 `OPENAI_API_KEY`，脚本会提示：

```text
Missing OPENAI_API_KEY.
```

这是正常的。

如果当前切换到了 DeepSeek，则会提示：

```text
Missing DEEPSEEK_API_KEY.
```

### 1. 这段代码在做什么？

示例里有四个关键对象：

```text
ChatOpenAI
tool
createAgent
agent.invoke
```

它们分别对应：

```text
ChatOpenAI: 模型客户端
tool: 给模型使用的工具
createAgent: 把模型和工具组装成 agent
agent.invoke: 发起一次 agent 调用
```

这段示例虽然很短，但已经包含 LangChain Agent 的核心流程：

```text
用户输入
  -> 模型判断是否需要工具
  -> LangChain 执行工具
  -> 工具结果返回给模型
  -> 模型生成最终回答
```

### 2. 为什么输出是一大段对象？

脚本最后用了：

```ts
console.dir(response, { depth: null });
```

所以它打印的不是一个简短答案，而是 LangChain Agent 的完整执行结果。

核心结构是：

```text
{
  messages: [...]
}
```

`messages` 里面保存的是这次 agent 执行过程中的所有消息。

一次典型输出会包含四类消息。

第一类是 `HumanMessage`。

它表示用户输入：

```text
请查询上海今天的天气，并用一句话告诉我适合不适合出门散步。
```

第二类是第一个 `AIMessage`。

这时模型还没有给最终回答，而是在请求调用工具：

```text
tool_calls: [
  {
    name: "get_weather",
    args: { city: "上海" }
  }
]
```

这一步说明模型判断：

```text
用户问的是天气，我应该调用 get_weather 工具。
```

第三类是 `ToolMessage`。

它表示工具执行后的结果：

```text
Weather tool result: 上海 is sunny, 26C, with light wind.
```

注意，这个天气结果不是实时天气 API 返回的。

它来自示例代码里的模拟工具：

```ts
const getWeather = tool(
  ({ city }) => {
    return `Weather tool result: ${city} is sunny, 26C, with light wind.`;
  },
  // ...
);
```

第四类是第二个 `AIMessage`。

这才是模型根据工具结果生成的最终回答：

```text
上海今天天气晴朗，26°C，微风，非常适合出门散步！
```

所以这段输出可以简化理解为：

```text
HumanMessage: 用户问问题
AIMessage: 模型决定调用工具
ToolMessage: 工具返回结果
AIMessage: 模型生成最终回答
```

### 3. 输出里哪些字段暂时不用管？

学习初期，下面这些字段可以先忽略：

```text
lc_serializable
lc_kwargs
lc_namespace
additional_kwargs
response_metadata
usage_metadata
system_fingerprint
```

它们主要是 LangChain 内部序列化、模型响应元数据和 token 统计信息。

真正需要先看懂的是：

```text
type
content
tool_calls
name
args
```

其中：

```text
type: 当前消息类型
content: 消息正文
tool_calls: 模型想调用的工具
name: 工具名
args: 工具参数
```

### 4. finish_reason 是什么意思？

输出里可能会看到：

```text
finish_reason: "tool_calls"
```

它表示这一轮模型输出的目的不是最终回答，而是请求调用工具。

也可能看到：

```text
finish_reason: "stop"
```

它表示模型已经完成最终回答。

所以一次带工具的 agent 调用，通常不是模型只回答一次，而是至少包含两轮模型交互：

```text
第一轮：模型决定调用工具。
第二轮：模型拿到工具结果后生成最终答案。
```

### 5. 为什么 DeepSeek 输出里会出现 model_provider: openai？

如果当前使用 DeepSeek，输出里仍然可能看到：

```text
model_provider: "openai"
```

这不是说请求真的发给了 OpenAI。

原因是我们使用的是：

```text
@langchain/openai
```

也就是 LangChain 的 OpenAI-compatible 客户端。

DeepSeek 是通过下面这个配置接入的：

```ts
configuration: {
  baseURL: "https://api.deepseek.com"
}
```

所以 LangChain 内部元数据里可能仍然显示 `openai` provider。

但实际请求地址由 `baseURL` 决定。

### 6. 本节先记住什么？

这一节先不需要记住所有字段。

先抓住一条主线：

```text
LangChain Agent 的返回结果，不只是最终答案。
它还保留了 agent 执行过程中的消息轨迹。
```

也就是：

```text
用户说了什么
模型想调用什么工具
工具返回了什么
模型最后怎么回答
```

这就是后面学习 tools、message、agent 生命周期、stream、middleware 的基础。

因为这个示例会真的调用模型。

### 1. 这段代码里有什么？

这段代码包含四个核心部分。

第一，模型：

```ts
const model = process.env.LANGCHAIN_MODEL ?? "gpt-4o-mini";
```

模型是真正负责理解和生成回答的部分。

第二，工具：

```ts
const getWeather = tool(...)
```

工具是模型可以调用的外部能力。

当前示例里，工具只是一个假的天气函数：

```text
输入 city
返回一段天气文本
```

第三，Agent：

```ts
const agent = createAgent({
  model,
  tools: [getWeather],
  systemPrompt: "..."
});
```

Agent 可以理解成：

```text
模型 + 工具 + 系统提示词 + 执行循环
```

第四，调用：

```ts
await agent.invoke({
  messages: [
    {
      role: "user",
      content: "请查询上海今天的天气..."
    }
  ]
});
```

这就是一次完整的 LangChain agent 请求。

### 2. LangChain 在这里帮我们做了什么？

如果不用 LangChain，我们要自己处理：

- 模型调用。
- tools schema。
- tool call 判断。
- tool 执行。
- tool 结果回传。
- 最终回答生成。

LangChain 把这些组织成统一的 agent 调用方式。

所以这一段代码的全貌是：

```text
用户消息
  ↓
Agent
  ↓
LLM 判断是否需要工具
  ↓
调用 get_weather
  ↓
把工具结果交回 LLM
  ↓
生成最终回答
```

### 3. 本节小结

先记住一句话：

```text
LangChain 的 agent 示例，本质上是在看模型如何通过框架调用工具并生成最终回答。
```

后面再逐步拆：

- response 里到底有什么。
- tool call 数据长什么样。
- middleware 如何介入。
- stream 如何输出。
- message 格式如何设计。

参考：

- LangChain JS 安装文档：https://docs.langchain.com/oss/javascript/langchain/install
- LangChain JS 概览：https://docs.langchain.com/oss/javascript/langchain/overview

## 03 LangChain是什么？

先给一个学习阶段够用的定义：

```text
LangChain 是一个用来构建 LLM 应用的开发框架。
它不负责训练模型，而是负责把模型、提示词、工具、消息、记忆、结构化输出、流式输出、middleware 等能力组织起来。
```

如果更贴近现在 LangChain JS 的写法，可以这样理解：

```text
LangChain = 围绕大模型的一套应用编排框架
```

在 agent 场景里，它可以进一步理解成：

```text
LangChain Agent = Model + Tools + Prompt + Middleware + 执行循环
```

这里的执行循环，就是上一节看到的：

```text
用户输入
  -> 模型判断是否需要工具
  -> 工具执行
  -> 工具结果回到模型
  -> 模型继续判断或给出最终回答
```

### 1. LangChain 不是什么？

先排除几个误解。

LangChain 不是大模型。

真正生成文本的是：

```text
OpenAI
DeepSeek
Anthropic
Google Gemini
本地模型
```

LangChain 只是帮我们调用和组织这些模型。

LangChain 也不是向量数据库。

向量数据库负责存储和检索向量，例如：

```text
Chroma
Milvus
Pinecone
Qdrant
pgvector
```

LangChain 可以连接这些数据库，但它本身不是数据库。

LangChain 也不是必须使用的唯一方案。

简单的模型调用，用原生 SDK 就够了。

比如只做：

```text
用户输入一句话
模型回复一句话
```

那直接用 OpenAI SDK 或 DeepSeek API 就可以。

当应用开始出现下面这些需求时，LangChain 才开始有价值：

```text
多个模型提供商
多个工具
多轮消息
结构化输出
stream
RAG
memory
middleware
agent 生命周期控制
调试和观测
```

### 2. LangChain 解决的核心问题

不用 LangChain 时，我们自己要写很多胶水代码。

比如工具调用场景里，需要自己处理：

```text
1. 定义工具 schema
2. 把工具描述传给模型
3. 判断模型是否请求调用工具
4. 解析工具参数
5. 执行对应函数
6. 把工具结果塞回消息列表
7. 再次调用模型生成最终回答
8. 处理错误、重试、日志、流式输出
```

这些步骤并不难，但项目变大之后会很散。

LangChain 的作用就是把这些常见模式抽象出来。

所以我们可以写：

```ts
const agent = createAgent({
  model,
  tools: [getWeather],
  systemPrompt: "..."
});
```

然后用：

```ts
await agent.invoke({
  messages: [
    { role: "user", content: "..." }
  ]
});
```

LangChain 会帮我们把中间流程串起来。

### 3. 从代码看 LangChain 的位置

上一节示例里：

```ts
const model = new ChatOpenAI(...);
```

这是模型层。

它负责和 OpenAI-compatible API 通信。

```ts
const getWeather = tool(...);
```

这是工具层。

它把一个普通函数包装成模型可以理解的工具。

```ts
const agent = createAgent({
  model,
  tools: [getWeather],
  systemPrompt: "..."
});
```

这是 LangChain 最关键的位置。

它把模型、工具和提示词组装成一个 agent。

```ts
await agent.invoke({ messages: [...] });
```

这是执行层。

我们把用户消息交给 agent，agent 负责后面的模型调用、工具调用和结果整合。

所以这一章学习 LangChain，本质上不是学习一个 API 名字，而是学习：

```text
如何把一个 LLM 从“能回答问题”
升级成“能使用工具、管理上下文、稳定完成任务的应用”
```

### 4. LangChain 和 Agent 是什么关系？

Agent 是一种应用形态。

LangChain 是构建这种应用形态的框架。

可以这样区分：

```text
LLM: 会生成文本的大脑
Tool: 外部能力，比如查天气、查数据库、调用接口
Agent: 让 LLM 自己决定何时使用工具的执行者
LangChain: 帮我们搭建 Agent 的框架
```

一个非常短的公式：

```text
Agent = LLM + Tools + Loop
LangChain = 帮你实现和扩展这个 Loop 的框架
```

这里的 `Loop` 指的是：

```text
模型思考
  -> 调用工具
  -> 读取工具结果
  -> 再思考
  -> 直到完成任务
```

### 5. LangChain、LangGraph、LangSmith 的区别

LangChain 生态里经常会看到三个名字：

```text
LangChain
LangGraph
LangSmith
```

可以先这样理解：

```text
LangChain: 写 LLM 应用和 agent 的高层框架。
LangGraph: 更底层、更可控的状态图和工作流编排框架。
LangSmith: 调试、追踪、评估、观测 LLM 应用的平台。
```

如果只是学习入门：

```text
先学 LangChain。
需要更复杂的流程控制时，再看 LangGraph。
需要调试、评估和线上观测时，再接 LangSmith。
```

不用一开始就把三个都吃透。

### 6. 什么时候不需要 LangChain？

LangChain 很有用，但不是所有项目都需要它。

如果只是下面这种简单需求：

```text
一个 prompt
一次模型调用
直接返回文本
```

原生 SDK 反而更直接。

比如前面的 `llm-api-system-lab` 就是为了学习底层模型 API。

只有当你开始关心：

```text
工具调用怎么统一管理？
消息格式怎么组织？
模型怎么动态切换？
返回结果怎么结构化？
stream 怎么处理？
RAG 怎么串起来？
agent 生命周期怎么介入？
```

LangChain 的价值才会更明显。

### 7. 本节小结

这一节记住三句话：

```text
1. LangChain 不是模型，而是 LLM 应用开发框架。
2. 它的核心价值是组织模型、工具、消息、上下文和执行流程。
3. 简单调用模型不一定需要 LangChain，但复杂 agent/RAG/工具编排会很适合。
```

从下一节开始，我们会继续拆 agent 返回结果。

也就是继续回答：

```text
agent.invoke(...) 到底返回了什么？
为什么它不是一个普通字符串？
```

参考：

- LangChain JS 概览：https://docs.langchain.com/oss/javascript/langchain/overview
- LangChain JS Agents：https://docs.langchain.com/oss/javascript/langchain/agents
- LangChain JS Context engineering：https://docs.langchain.com/oss/javascript/langchain/context-engineering

## 04 agent返回的response包含哪些内容？

先说结论：

```text
agent.invoke(...) 返回的 response 不是一个普通字符串。
它是 agent 执行完成后的最终状态，也可以理解成 final agent state。
```

在当前示例里，最外层结构主要是：

```ts
{
  messages: [...]
}
```

也就是说，LangChain 返回的不是单独的最终回答，而是这次 agent 运行过程中的消息列表。

### 1. 为什么不是直接返回字符串？

因为 agent 不只是调用一次模型。

它可能会经历：

```text
用户输入
模型请求调用工具
工具返回结果
模型继续回答
模型再次调用工具
最终回答
```

如果只返回最后一句话，中间过程就丢了。

而 agent 的调试、观测、stream、middleware、生命周期控制，都需要这些中间过程。

所以 LangChain 把完整过程保存在 `messages` 里。

### 2. 当前示例里的 response 结构

我们运行：

```bash
pnpm example:overview
```

得到的核心结构可以简化成：

```ts
{
  messages: [
    HumanMessage,
    AIMessage,
    ToolMessage,
    AIMessage
  ]
}
```

对应过程是：

```text
HumanMessage: 用户提问
AIMessage: 模型决定调用工具
ToolMessage: 工具返回结果
AIMessage: 模型生成最终回答
```

这四条消息合起来，才是一整次 agent 调用的完整轨迹。

### 3. HumanMessage 包含什么？

`HumanMessage` 表示用户输入。

里面最重要的是：

```text
type: "human"
content: 用户输入内容
id: 消息 ID
```

比如：

```text
content: "请查询上海今天的天气，并用一句话告诉我适合不适合出门散步。"
```

学习初期只需要看 `content`。

### 4. 第一个 AIMessage 包含什么？

第一个 `AIMessage` 通常表示模型的一次输出。

在工具调用场景里，它可能没有自然语言答案，而是包含：

```text
tool_calls
```

比如：

```ts
tool_calls: [
  {
    name: "get_weather",
    args: { city: "上海" },
    id: "call_xxx"
  }
]
```

这说明模型不是在直接回答用户，而是在说：

```text
我要调用 get_weather 工具，参数是 city = 上海。
```

这一轮里经常还能看到：

```text
finish_reason: "tool_calls"
```

意思是：

```text
模型这一轮结束的原因是：它请求调用工具。
```

### 5. ToolMessage 包含什么？

`ToolMessage` 表示工具执行结果。

它通常包含：

```text
type: "tool"
name: 工具名称
content: 工具返回内容
tool_call_id: 对应哪一次 tool call
status: 工具执行状态
```

在当前示例里：

```text
name: "get_weather"
content: "Weather tool result: 上海 is sunny, 26C, with light wind."
status: "success"
```

`tool_call_id` 很重要。

它把工具结果和前面的工具调用请求对应起来：

```text
AIMessage.tool_calls[0].id
        ↓
ToolMessage.tool_call_id
```

这样模型知道：

```text
这个工具结果，是刚才那次 get_weather 调用返回的。
```

### 6. 最后一个 AIMessage 包含什么？

最后一个 `AIMessage` 通常是最终回答。

它最重要的是：

```text
content
```

比如：

```text
上海今天天气晴朗，26°C，微风，非常适合出门散步！
```

这一轮里通常会看到：

```text
finish_reason: "stop"
```

意思是：

```text
模型已经完成最终回答。
```

如果你只想拿最终答案，可以取最后一条消息：

```ts
const finalMessage = response.messages[response.messages.length - 1];
console.log(finalMessage.content);
```

但学习 agent 时，不要只盯最后一条。

中间的 `tool_calls` 和 `ToolMessage` 才是理解 agent 的关键。

### 7. response_metadata 和 usage_metadata 是什么？

每个模型消息里，可能会有：

```text
response_metadata
usage_metadata
```

它们主要是模型调用的元数据。

常见字段包括：

```text
model_name: 实际使用的模型
finish_reason: 本轮模型为什么结束
tokenUsage: token 消耗统计
usage: provider 原始 token 统计
system_fingerprint: 模型服务端指纹
```

这些字段对调试和计费很有用。

比如：

```text
prompt_tokens: 输入 token 数
completion_tokens: 输出 token 数
total_tokens: 总 token 数
```

学习初期可以先记住：

```text
response_metadata 看模型返回状态。
usage_metadata 看 token 消耗。
```

### 8. lc_kwargs、lc_namespace 要看吗？

输出里还会看到：

```text
lc_serializable
lc_kwargs
lc_namespace
additional_kwargs
```

这些主要是 LangChain 内部对象序列化和兼容 provider 原始响应用的字段。

初学阶段可以先忽略。

真正优先看的字段是：

```text
messages
type
content
tool_calls
tool_call_id
name
status
response_metadata.finish_reason
usage_metadata
```

### 9. response 里只会有 messages 吗？

不一定。

当前最小示例没有配置结构化输出，也没有额外 middleware state，所以返回结果主要是：

```ts
{
  messages: [...]
}
```

但 LangChain agent 的返回值本质上是状态对象。

如果配置了结构化输出，可能会多出：

```ts
{
  messages: [...],
  structuredResponse: {
    // 按 schema 解析后的结构化结果
  }
}
```

如果使用 middleware 或自定义 state，也可能会多出自定义字段。

如果使用 human-in-the-loop 或中断机制，还可能看到和 interrupt 相关的状态。

所以可以这样记：

```text
messages 是 agent response 的核心字段。
structuredResponse 是配置结构化输出后才会出现的字段。
middleware/custom state 会让 response 多出额外状态。
```

### 10. agent response 和 LLM response 的区别

这点很重要。

普通 LLM 调用更像：

```text
输入 messages
输出一条 AIMessage
```

agent 调用更像：

```text
输入 messages
输出完整 agent state
```

也就是：

```text
LLM response: 模型的一次回答
Agent response: agent 执行完整任务后的状态
```

在工具调用场景里，agent response 至少可能包含：

```text
用户消息
模型请求调用工具的消息
工具返回结果的消息
模型最终回答的消息
```

### 11. 本节小结

这一节先记住五句话：

```text
1. agent.invoke(...) 返回的是最终 agent state，不是普通字符串。
2. 当前示例里最重要的字段是 messages。
3. messages 记录了用户输入、模型工具调用、工具结果和最终回答。
4. 最后一条 AIMessage 通常是最终答案。
5. tool_calls 和 ToolMessage 是理解 agent 执行过程的关键。
```

下一节可以继续追问：

```text
agent 返回的 response 数据类型到底是什么？
```

也就是从 TypeScript 类型层面继续拆。

## 05 agent返回的response数据类型到底是什么？

上一节回答的是：

```text
response 里面包含哪些内容？
```

这一节回答的是：

```text
response 在 TypeScript 里到底是什么类型？
```

先给结论：

```text
agent.invoke(...) 的返回值不是 string。
它的类型是 Promise<最终 agent state>。
```

在当前 `langchain@1.5.3` 里，`invoke()` 的类型定义可以简化理解成：

```ts
agent.invoke(...): Promise<MergedAgentState<Types>>
```

`MergedAgentState<Types>` 是 LangChain 内部根据 agent 配置推导出来的状态类型。

对我们当前这个最小示例来说，可以先简化成：

```ts
type AgentResponse = {
  messages: BaseMessage[];
};
```

也就是：

```text
一个包含 messages 数组的对象。
```

### 1. 为什么是 Promise？

因为 agent 调用模型和工具都是异步操作。

所以这段代码：

```ts
const response = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "请查询上海今天的天气，并用一句话告诉我适合不适合出门散步。"
    }
  ]
});
```

如果不写 `await`，得到的是：

```ts
Promise<AgentResponse>
```

写了 `await` 之后，得到的才是：

```ts
AgentResponse
```

所以：

```text
agent.invoke(...) 返回 Promise。
await agent.invoke(...) 得到 response 对象。
```

### 2. response 不是普通 JSON

虽然我们看到的输出很像 JSON：

```text
{
  messages: [...]
}
```

但它在运行时不是普通 JSON。

它里面的元素是 LangChain 的消息对象实例，例如：

```text
HumanMessage
AIMessage
ToolMessage
```

这就是为什么 `console.dir` 会打印出：

```text
HumanMessage { ... }
AIMessage { ... }
ToolMessage { ... }
```

真正的 JSON 不能有这些类名，也不能有：

```text
undefined
[Symbol(langchain.message)]
```

所以如果要保存成 `.json` 文件，需要先转换成可序列化结构。

我们整理过的示例文件就是这个目的：

```text
langchain-system-lab/src/examples/langchain-response.json
```

它把运行时对象整理成了标准 JSON。

### 3. BaseMessage[] 是什么？

当前 response 最核心的类型是：

```ts
messages: BaseMessage[]
```

`BaseMessage` 可以理解成所有消息对象的共同父类型。

常见子类型包括：

```text
HumanMessage
AIMessage
ToolMessage
SystemMessage
```

在当前示例里，messages 数组是：

```text
[
  HumanMessage,
  AIMessage,
  ToolMessage,
  AIMessage
]
```

它们共同拥有一些基础字段：

```text
type
content
id
name
additional_kwargs
response_metadata
```

但不同消息类型又会有自己的额外字段。

比如 `AIMessage` 可能有：

```text
tool_calls
invalid_tool_calls
usage_metadata
```

`ToolMessage` 可能有：

```text
tool_call_id
status
artifact
```

所以从类型角度看，不能简单把每条 message 都当成同一种结构。

更准确地说：

```text
messages 是一个由多种 message 子类型组成的数组。
```

### 4. 当前示例的类型可以怎么写？

为了学习，可以先写一个简化版本：

```ts
type SimpleAgentResponse = {
  messages: Array<{
    type: string;
    content: unknown;
    id?: string;
    name?: string;
  }>;
};
```

但这只是教学用的简化类型。

真实项目里不建议自己手写完整 message 类型。

更推荐让 TypeScript 从 agent 推导：

```ts
const response = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "..."
    }
  ]
});
```

如果真的需要拿到类型，可以用：

```ts
type AgentInvokeResult = Awaited<ReturnType<typeof agent.invoke>>;
```

这样 TypeScript 会根据当前 agent 的配置自动推导返回值。

### 5. 为什么叫 final agent state？

LangChain 的 agent 底层不是简单函数调用，而是一个状态流转过程。

可以把它想成：

```text
初始 state:
{
  messages: [HumanMessage]
}

模型调用后:
{
  messages: [HumanMessage, AIMessage]
}

工具调用后:
{
  messages: [HumanMessage, AIMessage, ToolMessage]
}

最终回答后:
{
  messages: [HumanMessage, AIMessage, ToolMessage, AIMessage]
}
```

`agent.invoke(...)` 返回的是最后一步的状态。

所以它不是：

```text
最终答案字符串
```

而是：

```text
最终状态对象
```

这就是为什么我们说它是：

```text
final agent state
```

### 6. responseFormat 会改变返回类型吗？

会。

当前示例没有配置 `responseFormat`，所以返回结果主要是：

```ts
{
  messages: BaseMessage[];
}
```

如果配置了结构化输出，例如：

```ts
const agent = createAgent({
  model,
  tools: [getWeather],
  responseFormat: z.object({
    answer: z.string(),
    canWalk: z.boolean()
  })
});
```

那么返回结果里可能会多出：

```ts
{
  messages: BaseMessage[];
  structuredResponse: {
    answer: string;
    canWalk: boolean;
  };
}
```

所以：

```text
没有 responseFormat: response 主要看 messages。
有 responseFormat: response 还会有 structuredResponse。
```

### 7. middleware 会改变返回类型吗？

也可能会。

LangChain 的 agent state 可以被 middleware 扩展。

如果 middleware 定义了自己的 state 字段，最终 response 也可能包含这些字段。

所以真实类型更像：

```ts
type AgentResponse =
  BuiltInState
  & StructuredResponseState
  & MiddlewareState;
```

为了学习，可以先理解成：

```text
response = messages + 可选 structuredResponse + 可选 middleware state
```

### 8. 那最终答案是什么类型？

最终答案通常在最后一条 `AIMessage` 的 `content` 里。

可以这样取：

```ts
const finalMessage = response.messages[response.messages.length - 1];
const finalAnswer = finalMessage.content;
```

但要注意：

```text
finalAnswer 不一定永远是 string。
```

在简单文本场景下，它通常是字符串。

但在多模态、复杂 content block、不同 provider 场景下，`content` 也可能是数组结构。

所以更稳的说法是：

```text
最终答案在最后一条 AIMessage 的 content 里。
content 常见情况下是 string，但类型上不只限于 string。
```

### 9. 这一节和上一节的区别

上一节看的是运行时内容：

```text
response 里有什么字段？
messages 里有哪些消息？
每条消息代表什么？
```

这一节看的是类型层次：

```text
agent.invoke(...) 返回 Promise。
await 后得到 final agent state。
final agent state 至少包含 messages。
messages 的类型是 BaseMessage[]。
不同 message 是 HumanMessage、AIMessage、ToolMessage 等子类型。
```

这两节其实是同一个东西的两个视角：

```text
上一节：从数据内容看。
这一节：从 TypeScript 类型看。
```

### 10. 本节小结

这一节记住五句话：

```text
1. agent.invoke(...) 返回 Promise，不是直接返回对象。
2. await agent.invoke(...) 得到的是 final agent state。
3. 当前示例的 response 可以简化理解成 { messages: BaseMessage[] }。
4. messages 里的元素是 HumanMessage、AIMessage、ToolMessage 等对象实例。
5. 配置 responseFormat 或 middleware 后，response 类型会继续扩展。
```

一句话总结：

```text
agent response 的类型不是“答案字符串”，而是“带消息轨迹的 agent 状态对象”。
```

## 06 LangChain的middleware是什么？

在继续看 `request` 之前，先把 middleware 本身讲清楚。

先给一个学习阶段够用的定义：

```text
Middleware 是插在 agent 执行流程中的一层拦截逻辑。
它可以在模型调用前、模型调用后、工具调用前后、agent 开始和结束时介入。
```

如果用一句更工程化的话说：

```text
Middleware = Agent 执行链路里的可插拔钩子。
```

它不是模型。

它也不是工具。

它更像是：

```text
一段围绕 agent 执行过程运行的辅助逻辑。
```

### 1. 为什么需要 middleware？

前面的 agent 示例已经能做到：

```text
用户提问
模型判断是否调用工具
工具执行
模型生成最终回答
```

但真实项目里，光这样还不够。

我们经常还想做这些事：

```text
调用模型前打印日志
调用模型前裁剪历史消息
调用模型前动态修改 system prompt
调用模型后检查输出
工具调用前做权限判断
工具调用失败后重试
根据用户身份选择不同模型
记录 token 消耗和链路耗时
```

这些逻辑如果全部写进业务代码，会让 agent 主流程很乱。

Middleware 的作用就是把这些横切逻辑单独抽出来。

### 2. middleware 插在哪里？

可以把 agent 执行过程想成一条线：

```text
agent 开始
  -> 模型调用前
  -> 模型调用
  -> 模型调用后
  -> 工具调用前后
  -> agent 结束
```

LangChain middleware 大致可以在这些位置介入：

```text
beforeAgent: agent 开始时执行一次
beforeModel: 每次模型调用前执行
afterModel: 每次模型调用后执行
afterAgent: agent 结束时执行一次
wrapModelCall: 包住一次模型调用
wrapToolCall: 包住一次工具调用
```

先不要急着都记住。

学习阶段先抓住两类就够：

```text
生命周期 hook:
beforeAgent / beforeModel / afterModel / afterAgent

调用拦截器:
wrapModelCall / wrapToolCall
```

### 3. 一个最简单的 middleware 示例

本节新增了一个更简单的示例：

```text
langchain-system-lab/src/examples/03-middleware-basic.ts
```

运行方式：

```bash
cd langchain-system-lab
pnpm example:middleware:basic
```

这个示例没有工具调用。

它只做一件事：

```text
在 agent 生命周期的几个位置打印当前 messages 数量。
```

核心代码是：

```ts
const lifecycleLogger = createMiddleware({
  name: "LifecycleLogger",

  beforeAgent: (state) => {
    logState("beforeAgent", state);
  },

  beforeModel: (state) => {
    logState("beforeModel", state);
  },

  afterModel: (state) => {
    logState("afterModel", state);
  },

  afterAgent: (state) => {
    logState("afterAgent", state);
  }
});
```

然后把 middleware 挂到 agent 上：

```ts
const agent = createAgent({
  model,
  middleware: [lifecycleLogger],
  systemPrompt: "You are a concise assistant. Answer in Chinese."
});
```

这就是最基础的 middleware 使用方式：

```text
先 createMiddleware(...)
再传给 createAgent({ middleware: [...] })
```

### 4. 这个示例会看到什么？

如果正常调用模型，大致会看到：

```text
[beforeAgent]
message count: 1
last message type: human

[beforeModel]
message count: 1
last message type: human

[afterModel]
message count: 2
last message type: ai

[afterAgent]
message count: 2
last message type: ai
```

这说明：

```text
beforeAgent: agent 刚开始，只有用户消息。
beforeModel: 模型调用前，还是用户消息。
afterModel: 模型回答后，多了一条 AIMessage。
afterAgent: agent 结束时，保留最终状态。
```

因为这个简单示例没有工具，所以模型只调用一次。

如果有工具，`beforeModel` 和 `afterModel` 可能会出现多次。

### 5. state 是什么？

这个基础示例里，middleware 拿到的是：

```ts
state
```

可以先把它理解成：

```text
agent 当前状态。
```

最重要的是：

```ts
state.messages
```

它保存了当前 agent 已经积累的消息列表。

比如：

```text
用户消息
模型消息
工具消息
最终回答消息
```

后面讲 request 时，我们会看到：

```text
state.messages
request.messages
```

它们不完全是一回事。

但在这里先不用展开，先记住：

```text
middleware 可以通过 state 观察 agent 当前执行到哪一步。
```

### 6. middleware 和 tool 有什么区别？

这两个很容易混。

Tool 是给模型主动调用的能力。

比如：

```text
查天气
查数据库
调用业务接口
搜索网页
```

Middleware 是开发者插入执行链路的控制逻辑。

比如：

```text
记录日志
修改 prompt
限制工具调用
拦截敏感内容
失败重试
切换模型
```

可以这样区分：

```text
Tool: 模型可以选择要不要调用。
Middleware: 框架在特定生命周期自动执行。
```

### 7. middleware 和 system prompt 有什么区别？

System prompt 是写给模型看的指令。

Middleware 是写给程序执行的代码。

比如：

```text
systemPrompt: “你要用中文回答”
```

这是让模型遵守的规则。

而：

```ts
beforeModel: (state) => {
  console.log(state.messages.length);
}
```

这是程序在模型调用前执行的逻辑。

一个作用在模型行为上。

一个作用在应用流程上。

### 8. 什么时候用 middleware？

适合用 middleware 的场景通常有：

```text
这段逻辑和具体业务问题无关。
这段逻辑需要在多次模型调用中重复执行。
这段逻辑要包住模型调用或工具调用。
这段逻辑属于日志、权限、重试、上下文管理、输出检查。
```

不适合把所有东西都塞进 middleware。

如果只是一个普通业务函数，写成普通函数或 tool 就好。

### 9. 本节小结

这一节先记住五句话：

```text
1. Middleware 是插在 agent 执行流程中的可插拔钩子。
2. 它常用于日志、权限、重试、上下文管理和模型调用控制。
3. beforeAgent/beforeModel/afterModel/afterAgent 更像生命周期 hook。
4. wrapModelCall/wrapToolCall 更像调用拦截器。
5. 学习时先从 state 入手，再看 request。
```

下一节再看：

```text
中间件中的 request 到底长什么样？
```

## 07 中间件中的request到底长啥样？

先把一个容易混淆的点说清楚：

```text
LangChain middleware 里的 request，不是 HTTP Request。
它是 LangChain 在某个执行节点里准备交给模型或工具的“调用上下文对象”。
```

而且不是所有 middleware hook 都有 `request`。

在 LangChain Agent middleware 里，可以先分成两类：

```text
beforeAgent / beforeModel / afterModel / afterAgent
  -> 拿到的是 state 和 runtime

wrapModelCall / wrapToolCall
  -> 拿到的是 request 和 handler
```

所以当我们问：

```text
中间件中的 request 长什么样？
```

更准确地说是在问：

```text
wrapModelCall 的 request 长什么样？
wrapToolCall 的 request 长什么样？
```

### 1. 新增示例

本节对应示例：

```text
langchain-system-lab/src/examples/04-middleware-request-shape.ts
```

运行方式：

```bash
cd langchain-system-lab
pnpm example:middleware:request
```

这个示例加了一个 middleware：

```ts
const requestShapeLogger = createMiddleware({
  name: "RequestShapeLogger",

  wrapModelCall: async (request, handler) => {
    console.dir(request);
    return handler(request);
  },

  wrapToolCall: async (request, handler) => {
    console.dir(request);
    return handler(request);
  }
});
```

真实代码里没有直接打印完整对象，而是打印了摘要。

原因是完整对象里有很多类实例、函数、runtime 引用和内部字段，直接打印会很长。

### 2. wrapModelCall 的 request

`wrapModelCall` 发生在每次模型调用前后。

它的形式是：

```ts
wrapModelCall: async (request, handler) => {
  const response = await handler(request);
  return response;
}
```

这里的 `request` 可以简化理解成：

```ts
{
  model,
  messages,
  systemPrompt,
  systemMessage,
  toolChoice,
  tools,
  state,
  responseFormat,
  runtime,
  modelSettings
}
```

这些字段分别表示：

```text
model: 本轮要调用的模型
messages: 本轮要传给模型的消息
systemPrompt: 系统提示词字符串
systemMessage: 系统消息对象
toolChoice: 工具选择策略
tools: 本轮模型可用的工具列表
state: 当前 agent 状态
responseFormat: 结构化输出配置
runtime: 运行时上下文
modelSettings: 额外模型绑定参数
```

其中最重要的是：

```text
messages
tools
state
runtime
```

### 3. request.messages 和 request.state.messages 有什么区别？

这两个字段很容易混。

`request.state.messages` 表示当前 agent 状态里的消息列表。

它是 agent 当前已经累积到的上下文。

`request.messages` 表示本次模型调用实际准备发送给模型的消息列表。

在简单场景里，它们看起来可能一样。

但 middleware 可以修改 `request.messages`，例如：

```text
裁剪历史消息
插入额外上下文
隐藏某些工具结果
做摘要替换
```

所以更准确地说：

```text
state.messages: agent 当前状态里的消息
request.messages: 本轮模型调用实际使用的消息
```

### 4. 为什么 wrapModelCall 会执行多次？

在带工具的 agent 里，模型通常会被调用不止一次。

当前天气示例里，典型流程是：

```text
第一次 wrapModelCall:
  messages = [HumanMessage]
  模型决定调用 get_weather

wrapToolCall:
  执行 get_weather

第二次 wrapModelCall:
  messages = [HumanMessage, AIMessage(tool_calls), ToolMessage]
  模型生成最终回答
```

所以如果你运行示例，看到两个 `wrapModelCall request`，这是正常的。

因为 agent 不是“一问一答”，而是：

```text
模型调用
工具调用
模型再调用
```

### 5. wrapToolCall 的 request

`wrapToolCall` 发生在工具真正执行前后。

它的形式是：

```ts
wrapToolCall: async (request, handler) => {
  const result = await handler(request);
  return result;
}
```

它的 `request` 可以简化理解成：

```ts
{
  toolCall,
  tool,
  state,
  runtime
}
```

字段含义：

```text
toolCall: 模型发出的工具调用请求
tool: 即将被执行的工具对象
state: 当前 agent 状态
runtime: 运行时上下文
```

其中最重要的是 `toolCall`。

它通常长这样：

```ts
{
  name: "get_weather",
  args: {
    city: "上海"
  },
  type: "tool_call",
  id: "call_xxx"
}
```

它表示：

```text
模型请求调用 get_weather 工具，参数是 city = 上海。
```

`tool` 则是我们代码里注册的工具对象。

比如：

```ts
const getWeather = tool(...);
```

`handler(request)` 才是真正执行工具的那一步。

### 6. handler 是什么？

middleware 里的 `handler` 可以理解成：

```text
继续执行原本流程的函数。
```

在 `wrapModelCall` 里：

```ts
const response = await handler(request);
```

表示：

```text
用这个 request 去调用模型。
```

在 `wrapToolCall` 里：

```ts
const result = await handler(request);
```

表示：

```text
用这个 request 去执行工具。
```

如果你不调用 `handler(request)`，原本的模型调用或工具调用就不会继续。

所以 middleware 可以做很多事：

```text
调用前打印日志
调用前修改 request
调用后检查 response
调用失败时重试
调用失败时换模型
调用工具前做权限判断
调用工具后改写工具结果
```

### 7. request 可以改吗？

可以，但推荐用不可变方式改。

也就是不要直接改原对象：

```ts
request.systemPrompt = "new prompt";
```

更推荐创建一个新对象：

```ts
return handler({
  ...request,
  systemPrompt: "You are helpful."
});
```

修改工具调用也类似：

```ts
return handler({
  ...request,
  toolCall: {
    ...request.toolCall,
    args: {
      ...request.toolCall.args,
      city: "上海"
    }
  }
});
```

这样更符合 middleware 链式处理的习惯。

### 8. beforeModel 为什么没有 request？

`beforeModel` 的函数签名不是：

```ts
(request, handler) => {}
```

而是：

```ts
(state, runtime) => {}
```

它更像生命周期钩子：

```text
模型调用前，允许你看一下当前 state，并返回 state 更新。
```

而 `wrapModelCall` 更像拦截器：

```text
模型调用前后，允许你包住整个模型调用过程。
```

所以可以这样区分：

```text
beforeModel: 改 agent state
wrapModelCall: 改模型调用 request 或 response
```

同理：

```text
afterModel: 模型调用后改 agent state
wrapToolCall: 包住工具调用过程
```

### 9. runtime 里有什么？

`runtime` 是运行时上下文。

它常见包含：

```text
context
configurable
signal
store
writer
interrupt
```

不一定每次都有。

可以先这样理解：

```text
context: 本次调用传入的只读上下文
configurable: thread_id、run_id 等可配置参数
signal: AbortSignal，用于取消执行
store: 持久化存储
writer: stream 写入器
interrupt: human-in-the-loop 中断能力
```

学习初期重点看：

```text
runtime.context
runtime.configurable
```

其他字段后面讲 memory、stream、human-in-the-loop 时再深入。

### 10. 本节小结

这一节先记住五句话：

```text
1. middleware 里的 request 不是 HTTP Request。
2. beforeModel/afterModel 拿到的是 state 和 runtime，不是 request。
3. wrapModelCall 的 request 描述一次模型调用。
4. wrapToolCall 的 request 描述一次工具调用。
5. handler(request) 表示继续执行原本的模型调用或工具调用。
```

一句话总结：

```text
middleware request 是 LangChain 在执行到某一步时，交给 middleware 检查、修改、放行的调用上下文。
```

## 08 利用中间件动态选择LLM

这一节开始用 middleware 做一个真正有用的事情：

```text
根据用户问题的复杂度，动态选择不同的 LLM。
```

先给结论：

```text
动态选择 LLM 最适合放在 wrapModelCall 里做。
```

因为 `wrapModelCall` 拿到的是一次模型调用的 `request`。

而 `request` 里正好有：

```text
model
messages
state
tools
runtime
```

所以我们可以在模型真正调用前，根据当前消息判断：

```text
这次用便宜/快速模型？
还是用更强/更贵模型？
```

### 1. 本节示例

对应文件：

```text
langchain-system-lab/src/examples/05-dynamic-model-middleware.ts
```

运行方式：

```bash
cd langchain-system-lab
pnpm example:middleware:dynamic-model
```

示例会连续发起两个问题：

```text
简单问题：用一句话解释 LangChain。
复杂问题：详细对比 LLM API 和 LangChain Agent 架构，并给生产选择方案。
```

middleware 会根据问题长度、关键词、消息数量选择模型。

### 2. 环境变量配置

现在项目支持两档模型：

```text
默认模型
高级模型
```

OpenAI 配置：

```text
OPENAI_MODEL=gpt-4o-mini
OPENAI_ADVANCED_MODEL=gpt-4o
```

DeepSeek 配置：

```text
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_ADVANCED_MODEL=deepseek-v4-pro
```

这里把默认模型和高级模型区分开：

```text
deepseek-v4-flash: 更适合普通请求，偏速度和成本。
deepseek-v4-pro: 更适合复杂请求，偏能力和稳定性。
```

早期示例里可能会看到 `deepseek-chat`。

它是旧兼容模型名，DeepSeek 官方已经提示后续会废弃，所以新示例直接使用 V4 模型名。

如果高级模型不配置，会使用项目默认值。

为了教学简单，本节先在同一个 provider 里切换模型。

也就是：

```text
OpenAI 模式下，在 OpenAI 模型之间切换。
DeepSeek 模式下，在 DeepSeek 模型之间切换。
```

跨 provider 切换也可以做，但需要同时准备多个 provider 的 API Key，学习阶段先不展开。

### 3. 核心思路

正常创建 agent 时，需要传一个默认模型：

```ts
const agent = createAgent({
  model: createChatModel(activeModel, activeModel.model),
  middleware: [createDynamicModelMiddleware(activeModel)],
  systemPrompt: "You are a concise assistant. Answer in Chinese."
});
```

这里的 `model` 是兜底模型。

真正的动态选择发生在 middleware 里：

```ts
wrapModelCall: async (request, handler) => {
  const useAdvanced = shouldUseAdvancedModel(...);

  return handler({
    ...request,
    model: useAdvanced ? advancedModel : defaultModel
  });
}
```

这段代码的意思是：

```text
拿到本轮模型调用 request。
判断这次该用哪个模型。
创建一个新的 request。
把 request.model 替换成选中的模型。
调用 handler(request) 继续执行。
```

### 4. 为什么用 wrapModelCall？

因为动态选择模型，本质上是要改：

```text
本轮模型调用使用哪个 model
```

而 `wrapModelCall` 正好包住一次模型调用。

它的 request 里包含：

```ts
request.model
request.messages
request.state
request.tools
request.runtime
```

所以可以根据这些信息决策。

比如：

```text
用户问题很短 -> 默认模型
用户问题很长 -> 高级模型
用户要求详细对比 -> 高级模型
当前消息轮数很多 -> 高级模型
涉及工具调用 -> 高级模型
```

### 5. 判断逻辑

示例里的判断函数是：

```ts
function shouldUseAdvancedModel(text: string, messageCount: number): boolean {
  const complexityKeywords = [
    "架构",
    "设计",
    "复杂",
    "详细",
    "对比",
    "推理",
    "源码",
    "优化",
    "生产",
    "方案"
  ];

  return text.length > 80 || messageCount > 4 || complexityKeywords.some((keyword) => text.includes(keyword));
}
```

这是教学用的简单规则。

它不是智能分类器。

但足够说明动态模型选择的机制：

```text
简单请求走默认模型。
复杂请求走高级模型。
```

真实项目里可以把判断条件换成：

```text
用户等级
请求预算
任务类型
上下文长度
工具数量
响应时延要求
安全等级
A/B 实验分组
```

### 6. 生产里的智能分类器怎么设计？

真实生产里，`shouldUseAdvancedModel` 通常不会只是一个关键词判断。

但也不建议一上来就把所有决策都交给大模型。

更稳的设计是：

```text
Model Router =
规则兜底 + 轻量分类器 + 置信度策略 + 失败回退 + 评估闭环
```

也就是说，生产级“智能分类器”不是一个孤立函数，而是一套路由系统。

#### 第一层：硬规则

先用确定性规则处理明显情况：

```text
超长上下文 -> 高级模型
涉及代码/推理/规划 -> 高级模型
普通闲聊/改写/总结 -> 默认模型
高价值用户/付费任务 -> 高级模型
预算不足/限流中 -> 默认模型
安全敏感/合规任务 -> 专用模型或人工审核
```

硬规则的优点是：

```text
便宜
稳定
可解释
容易调试
```

不要小看这层。

很多生产系统里，硬规则能解决 60% 以上的路由问题。

#### 第二层：轻量分类器

规则判断不了的请求，再交给一个便宜模型做分类。

注意，这个模型不负责回答用户问题。

它只负责输出路由决策。

可以要求它返回结构化 JSON：

```json
{
  "route": "default",
  "task_type": "chat",
  "complexity": 2,
  "confidence": 0.86,
  "reason": "用户只是要求一句话解释概念"
}
```

复杂请求可能返回：

```json
{
  "route": "advanced",
  "task_type": "architecture",
  "complexity": 5,
  "confidence": 0.91,
  "reason": "用户要求生产方案、架构对比和决策建议"
}
```

这里的分类器可以判断：

```text
任务类型
复杂度
是否需要工具
是否需要长上下文
是否需要强推理
是否适合默认模型
```

#### 第三层：置信度策略

不要盲信分类器。

分类器应该输出 `confidence`。

然后路由器根据置信度做决策：

```text
confidence >= 0.8
  -> 按分类器结果走

0.5 <= confidence < 0.8
  -> 按业务偏好走

confidence < 0.5
  -> 走保守策略
```

这里的“保守策略”取决于业务目标。

如果质量优先：

```text
低置信度 -> 高级模型
```

如果成本优先：

```text
低置信度 -> 默认模型
```

如果安全优先：

```text
低置信度 -> 拒答、人工审核或专用安全链路
```

#### 第四层：失败回退

路由不可能永远正确。

所以生产系统一定要设计失败回退。

常见策略：

```text
默认模型回答失败 -> 升级到高级模型重试
结构化输出解析失败 -> 高级模型重试
工具调用失败 -> 高级模型重新规划
用户追问“不对/不完整” -> 后续轮次升级模型
模型超时 -> 换备用模型
provider 报错 -> 切换备用 provider
```

这比所有请求一开始都用高级模型更经济。

也比路由错了就直接失败更稳。

#### 第五层：评估闭环

生产级路由最关键的是闭环。

不是分类 prompt 写得多漂亮。

需要记录：

```text
输入特征
路由选择
实际模型
token 成本
响应延迟
是否调用工具
是否重试
是否升级模型
用户是否追问
人工或自动评分
最终是否成功
```

然后定期分析：

```text
哪些 default 路由其实应该 advanced？
哪些 advanced 调用浪费了？
哪类任务最容易路由错？
哪种关键词规则误伤最多？
哪个模型组合性价比最好？
```

这一步会反过来优化规则和分类器 prompt。

### 7. 生产里的 routeModel 可能长什么样？

可以先想象成这样：

```ts
type ModelRoute = "default" | "advanced";

type RouteDecision = {
  route: ModelRoute;
  taskType: string;
  complexity: number;
  confidence: number;
  reason: string;
};

async function routeModel(request: ModelRequest): Promise<RouteDecision> {
  const ruleDecision = routeByRules(request);

  if (ruleDecision) {
    return ruleDecision;
  }

  const classifierDecision = await classifyRequest(request);

  if (classifierDecision.confidence >= 0.8) {
    return classifierDecision;
  }

  return fallbackDecision(request, classifierDecision);
}
```

然后在 middleware 里使用：

```ts
wrapModelCall: async (request, handler) => {
  const decision = await routeModel(request);

  return handler({
    ...request,
    model: decision.route === "advanced" ? advancedModel : defaultModel
  });
}
```

这样主流程仍然很干净。

模型路由策略被集中封装在 `routeModel` 里。

### 8. 什么时候不要用 LLM 分类器？

不是所有路由都值得调用分类器。

下面这些情况更适合硬规则：

```text
输入 token 已经超过默认模型窗口
用户所在套餐明确限制模型
当前高级模型限流
请求类型由业务入口已经确定
安全策略要求固定链路
成本预算已经用完
```

因为这些判断本质上不需要理解语义。

用规则更稳定。

LLM 分类器适合处理：

```text
语义复杂度
任务类型模糊
是否需要推理
是否需要详细方案
是否需要多步规划
```

### 9. 生产级路由的核心原则

可以总结成四个原则：

```text
能用规则判断的，不要交给模型。
能用小模型判断的，不要交给大模型。
路由错了要能回退。
路由策略必须被评估数据持续修正。
```

这就是生产系统和 demo 的区别。

demo 里：

```text
if keyword then advanced
```

生产里：

```text
rules -> classifier -> confidence -> fallback -> evals
```

### 10. 为什么不在业务代码里 if/else？

当然也可以在业务代码里写：

```ts
if (isComplex) {
  await advancedAgent.invoke(...);
} else {
  await defaultAgent.invoke(...);
}
```

但这样做有一个问题：

```text
模型选择逻辑会散落在业务入口里。
```

用 middleware 的好处是：

```text
agent 主流程不变。
模型选择逻辑集中放在 middleware 里。
每一次模型调用都能被统一拦截。
```

这在 agent 场景里更重要。

因为一次 agent 调用可能包含多次模型调用：

```text
第一次模型调用：决定是否调用工具。
第二次模型调用：根据工具结果回答。
第三次模型调用：继续修正或结构化输出。
```

middleware 可以对每一轮模型调用单独做判断。

### 11. 默认模型和高级模型怎么选？

学习阶段可以这样配：

```text
默认模型：便宜、快、够用
高级模型：更强、更稳、适合复杂任务
```

比如 OpenAI：

```text
默认模型: gpt-4o-mini
高级模型: gpt-4o
```

比如 DeepSeek：

```text
默认模型: deepseek-v4-flash
高级模型: deepseek-v4-pro
```

如果后面要使用 DeepSeek thinking mode，通常还要配置 provider-specific 的 thinking 参数。

本节示例只演示“动态选择模型”，不额外展开 thinking mode。

但要注意：

```text
不同 provider 的工具调用、结构化输出、stream 字段可能有差异。
```

所以课程示例先保持同 provider 切换，避免把兼容问题混进 middleware 学习里。

### 12. handler 里发生了什么？

动态模型选择的关键代码是：

```ts
return handler({
  ...request,
  model: useAdvanced ? advancedModel : defaultModel
});
```

这里的 `handler(...)` 表示：

```text
继续执行 LangChain 原本的模型调用流程。
```

我们没有自己调用模型 API。

我们只是告诉 LangChain：

```text
这一次模型调用，请用我替换后的 model。
```

所以 middleware 的角色是：

```text
拦截 request
修改 request
放行 request
```

### 13. 本节小结

这一节记住五句话：

```text
1. 动态选择 LLM 适合放在 wrapModelCall 里。
2. wrapModelCall 可以读取 request.messages 判断任务复杂度。
3. 通过替换 request.model，可以改变本轮实际调用的模型。
4. handler({...request, model}) 表示使用新模型继续执行。
5. middleware 让模型选择逻辑集中管理，不污染 agent 主流程。
```

一句话总结：

```text
利用 middleware 动态选择 LLM，本质上就是在模型调用前拦截 request，并替换 request.model。
```

## 09 提示词进行结构化输出和toolStrategy的区别

这一节讲一个很常见的混淆：

```text
我在 prompt 里要求模型输出 JSON，
和 LangChain 的 toolStrategy(schema) 有什么区别？
```

先给结论：

```text
提示词结构化输出：靠模型自觉按格式输出文本。
toolStrategy：把结构化输出变成一次工具调用，并由 LangChain 解析、校验、放进 structuredResponse。
providerStrategy：把 schema 交给模型服务商原生 structured output 能力，由服务商在 API 层约束输出。
```

这几种方式都能得到类似 JSON 的结果。

但它们的可靠性、返回位置、错误处理方式和模型依赖完全不一样。

### 1. 本节示例

对应文件：

```text
langchain-system-lab/src/examples/06-structured-output-strategies.ts
```

运行方式：

```bash
cd langchain-system-lab
pnpm example:structured:strategies
```

这个示例会做最多三次调用：

```text
第一次：只靠 prompt 要求模型输出 JSON。
第二次：使用 responseFormat: toolStrategy(schema)。
第三次：使用 responseFormat: providerStrategy(schema)。
```

其中 `providerStrategy` 分支默认只在 OpenAI provider 下运行。

原因是它依赖模型服务商原生 structured output 能力。

如果当前使用 DeepSeek 这类 OpenAI-compatible provider，教学示例会跳过这一段，避免把“兼容 OpenAI 调用格式”误解成“一定兼容 OpenAI 的 structured output 能力”。

每次任务相同，都是让模型输出一个课程小结：

```text
topic
summary
keyPoints
confidence
```

### 2. 提示词结构化输出是什么？

提示词结构化输出，就是在 prompt 里写：

```text
你必须只输出 JSON，不要输出 Markdown。
JSON 字段必须是：topic、summary、keyPoints、confidence。
keyPoints 必须是字符串数组，confidence 必须是 0 到 1 之间的数字。
```

然后直接调用模型：

```ts
const response = await model.invoke([
  {
    role: "system",
    content: [
      "你必须只输出 JSON，不要输出 Markdown。",
      "JSON 字段必须是：topic、summary、keyPoints、confidence。",
      "keyPoints 必须是字符串数组，confidence 必须是 0 到 1 之间的数字。"
    ].join("\n")
  },
  {
    role: "user",
    content: "请总结：LangChain middleware 可以在 agent 执行过程中拦截模型调用和工具调用。"
  }
]);
```

这时候模型返回的本质还是：

```text
一段文本
```

只是这段文本看起来像 JSON。

所以我们还需要自己做：

```ts
const parsed = JSON.parse(rawText);
const validated = LessonSummarySchema.parse(parsed);
```

也就是说：

```text
提示词负责“要求模型输出 JSON”。
应用代码负责“解析和校验 JSON”。
```

### 3. 提示词结构化输出的问题

提示词方式简单、便宜、直观。

但它有几个常见问题：

```text
模型可能输出 Markdown 代码块。
模型可能在 JSON 前后加解释文字。
模型可能漏字段。
模型可能把 number 输出成 string。
模型可能输出不合法 JSON。
模型可能字段结构对，但业务含义不对。
```

比如你要求：

```json
{
  "confidence": 0.9
}
```

模型可能输出：

```json
{
  "confidence": "0.9"
}
```

对人来说看着差不多。

但对程序来说类型已经错了。

所以提示词结构化输出适合：

```text
低风险场景
内部脚本
教学 demo
人工会看一眼的结果
失败后可以接受重试的任务
```

### 4. toolStrategy 是什么？

`toolStrategy(schema)` 是 LangChain Agent 的结构化输出策略。

它不是只在 prompt 里写“请输出 JSON”。

它会把 schema 转成一个特殊的工具，让模型通过工具调用来提交结构化结果。

示例：

```ts
const LessonSummarySchema = z.object({
  topic: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

const agent = createAgent({
  model,
  tools: [],
  responseFormat: toolStrategy(LessonSummarySchema),
  systemPrompt: "You are a concise assistant. Return the requested structured summary in Chinese."
});
```

调用后：

```ts
const response = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "请总结：LangChain middleware 可以在 agent 执行过程中拦截模型调用和工具调用。"
    }
  ]
});
```

结果不是让你自己从 `content` 里抠 JSON。

而是直接看：

```ts
response.structuredResponse
```

这就是两者最大的使用差异：

```text
提示词结构化输出 -> 看模型文本 content，然后自己 JSON.parse。
toolStrategy -> 看 response.structuredResponse。
```

### 5. toolStrategy 的运行机制

可以简化理解成：

```text
Zod Schema
  -> LangChain 转成一个结构化输出工具
  -> 模型调用这个工具提交参数
  -> LangChain 解析工具参数
  -> LangChain 用 schema 校验
  -> 校验后的结果放进 structuredResponse
```

也就是说，`toolStrategy` 走的是工具调用协议。

它更像：

```text
模型不是“写一段 JSON 文本”。
模型是在“调用一个结构化输出工具”。
```

因此它比单纯 prompt 更适合程序消费。

### 6. 两者返回结果的位置不同

提示词方式：

```ts
const response = await model.invoke(...);
console.log(response.content);
```

得到的是：

```text
AIMessage.content 里的文本
```

然后你自己解析：

```ts
const parsed = JSON.parse(response.content);
```

`toolStrategy` 方式：

```ts
const response = await agent.invoke(...);
console.log(response.structuredResponse);
```

得到的是：

```text
Agent final state 里的 structuredResponse
```

所以可以这样记：

```text
prompt JSON: 结果在 content 里。
toolStrategy: 结果在 structuredResponse 里。
```

### 7. 两者可靠性不同

提示词方式依赖模型遵守自然语言指令。

它的约束是软约束：

```text
请你输出 JSON。
不要写 Markdown。
字段必须是这些。
```

`toolStrategy` 依赖工具调用和 schema 校验。

它的约束更硬：

```text
模型必须通过工具调用提交结构化参数。
LangChain 会按 schema 校验参数。
校验失败可以触发错误处理或重试。
```

所以在工程里：

```text
prompt JSON 更灵活，但更脆。
toolStrategy 更规整，更适合后端流程。
```

### 8. 错误处理不同

提示词方式出错时，你通常要自己处理：

```text
JSON.parse 失败
Zod 校验失败
重新拼 prompt
再次调用模型
记录错误日志
降级处理
```

`toolStrategy` 提供了结构化输出错误处理选项。

比如：

```ts
responseFormat: toolStrategy(LessonSummarySchema, {
  handleError: true
})
```

也可以自定义错误提示：

```ts
responseFormat: toolStrategy(LessonSummarySchema, {
  handleError: "输出不符合 schema，请重新调用结构化输出工具。"
})
```

或者自己处理错误：

```ts
responseFormat: toolStrategy(LessonSummarySchema, {
  handleError: (error) => {
    return `结构化输出校验失败：${error.message}`;
  }
})
```

所以可以这样理解：

```text
prompt JSON: 错误处理主要靠你自己写。
toolStrategy: LangChain 提供了结构化输出层面的错误处理。
```

### 9. toolStrategy 和 providerStrategy 的关系

LangChain 结构化输出里还有一个概念：

```text
providerStrategy
```

它表示使用模型服务商原生的结构化输出能力。

这里要注意一个关键区别：

```text
toolStrategy 是 LangChain 把 schema 伪装成一个工具。
providerStrategy 是 LangChain 把 schema 传给模型服务商的原生 structured output 参数。
```

也就是说，`providerStrategy` 不依赖“模型调用一个结构化输出工具”。

它更像是告诉服务商 API：

```text
这次回答必须符合这个 JSON Schema。
你在模型服务层面帮我约束输出。
```

三者可以这样区分：

```text
prompt JSON:
  靠提示词要求模型输出 JSON 文本。

toolStrategy:
  靠工具调用协议生成结构化结果。

providerStrategy:
  靠模型服务商 API 原生 structured output 能力。
```

示例代码：

```ts
import { createAgent, providerStrategy } from "langchain";

const agent = createAgent({
  model,
  tools: [],
  responseFormat: providerStrategy({
    schema: LessonSummarySchema,
    strict: true
  }),
  systemPrompt: "You are a concise assistant. Return the requested structured summary in Chinese."
});

const response = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "请总结：LangChain middleware 可以在 agent 执行过程中拦截模型调用和工具调用。"
    }
  ]
});

console.log(response.structuredResponse);
```

注意结果仍然在：

```ts
response.structuredResponse
```

所以从业务代码读取结果的角度看：

```text
toolStrategy 和 providerStrategy 都读 structuredResponse。
```

但它们的生成路径不同：

```text
toolStrategy:
  模型输出 tool_call
  LangChain 解析 tool_call.arguments
  LangChain 校验 schema
  写入 structuredResponse

providerStrategy:
  LangChain 把 JSON Schema 传给服务商 API
  服务商原生约束模型输出
  LangChain 从模型响应中解析结构化内容
  写入 structuredResponse
```

### 10. 直接传 schema、toolStrategy、providerStrategy 的区别

LangChain 还有一个更容易让人困惑的写法：

```ts
const agent = createAgent({
  model,
  tools: [],
  responseFormat: LessonSummarySchema
});
```

这里既没有写 `toolStrategy`，也没有写 `providerStrategy`。

那它到底走哪个？

LangChain 官方文档里的规则可以这样理解：

```text
如果直接传 schema 给 responseFormat，LangChain 会根据模型能力自动选择策略。
需要强制工具调用策略时，可以显式使用 toolStrategy(schema)。
需要强制 provider 原生策略时，可以显式使用 providerStrategy(schema)。
```

所以三种写法的语义是：

```text
responseFormat: LessonSummarySchema
  让 LangChain 自动判断。

responseFormat: toolStrategy(LessonSummarySchema)
  明确要求走工具调用策略。

responseFormat: providerStrategy(LessonSummarySchema)
  明确要求走服务商原生 structured output 策略。
```

可以把直接传 schema 理解成：

```text
我只关心拿到结构化结果，具体走哪条路由 LangChain 决定。
```

把 `toolStrategy` 理解成：

```text
我希望它表现得像一次工具调用。
```

把 `providerStrategy` 理解成：

```text
我确认这个模型服务商支持原生 structured output，我希望直接使用它。
```

### 11. providerStrategy 的 strict 是什么？

`providerStrategy` 支持这样的写法：

```ts
responseFormat: providerStrategy({
  schema: LessonSummarySchema,
  strict: true
})
```

这里的 `strict` 可以理解成：

```text
尽量要求服务商按更严格的 JSON Schema 约束输出。
```

在 OpenAI 这类支持 JSON Schema structured output 的 provider 上，严格模式通常更适合后端程序消费。

比如你定义：

```ts
confidence: z.number().min(0).max(1)
```

严格约束下，我们更希望得到：

```json
{
  "confidence": 0.82
}
```

而不是：

```json
{
  "confidence": "0.82"
}
```

不过也要记住：

```text
strict 不是业务正确性的保证。
```

它能约束结构和类型，但不能保证模型总结得一定准确。

比如 `confidence` 是合法数字，不代表这个置信度就真的客观可靠。

### 12. providerStrategy 的限制

`providerStrategy` 最大的限制是：

```text
它依赖模型服务商和具体模型是否支持原生 structured output。
```

不是所有模型都支持。

也不是所有 OpenAI-compatible API 都完整支持。

这里尤其要注意：

```text
OpenAI-compatible 只表示接口形态兼容。
它不等于所有 OpenAI 专有能力都兼容。
```

所以在我们的教学项目里：

```text
OpenAI:
  可以演示 providerStrategy。

DeepSeek:
  更建议先使用 toolStrategy。
```

如果生产环境要在多个 provider 之间切换，最好不要盲目写死 `providerStrategy`。

更稳的做法是：

```text
1. 优先直接传 schema，让 LangChain 根据模型能力自动选择。
2. 对已确认支持 native structured output 的模型，显式使用 providerStrategy。
3. 对只确认支持 tool calling 的模型，显式使用 toolStrategy。
4. 对两者都不支持的模型，退回 prompt JSON + parser + retry。
```

### 13. 成本和流程差异

提示词方式通常更短：

```text
一次模型调用
返回一段 JSON-like 文本
应用自己解析
```

`toolStrategy` 在 agent 里可能会带来额外消息：

```text
模型生成结构化输出工具调用
LangChain 捕获工具参数
可能追加 ToolMessage
最终 state 里出现 structuredResponse
```

所以它可能稍微多一点 token 和流程复杂度。

`providerStrategy` 通常更直接：

```text
一次模型调用
schema 作为服务商原生结构化输出参数传入
模型返回满足 schema 的结构化内容
LangChain 写入 structuredResponse
```

它不需要把结构化输出伪装成工具调用。

所以在模型支持的前提下，`providerStrategy` 往往是更干净的路径。

但换来的是：

```text
更好的 schema 约束
更明确的结果位置
更适合生产代码读取
更容易统一错误处理
```

不过它也有一个前提：

```text
providerStrategy 的可靠性来自服务商原生能力。
如果服务商或模型不支持，就不要强行使用。
```

### 14. 什么时候用哪种？

可以先按这个经验判断：

```text
临时脚本、低风险、小 demo:
  用 prompt JSON 可以。

后端接口、自动化流程、数据库写入:
  优先用 toolStrategy 或 providerStrategy。

模型原生支持 structured output:
  优先考虑 providerStrategy。

模型不支持原生 structured output，但支持工具调用:
  用 toolStrategy。

模型不支持工具调用:
  只能退回 prompt JSON + parser + retry。
```

再具体一点：

```text
你在写教学 demo:
  prompt JSON 最容易看懂。

你在写一个 Agent 流程:
  toolStrategy 更容易和工具调用、中间件、消息历史串起来。

你在写稳定后端接口:
  providerStrategy 优先，但要确认模型支持。

你在做多模型兼容:
  可以先直接传 schema，让 LangChain 自动选；必要时再按 provider 分支显式控制。
```

### 15. 对比表

| 维度 | 提示词结构化输出 | toolStrategy | providerStrategy |
| --- | --- | --- | --- |
| 本质 | 模型输出 JSON 文本 | 模型调用结构化输出工具 | 服务商原生 structured output |
| 结果位置 | `AIMessage.content` | `response.structuredResponse` | `response.structuredResponse` |
| 约束强度 | 软约束 | 工具参数 + schema 校验 | provider API 层 schema 约束 |
| 解析责任 | 应用自己 `JSON.parse` | LangChain 解析工具参数 | LangChain 解析 provider 返回 |
| 校验责任 | 应用自己 Zod 校验 | LangChain 按 schema 校验 | provider 约束 + LangChain 解析 |
| 错误处理 | 自己写重试逻辑 | 可用 `handleError` | 主要看 provider 原生能力 |
| 依赖能力 | 普通文本生成 | 模型需要支持 tool/function calling | 模型需要支持 native structured output |
| 适合场景 | demo、低风险任务 | Agent、自动化流程、多 provider 兼容 | 后端接口、数据抽取、强结构化任务 |

### 16. 本节小结

这一节记住六句话：

```text
1. 提示词结构化输出，本质还是让模型输出一段文本。
2. toolStrategy 会把 schema 转成结构化输出工具。
3. providerStrategy 会把 schema 交给服务商原生 structured output。
4. prompt JSON 的结果在 content，toolStrategy 和 providerStrategy 的结果在 structuredResponse。
5. prompt JSON 更灵活但更脆，toolStrategy 更适合 Agent 流程。
6. 模型原生支持时优先 providerStrategy；不支持原生但支持工具调用时用 toolStrategy。
```

一句话总结：

```text
提示词结构化输出是在“劝模型写 JSON”，toolStrategy 是“让模型按工具调用协议提交结构化数据”，providerStrategy 是“让服务商 API 原生约束结构化输出”。
```

## 10 stream流式输出

这一节讲 LangChain 里的 stream 流式输出。

先说结论：

```text
普通 LLM stream:
  一边生成，一边把 token/chunk 返回给应用。

Agent stream:
  不只返回文本，还可以返回工具调用、工具结果、状态变化和最终结果。
```

所以不要把 stream 只理解成：

```text
模型一个字一个字吐出来。
```

在 Agent 场景里，stream 更像：

```text
Agent 执行过程的实时事件流。
```

### 1. 本节示例

对应文件：

```text
langchain-system-lab/src/examples/07-stream-output.ts
```

运行方式：

```bash
cd langchain-system-lab
pnpm example:stream
```

这个示例会演示两种流：

```text
model.stream()
agent.streamEvents()
```

第一种看 LLM 文本是如何逐块输出的。

第二种看 Agent 执行过程中，文本和工具调用是如何一起流出来的。

### 2. 为什么需要流式输出？

如果不用 stream，调用模型通常是这样的：

```text
请求发出去
等待模型完整生成
一次性拿到最终结果
```

用户看到的是：

```text
等待...
等待...
等待...
完整答案突然出现
```

这对体验不太友好。

尤其是：

```text
回答很长
模型比较慢
中间还有工具调用
网络延迟较高
```

stream 的价值是：

```text
模型刚生成一点内容，就先返回一点内容。
```

用户看到的是：

```text
答案正在实时出现。
系统没有卡死。
任务还在继续。
```

这也是 ChatGPT、Claude、Cursor 这类产品都大量使用流式输出的原因。

### 3. model.stream 是什么？

最基础的流式输出是直接对模型调用：

```ts
const stream = await model.stream([
  {
    role: "system",
    content: "你是一个简洁的中文技术讲师。"
  },
  {
    role: "user",
    content: "请用三句话解释 LLM 的 stream 流式输出是什么。"
  }
]);
```

然后用 `for await` 消费：

```ts
for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

这里的 `chunk` 可以理解成：

```text
模型这一次新生成的一小段内容。
```

它不是完整回答。

它更像完整回答的一片拼图。

所以真实代码里通常会一边输出，一边拼接：

```ts
let fullText = "";

for await (const chunk of stream) {
  const text = contentToText(chunk.content);
  fullText += text;
  process.stdout.write(text);
}

console.log(fullText);
```

运行时你会看到内容一段一段出现。

最后 `fullText` 才是完整答案。

### 4. chunk 是什么数据？

LangChain 的 chat model stream 返回的通常是：

```text
AIMessageChunk
```

可以把它理解成：

```text
AIMessage 的一部分。
```

完整非流式调用返回的是：

```text
AIMessage
```

流式调用返回的是：

```text
AIMessageChunk
AIMessageChunk
AIMessageChunk
...
```

每个 chunk 里面可能包含：

```text
content
tool call chunk
usage metadata
response metadata
```

最常用的是：

```ts
chunk.content
```

不过要注意，`content` 不一定永远是 string。

有些模型会返回标准 content blocks，比如：

```text
text block
reasoning block
tool call block
```

所以示例里写了一个 `contentToText()`：

```ts
function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "text" &&
          "text" in block &&
          typeof block.text === "string"
        ) {
          return block.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}
```

这不是为了炫技。

而是为了让代码在不同 provider 下更稳一点。

### 5. stream 不是 HTTP SSE

这里很容易混淆。

LangChain 的 `model.stream()` 返回的是：

```text
JavaScript AsyncIterable
```

也就是你可以这样消费：

```ts
for await (const chunk of stream) {
  ...
}
```

它不是 HTTP 协议。

它也不是 SSE。

SSE 是你在 Web 服务里把这些 chunk 再包装成：

```text
Content-Type: text/event-stream
data: ...
data: ...
data: ...
```

所以可以这样理解：

```text
LangChain stream:
  应用内部拿到一段段模型输出。

HTTP SSE:
  后端把这些输出一段段推给浏览器。
```

你的真实项目里 `/v1/chat` 用的是 SSE。

而 LangChain 这里讲的是更底层的：

```text
模型/Agent 到应用代码之间的流。
```

### 6. Agent 为什么不能只看 model.stream？

普通模型调用只有一件事：

```text
生成文本
```

但 Agent 调用可能有多件事：

```text
模型思考下一步
模型发起工具调用
工具开始执行
工具返回结果
模型继续生成最终回答
Agent 状态更新
```

如果只看 token，你会漏掉很多重要信息。

比如用户问：

```text
请查询杭州今天的天气，并告诉我适不适合散步。
```

Agent 可能会先调用工具：

```text
get_weather({ city: "杭州" })
```

然后拿到工具结果：

```text
Weather tool result: 杭州 is sunny, 24C, with light wind.
```

最后再生成自然语言回答。

这个过程里，前半段不是普通文本 token。

它是工具调用事件。

### 7. agent.streamEvents 是什么？

LangChain 现在更推荐用：

```ts
agent.streamEvents(input, { version: "v3" })
```

它返回的不是单一文本流。

它返回的是一个运行对象。

里面有多个投影：

```text
run.messages
run.toolCalls
run.values
run.output
run.subgraphs
run.extensions
```

最常用的是：

```text
run.messages:
  模型消息流，可以拿到 text token。

run.toolCalls:
  工具调用流，可以拿到工具名、输入、输出。

run.output:
  最终 Agent 状态。
```

示例：

```ts
const run = await agent.streamEvents(
  {
    messages: [
      {
        role: "user",
        content: "请查询杭州今天的天气，并用一句话告诉我适不适合散步。"
      }
    ]
  },
  { version: "v3" }
);
```

消费文本：

```ts
for await (const message of run.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

消费工具调用：

```ts
for await (const call of run.toolCalls) {
  console.log(call.name, call.input);
  console.log(await call.output);
}
```

获取最终状态：

```ts
const finalState = await run.output;
console.log(finalState.messages.length);
```

### 8. 为什么示例里用 Promise.all？

示例代码里是这样写的：

```ts
await Promise.all([
  (async () => {
    for await (const message of run.messages) {
      for await (const token of message.text) {
        process.stdout.write(token);
      }
    }
  })(),
  (async () => {
    for await (const call of run.toolCalls) {
      console.log(call.name, call.input);
      console.log(await call.output);
    }
  })()
]);
```

原因是：

```text
messages 和 toolCalls 是两个不同的流式投影。
```

如果你只按顺序先消费 `messages`，再消费 `toolCalls`，就可能错过“实时观察工具调用”的意义。

更自然的方式是：

```text
文本流和工具调用流同时监听。
```

所以用 `Promise.all()` 并发消费。

这很像真实前端里同时渲染：

```text
正在输出的回答
正在调用的工具
工具执行结果
```

### 9. streamMode 和 streamEvents 的区别

LangChain 里还会看到一种写法：

```ts
agent.stream(input, { streamMode: "messages" })
```

或者：

```ts
streamMode: "updates"
streamMode: "custom"
```

可以简单理解成：

```text
streamMode:
  更底层，按模式返回 chunk。

streamEvents v3:
  更适合应用层，把不同关心点拆成 typed projections。
```

对新项目来说，优先记：

```text
普通模型流:
  model.stream()

Agent 事件流:
  agent.streamEvents(..., { version: "v3" })
```

### 10. 和真实 Web 应用怎么接？

在真实 Web 应用里，后端通常会这样做：

```text
1. 后端调用 model.stream() 或 agent.streamEvents()
2. 后端 for await 消费 chunk/event
3. 后端把 chunk/event 包装成 SSE
4. 浏览器 EventSource 或 fetch stream 接收
5. 前端实时更新 UI
```

伪代码：

```ts
for await (const chunk of stream) {
  response.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
```

所以流式输出分两层：

```text
模型层 stream:
  LLM -> Node.js 后端

传输层 stream:
  Node.js 后端 -> 浏览器
```

LangChain 解决的是第一层。

Fastify、Next.js Route Handler、Express、Hono 这些 Web 框架解决的是第二层。

### 11. 什么时候不要用 stream？

虽然 stream 很常见，但不是所有场景都需要。

这些场景可以不用：

```text
短文本分类
结构化抽取
后台批处理
只关心最终 JSON
模型响应很短
不需要实时 UI
```

比如上一节的结构化输出：

```text
返回一个 lesson summary JSON
```

这种场景通常更关心：

```text
结果是否符合 schema
能不能稳定写入数据库
失败后如何重试
```

而不是一边生成一边展示。

### 12. 本节小结

这一节记住五句话：

```text
1. model.stream() 用来看普通 LLM 的 token/chunk 流。
2. stream 返回的是 AsyncIterable，需要用 for await 消费。
3. chunk 是部分结果，不是完整回答。
4. Agent 流式输出更适合用 agent.streamEvents(..., { version: "v3" })。
5. 真实 Web 流式应用通常还需要把 LangChain stream 再包装成 HTTP SSE。
```

一句话总结：

```text
stream 不是让模型“更快生成”，而是让应用“更早拿到正在生成的内容”。
```

## 11 stream的几种不同模式

上一节我们讲了：

```text
model.stream()
agent.streamEvents(..., { version: "v3" })
```

这一节补一个容易混淆的问题：

```text
stream 到底有哪些模式？
```

先给结论：

```text
新应用优先用 streamEvents v3。
需要看更底层的 LangGraph 执行过程时，再用 streamMode。
```

`streamEvents v3` 更像面向应用开发者的高级接口。

它把 Agent 运行过程整理成：

```text
run.messages
run.toolCalls
run.values
run.output
```

而 `streamMode` 更像底层调试和运行时观察接口。

它会让你选择：

```text
我到底想看状态？
想看 token？
想看工具生命周期？
还是想看所有 debug 信息？
```

### 1. 本节示例

对应文件：

```text
langchain-system-lab/src/examples/08-stream-modes.ts
```

运行方式：

```bash
cd langchain-system-lab
pnpm example:stream:modes
```

这个示例会演示：

```text
streamMode: "updates"
streamMode: "values"
streamMode: "messages"
streamMode: "tools"
streamMode: ["updates", "messages", "tools"]
```

注意：

```text
这个示例会多次调用模型。
真实运行会消耗 API 额度。
```

如果只是学习概念，可以先看代码和文档，不一定每次都真实执行。

### 2. 两套流式接口

LangChain / LangGraph 里现在会看到两套流式写法。

第一套是：

```ts
const run = await agent.streamEvents(input, { version: "v3" });
```

它适合应用层消费。

比如：

```ts
for await (const message of run.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

或者：

```ts
for await (const call of run.toolCalls) {
  console.log(call.name, call.input);
  console.log(await call.output);
}
```

第二套是：

```ts
const stream = await agent.stream(input, {
  streamMode: "updates"
});
```

它适合看底层执行过程。

比如：

```ts
for await (const chunk of stream) {
  console.dir(chunk, { depth: null });
}
```

可以这样区分：

```text
streamEvents v3:
  更适合写产品功能。

streamMode:
  更适合理解 Agent/Graph 内部怎么跑。
```

### 3. streamMode: updates

`updates` 表示：

```text
每个节点执行完之后，只返回这一步对 state 的增量更新。
```

示例：

```ts
const stream = await agent.stream(
  {
    messages: [
      {
        role: "user",
        content: "请查询苏州今天的天气，并用一句话告诉我适不适合散步。"
      }
    ]
  },
  { streamMode: "updates" }
);
```

消费：

```ts
for await (const chunk of stream) {
  console.dir(chunk, { depth: null });
}
```

你可能会看到类似：

```text
{
  agent: {
    messages: [...]
  }
}
```

或者：

```text
{
  tools: {
    messages: [...]
  }
}
```

这里重点是：

```text
updates 只告诉你“这一步更新了什么”。
```

它适合观察：

```text
Agent 跑到了哪个节点
模型节点产生了什么新消息
工具节点产生了什么新消息
每一步 state 如何变化
```

所以 `updates` 很适合调试 Agent 执行链路。

### 4. streamMode: values

`values` 表示：

```text
每一步执行后，返回完整 state。
```

如果 `updates` 是：

```text
只看这一步改了什么。
```

那 `values` 是：

```text
看当前完整状态长什么样。
```

示例：

```ts
const stream = await agent.stream(input, {
  streamMode: "values"
});
```

你可能会看到：

```text
{
  messages: [
    HumanMessage,
    AIMessage,
    ToolMessage,
    AIMessage
  ]
}
```

它适合观察：

```text
完整 messages 历史
当前 state 的全量内容
每一步结束后 Agent 看到的上下文
```

不过要注意：

```text
values 通常比 updates 更大。
```

因为它每一步都返回完整 state。

如果 messages 很长，`values` 的输出会很啰嗦。

### 5. updates 和 values 的区别

可以用一个简单例子理解。

假设当前 state 是：

```json
{
  "messages": ["user: hello"]
}
```

模型节点生成了一条 AI 消息。

`updates` 可能像：

```json
{
  "agent": {
    "messages": ["assistant: 我来帮你"]
  }
}
```

它强调的是：

```text
agent 节点新增了这条消息。
```

`values` 可能像：

```json
{
  "messages": [
    "user: hello",
    "assistant: 我来帮你"
  ]
}
```

它强调的是：

```text
现在完整 state 是这样。
```

所以：

```text
想看过程差量：用 updates。
想看当前全量：用 values。
```

### 6. streamMode: messages

`messages` 表示：

```text
流式输出 LLM token/message chunk。
```

它返回的不是完整 state。

而是类似：

```text
[messageChunk, metadata]
```

其中：

```text
messageChunk:
  模型这次生成的一小段内容。

metadata:
  这段内容来自哪个节点、哪个模型调用、有哪些 tags。
```

示例：

```ts
const stream = await agent.stream(input, {
  streamMode: "messages"
});
```

消费：

```ts
for await (const [messageChunk, metadata] of stream) {
  const text = contentToText(messageChunk.content);
  process.stdout.write(text);
}
```

它适合：

```text
做打字机效果
实时显示模型输出
按节点过滤 token
区分不同模型调用产生的 token
```

上一节的 `model.stream()` 只能看单个模型调用。

而 `streamMode: "messages"` 可以看：

```text
Agent/Graph 里面所有 LLM 调用产生的 token。
```

### 7. streamMode: tools

`tools` 表示：

```text
观察工具调用生命周期。
```

它关注的不是 token。

它关注：

```text
工具什么时候开始
工具输入是什么
工具有没有中间事件
工具什么时候结束
工具结果是什么
工具有没有报错
```

常见事件包括：

```text
on_tool_start
on_tool_event
on_tool_end
on_tool_error
```

示例：

```ts
const stream = await agent.stream(input, {
  streamMode: "tools"
});
```

可能看到：

```text
{
  event: "on_tool_start",
  name: "get_weather",
  input: { city: "苏州" }
}
```

然后：

```text
{
  event: "on_tool_end",
  name: "get_weather",
  output: "Weather tool result: 苏州 is sunny..."
}
```

它适合：

```text
前端展示“正在调用某某工具”
后台记录工具输入和输出
排查工具为什么没执行
排查工具为什么失败
```

如果你想做一个类似 ChatGPT 的工具调用 UI，`tools` 模式就很有用。

### 8. streamMode: custom

`custom` 表示：

```text
让节点或工具主动发出自定义进度事件。
```

它不是模型自动产生的。

它需要你在 Graph 节点或工具内部主动写：

```ts
config.writer({
  type: "progress",
  message: "已经处理 50%"
});
```

然后调用时：

```ts
const stream = await graph.stream(input, {
  streamMode: "custom"
});
```

它适合：

```text
长任务进度条
批处理进度
工具内部阶段展示
下载/检索/解析等非 LLM 过程
```

比如一个 RAG 工具可以发：

```text
正在检索文档
找到 12 个候选片段
正在 rerank
已选出 4 个上下文
```

这些不一定来自模型。

它们来自你的程序逻辑。

### 9. streamMode: debug

`debug` 表示：

```text
尽可能输出图执行过程中的调试信息。
```

它通常很啰嗦。

适合：

```text
本地调试
排查 Agent 为什么停不下来
排查节点执行顺序
排查 state 写入
排查 checkpoint/task 信息
```

不太适合直接给前端用户看。

生产里更常见的是：

```text
用户侧看 messages/tools/custom
开发者侧用 debug 或 LangSmith tracing
```

### 10. checkpoints 和 tasks

除了上面这些，底层还会看到：

```text
checkpoints
tasks
```

它们更偏 LangGraph 运行时。

`checkpoints` 关注：

```text
状态快照
恢复点
持久化执行进度
```

`tasks` 关注：

```text
任务创建
任务完成
任务中断
任务结果
```

如果你只是写普通 LangChain Agent 应用，前期可以先不用管。

等你开始做：

```text
长任务
可恢复工作流
human-in-the-loop
分布式 Agent 执行
```

再深入理解它们。

### 11. 多个 streamMode 同时使用

`streamMode` 可以传数组。

比如：

```ts
const stream = await agent.stream(input, {
  streamMode: ["updates", "messages", "tools"]
});
```

这时每个 chunk 通常会带上模式名。

你可以这样处理：

```ts
for await (const chunk of stream) {
  const [mode, payload] = chunk;

  if (mode === "messages") {
    // 处理 token
  }

  if (mode === "tools") {
    // 处理工具事件
  }

  if (mode === "updates") {
    // 处理状态增量
  }
}
```

多模式适合真实应用。

比如一个聊天 UI 可能需要同时显示：

```text
messages:
  AI 正在打字。

tools:
  正在查询天气工具。

updates:
  Agent 当前完成了哪一步。
```

但是多模式也会让处理逻辑更复杂。

所以学习时可以先单独看每一种模式。

### 12. streamEvents v3 和 streamMode 怎么选？

优先级可以这样记：

```text
只想做普通聊天打字机:
  model.stream() 或 streamEvents 的 run.messages。

想做 Agent UI:
  agent.streamEvents(..., { version: "v3" })。

想看图执行时每一步 state:
  agent.stream(..., { streamMode: "updates" })。

想看每一步完整 state:
  agent.stream(..., { streamMode: "values" })。

想看底层 token chunk 和 metadata:
  agent.stream(..., { streamMode: "messages" })。

想看工具生命周期:
  agent.stream(..., { streamMode: "tools" })。

想发自定义进度:
  streamMode: "custom"。

想调试内部执行细节:
  streamMode: "debug"。
```

对于我们现在的学习阶段，最重要的是三个：

```text
updates:
  看 Agent 每一步更新。

messages:
  看模型 token。

tools:
  看工具调用。
```

### 13. 和上一节的关系

上一节讲的是：

```text
stream 是什么？
```

这一节讲的是：

```text
stream 的内容可以按什么视角观察？
```

可以这么理解：

```text
model.stream():
  我只关心模型吐字。

agent.streamEvents():
  我关心 Agent 运行过程的应用层事件。

agent.stream({ streamMode }):
  我关心 LangGraph 运行时某个维度的底层输出。
```

它们不是互相替代。

而是抽象层次不同。

### 14. 本节小结

这一节记住六句话：

```text
1. streamEvents v3 是更推荐的应用层 Agent 流式接口。
2. streamMode 是更底层的 LangGraph 运行时流式模式。
3. updates 看状态增量。
4. values 看完整状态。
5. messages 看 LLM token/message chunk。
6. tools 看工具生命周期。
```

一句话总结：

```text
streamMode 不是“流式输出开关”，而是“你选择从哪个角度观察 Agent 的执行过程”。
```

## 12 使用value模式对tools调用进行流式输出

这一节我们把代码降到最简单。

先纠正一个小命名：

```text
课程里可以口头说 value 模式。
代码里要写 streamMode: "values"。
```

`values` 是复数。

它的含义是：

```text
每一步执行后，都把当前完整 state 返回给你。
```

当 Agent 调用 tool 时，完整 state 里的 `messages` 会逐步变成：

```text
HumanMessage
AIMessage       // 里面带 tool_calls
ToolMessage     // 工具执行结果
AIMessage       // 最终自然语言回答
```

### 1. 本节示例

对应文件：

```text
langchain-system-lab/src/examples/09-stream-tools-values.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:stream:tools:values
```

这个示例只有一个工具：

```ts
const getWeather = tool(
  async ({ city }) => {
    return `${city} 今天晴天，气温 25C，微风。`;
  },
  {
    name: "get_weather",
    description: "查询某个城市的天气。",
    schema: z.object({
      city: z.string().describe("城市名")
    })
  }
);
```

Agent 创建也很普通：

```ts
const agent = createAgent({
  model: createChatModel(activeModel),
  tools: [getWeather],
  systemPrompt: "你是一个简洁的中文助手。需要天气时必须调用 get_weather 工具。"
});
```

关键代码只有这一段：

```ts
const stream = await agent.stream(
  {
    messages: [
      {
        role: "user",
        content: "请查询杭州今天的天气，并告诉我适不适合散步。"
      }
    ]
  },
  { streamMode: "values" }
);

for await (const state of stream) {
  console.log("\n--- values chunk: 当前完整 state ---");
  printStateMessages(state);
}
```

### 2. values 模式看什么？

`values` 模式每次给你的都是：

```text
当前完整 state
```

所以示例里打印：

```ts
function printStateMessages(state: { messages?: unknown[] }) {
  const messages = state.messages ?? [];

  console.log(`当前完整 messages 数量: ${messages.length}`);

  messages.forEach((message, index) => {
    const toolCalls = (message as { tool_calls?: unknown[] }).tool_calls;
    const text = messageText(message);

    console.log(`${index + 1}. ${messageType(message)} ${text ? `- ${text}` : ""}`);

    if (toolCalls?.length) {
      console.log(`   tool_calls: ${JSON.stringify(toolCalls)}`);
    }
  });
}
```

你要观察的重点不是 token。

而是：

```text
完整 messages 是怎么一步步变长的。
```

比如：

```text
第一次：
HumanMessage

第二次：
HumanMessage
AIMessage(tool_calls: get_weather)

第三次：
HumanMessage
AIMessage(tool_calls: get_weather)
ToolMessage(杭州 今天晴天...)

第四次：
HumanMessage
AIMessage(tool_calls: get_weather)
ToolMessage(杭州 今天晴天...)
AIMessage(适合散步...)
```

这就是 `values` 模式的价值：

```text
它让你看到 Agent 当前完整上下文。
```

### 3. values 适合什么时候用？

适合：

```text
学习 Agent 状态变化
调试 messages 历史
确认 tool_calls 有没有进入上下文
确认 ToolMessage 有没有被放回模型上下文
观察最终 state 里到底有哪些消息
```

不太适合：

```text
直接做前端打字机
长对话高频输出
只关心新增消息
```

因为完整 state 可能越来越大。

一句话：

```text
values 模式看的是“当前完整状态”，不是“这一步新增了什么”。
```

## 13 使用update模式对tools调用进行流式输出

这一节讲 `updates`。

同样先纠正命名：

```text
课程里可以口头说 update 模式。
代码里要写 streamMode: "updates"。
```

`updates` 也是复数。

它的含义是：

```text
每一步执行后，只返回这一步的增量更新。
```

和 `values` 相比：

```text
values:
  给你完整 state。

updates:
  只告诉你这一步哪个节点新增了什么。
```

### 1. 本节示例

对应文件：

```text
langchain-system-lab/src/examples/10-stream-tools-updates.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:stream:tools:updates
```

关键代码：

```ts
const stream = await agent.stream(
  {
    messages: [
      {
        role: "user",
        content: "请查询杭州今天的天气，并告诉我适不适合散步。"
      }
    ]
  },
  { streamMode: "updates" }
);

for await (const update of stream) {
  console.log("\n--- updates chunk: 这一步的增量更新 ---");

  for (const [nodeName, nodeUpdate] of Object.entries(update)) {
    console.log(`节点: ${nodeName}`);
    printUpdateMessages((nodeUpdate as { messages?: unknown[] }).messages);
  }
}
```

### 2. updates 模式看什么？

`updates` 模式给你的不是完整 messages。

它更像这样：

```text
这一步 agent 节点新增了一条 AIMessage。
这一步 tools 节点新增了一条 ToolMessage。
这一步 agent 节点又新增了一条最终 AIMessage。
```

所以你可能看到类似流程：

```text
--- updates chunk ---
节点: agent
  AIMessage
  tool_calls: get_weather({ city: "杭州" })

--- updates chunk ---
节点: tools
  ToolMessage - 杭州 今天晴天，气温 25C，微风。

--- updates chunk ---
节点: agent
  AIMessage - 今天杭州天气晴朗，适合散步。
```

这比 `values` 更适合观察：

```text
Agent 每一步到底是谁在输出。
```

### 3. 为什么 tools 调用会出现在 updates 里？

因为在 Agent 图里，通常可以粗略理解成两个节点在轮流工作：

```text
agent 节点:
  调模型，决定是否调用工具。

tools 节点:
  真正执行工具，返回 ToolMessage。
```

当模型决定调用工具时，`agent` 节点会输出：

```text
AIMessage(tool_calls: ...)
```

当工具执行完成时，`tools` 节点会输出：

```text
ToolMessage(...)
```

然后 Agent 再把 ToolMessage 交回模型，生成最终回答：

```text
AIMessage(final answer)
```

所以 `updates` 模式特别适合看：

```text
模型是不是发起了工具调用？
工具节点是不是执行了？
工具结果是不是回到了模型上下文？
模型是不是基于工具结果生成了最终回答？
```

### 4. values 和 updates 怎么选？

可以这样记：

```text
我想看完整对话状态:
  用 values。

我想看每一步新增了什么:
  用 updates。
```

对工具调用来说：

```text
values:
  看完整 messages 里是否包含 AIMessage(tool_calls)、ToolMessage、最终 AIMessage。

updates:
  看 agent 节点和 tools 节点分别新增了哪些消息。
```

学习时建议先看 `updates`。

因为它更容易看出：

```text
模型 -> 工具 -> 模型
```

这个 Agent 工具调用循环。

### 5. 本节小结

记住两句话：

```text
values 看完整状态。
updates 看增量变化。
```

再具体一点：

```text
values 更像“当前聊天记录全量快照”。
updates 更像“Agent 每一步执行日志”。
```

## 14 message格式定义与建议，以及内部结构查看

这一节把两个问题放在一起讲：

```text
message 格式到底怎么定义？
message 内部结构到底长什么样？
```

因为这两个问题其实是一件事的两面。

对外使用时，message 可以很简单。

进入 LangChain 运行时以后，message 会变成更完整的对象。

### 1. 先看本节示例

对应文件：

```text
langchain-system-lab/src/examples/11-message-format-shape.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:messages
```

这个例子不会调用模型，也不需要 API Key。

它只是手动构造几条 message，然后把它们打印出来。

### 2. 最推荐的输入格式

在业务代码里，最推荐先用普通对象：

```ts
const messages = [
  {
    role: "system",
    content: "你是一个简洁的中文助手。"
  },
  {
    role: "user",
    content: "请查询杭州今天的天气，并告诉我适不适合散步。"
  }
];
```

也就是：

```text
role + content
```

这对初学和大多数业务场景都最友好。

常见 `role` 可以这样理解：

```text
system:
  系统规则，告诉模型应该扮演什么角色、遵守什么边界。

user:
  用户输入。

assistant:
  模型回复。

tool:
  工具调用结果。
```

不过在 LangChain 内部，名字会稍微不一样：

```text
system    -> SystemMessage
user      -> HumanMessage
assistant -> AIMessage
tool      -> ToolMessage
```

注意这里的 `user` 到内部会叫 `human`。

所以你在流式输出里经常看到：

```text
system
human
ai
tool
```

这不是多出来了一套概念，只是 LangChain 的内部命名。

### 3. message 内部不是普通 JSON

在 LangChain 里，message 通常会被转成 `BaseMessage` 的不同子类。

比如本节例子里手动构造了：

```ts
const internalMessages: BaseMessage[] = [
  new SystemMessage("你是一个简洁的中文助手。"),
  new HumanMessage("请查询杭州今天的天气，并告诉我适不适合散步。"),
  new AIMessage({
    content: "",
    tool_calls: [
      {
        name: "get_weather",
        args: { city: "杭州" },
        id: "call_weather_001",
        type: "tool_call"
      }
    ]
  }),
  new ToolMessage({
    content: "杭州今天晴天，气温 25C，微风。",
    name: "get_weather",
    tool_call_id: "call_weather_001",
    status: "success"
  })
];
```

这里最关键的是：

```text
普通聊天消息:
  看 content。

模型想调用工具:
  看 AIMessage.tool_calls。

工具返回结果:
  看 ToolMessage.tool_call_id 和 content。
```

### 4. BaseMessage 通用字段

大部分 message 都有这些字段：

```text
type:
  message 类型，比如 system、human、ai、tool。

content:
  message 的正文内容。

text:
  从 content 中提取出来的纯文本。

name:
  可选名字，工具消息里经常是工具名。

id:
  可选消息 ID。

additional_kwargs:
  供应商或底层协议相关的额外字段。

response_metadata:
  模型响应元信息，比如 finish_reason、模型名、token 信息等。
```

所以一个普通 `HumanMessage` 打印出来大概像这样：

```json
{
  "className": "HumanMessage",
  "type": "human",
  "content": "请查询杭州今天的天气，并告诉我适不适合散步。",
  "text": "请查询杭州今天的天气，并告诉我适不适合散步。",
  "name": null,
  "id": null,
  "additional_kwargs": {},
  "response_metadata": {}
}
```

### 5. AIMessage 里最重要的是 tool_calls

当模型决定调用工具时，它不一定会直接输出自然语言。

它可能输出一个 `AIMessage`：

```json
{
  "className": "AIMessage",
  "type": "ai",
  "content": "",
  "tool_calls": [
    {
      "name": "get_weather",
      "args": {
        "city": "杭州"
      },
      "id": "call_weather_001",
      "type": "tool_call"
    }
  ],
  "response_metadata": {
    "finish_reason": "tool_calls"
  }
}
```

这条 message 的意思不是：

```text
模型已经回答完了。
```

而是：

```text
模型说：我需要调用 get_weather 工具，参数是 { city: "杭州" }。
```

所以看 Agent 的时候，不要只盯着 `content`。

如果 `content` 是空字符串，也不代表模型什么都没做。

它可能把动作放在了：

```text
AIMessage.tool_calls
```

里面。

### 6. ToolMessage 负责把工具结果放回上下文

工具执行完成后，会生成一条 `ToolMessage`：

```json
{
  "className": "ToolMessage",
  "type": "tool",
  "content": "杭州今天晴天，气温 25C，微风。",
  "name": "get_weather",
  "tool_call_id": "call_weather_001",
  "status": "success"
}
```

这里最关键的是：

```text
tool_call_id
```

它要和前面 `AIMessage.tool_calls[0].id` 对上。

也就是：

```text
AIMessage.tool_calls[0].id
  -> call_weather_001

ToolMessage.tool_call_id
  -> call_weather_001
```

这就是 LangChain 知道“这个工具结果对应哪一次工具调用”的方式。

### 7. 一次工具调用的 message 顺序

一次典型工具调用，对话状态里通常会出现这样的顺序：

```text
HumanMessage:
  用户提出问题。

AIMessage:
  模型决定调用工具，里面有 tool_calls。

ToolMessage:
  工具执行结果，里面有 tool_call_id 和 content。

AIMessage:
  模型根据工具结果生成最终回答。
```

也就是：

```text
用户问题
  -> 模型发起工具调用
  -> 工具返回结果
  -> 模型生成最终回答
```

这也解释了为什么前面学习 `values` 和 `updates` 时，会看到 messages 越来越多。

Agent 不是只保存最终回答。

它会把中间工具调用过程也放进 message 列表。

### 8. 应该用哪种方式写 message？

我的建议是：

```text
普通调用:
  用 { role, content } 普通对象。

需要手动构造历史、工具结果、测试用例:
  用 SystemMessage、HumanMessage、AIMessage、ToolMessage。

需要判断 message 类型:
  优先用 message.type 或 AIMessage.isInstance(message) 这种类型保护。

需要调试或存储:
  用 message.toDict()，或者转成自己的 DTO。
```

不要在业务里过度依赖：

```text
message.constructor.name
```

它适合调试，不适合作为业务判断条件。

更稳的是：

```ts
if (AIMessage.isInstance(message)) {
  console.log(message.tool_calls);
}
```

或者：

```ts
if (message.type === "tool") {
  console.log(message.content);
}
```

### 9. 一个容易踩的坑：content 不一定永远是字符串

前面的例子里，`content` 都是字符串。

但在真实多模态场景里，`content` 也可能是内容块数组。

比如文本、图片、工具结果块混在一起。

所以简单学习阶段可以先写：

```ts
if (typeof message.content === "string") {
  console.log(message.content);
}
```

但生产里最好不要默认：

```text
content 一定是 string。
```

这也是为什么本节示例里同时打印了：

```text
content
text
```

`text` 更适合快速看纯文本内容。

`content` 更接近原始消息结构。

### 10. 本节小结

可以这样记：

```text
对外输入:
  role + content。

内部运行:
  BaseMessage 子类。

模型消息:
  AIMessage。

工具请求:
  AIMessage.tool_calls。

工具结果:
  ToolMessage。

工具调用关联:
  tool_calls[].id 对应 tool_call_id。
```

这节理解以后，再看 LangChain 的 Agent stream、middleware request、response messages，就不会觉得那堆对象突然冒出来了。

## 15 llm invoke 和 agent invoke 有啥区别？

先说结论：

```text
llm.invoke:
  调用模型一次。

agent.invoke:
  执行一次 Agent 工作流。
```

这两个东西看起来都叫 `invoke`，但抽象层级完全不一样。

可以这样类比：

```text
llm.invoke 是“问模型一句话”。
agent.invoke 是“让一个 agent 去完成一个任务”。
```

注意：在 JS/TS 代码里方法名是小写：

```ts
invoke(...)
```

课程里说 `Invoke` 只是口头说法。

### 1. 本节示例

对应文件：

```text
langchain-system-lab/src/examples/12-llm-vs-agent-invoke.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:invoke:compare
```

这个例子会对比三种调用：

```text
1. 直接 model.invoke(...)
2. model.bindTools(...).invoke(...)
3. agent.invoke(...)
```

为什么要看第二种？

因为它正好说明一个关键点：

```text
模型可以“提出工具调用”，但不会自动执行工具。
Agent 才负责把工具调用真的跑起来。
```

### 2. llm.invoke 是什么？

`llm.invoke` 更准确地说，是：

```text
Chat Model invoke
```

也就是直接调用聊天模型。

示例：

```ts
const llmResponse = await model.invoke([
  {
    role: "system",
    content: "你是一个简洁的中文助手。"
  },
  {
    role: "user",
    content: "请用一句话解释 llm.invoke 是什么。"
  }
]);
```

它的返回值通常是一条：

```text
AIMessage
```

也就是模型本轮生成的消息。

可以简化理解成：

```text
输入 messages
  -> 模型推理一次
  -> 输出 AIMessage
```

所以它适合：

```text
普通问答
文本改写
摘要
分类
翻译
简单结构化抽取
不需要工具循环的任务
```

### 3. llm.invoke 不会自动执行工具

这点很容易误解。

如果我们给模型绑定工具：

```ts
const toolEnabledModel = model.bindTools([getWeather]);

const response = await toolEnabledModel.invoke([
  {
    role: "system",
    content: "你是一个天气助手。需要天气时，优先调用 get_weather 工具。"
  },
  {
    role: "user",
    content: "请查询杭州今天的天气。"
  }
]);
```

模型可能返回：

```text
AIMessage(tool_calls: [...])
```

这代表模型说：

```text
我想调用 get_weather 工具。
```

但注意，它只是“提出工具调用”。

裸 `llm.invoke` 不会帮你：

```text
执行 get_weather
把工具结果包装成 ToolMessage
再把 ToolMessage 发回模型
让模型生成最终回答
```

这些都需要你自己写。

所以 `bindTools + model.invoke` 更像：

```text
让模型具备提出工具调用的能力。
```

而不是：

```text
让模型自动完成工具调用流程。
```

### 4. agent.invoke 是什么？

`agent.invoke` 调用的不是单个模型。

它调用的是一个 Agent。

示例：

```ts
const agent = createAgent({
  model,
  tools: [getWeather],
  systemPrompt: "你是一个天气助手。需要天气时必须调用 get_weather 工具，然后用中文给出最终回答。"
});

const agentResponse = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "请查询杭州今天的天气，并告诉我适不适合散步。"
    }
  ]
});
```

它内部可能会经历：

```text
调用模型
  -> 模型提出 tool_calls
  -> Agent 执行工具
  -> 生成 ToolMessage
  -> 再次调用模型
  -> 得到最终回答
```

所以 `agent.invoke` 更像：

```text
运行一个带模型、工具、消息状态、middleware 的小工作流。
```

### 5. 返回值有什么区别？

`llm.invoke` 的返回值通常是一条 message：

```ts
AIMessage
```

比如：

```text
AIMessage {
  type: "ai",
  content: "llm.invoke 是对模型进行一次直接调用。"
}
```

`agent.invoke` 的返回值通常是一个 state 对象：

```ts
{
  messages: [...]
}
```

里面可能包含多条 message：

```text
HumanMessage:
  用户输入。

AIMessage:
  模型发起工具调用，里面有 tool_calls。

ToolMessage:
  工具执行结果。

AIMessage:
  模型最终回答。
```

也就是：

```text
llm.invoke 返回“一次模型输出”。
agent.invoke 返回“任务执行后的完整状态”。
```

### 6. 两者输入格式也不同

`llm.invoke` 通常直接传 messages 数组：

```ts
await model.invoke([
  { role: "user", content: "你好" }
]);
```

`agent.invoke` 通常传一个 state：

```ts
await agent.invoke({
  messages: [
    { role: "user", content: "你好" }
  ]
});
```

为什么 Agent 外面多了一层对象？

因为 Agent 的状态不一定只有 messages。

以后可能还有：

```text
structuredResponse
自定义 state
中断状态
人工确认状态
middleware 写入的字段
```

所以 Agent 的输入输出都更像：

```text
state in
state out
```

而模型调用更像：

```text
messages in
message out
```

### 7. 什么时候用 llm.invoke？

如果你的任务是“一次模型调用就能完成”，用 `llm.invoke` 更直接。

比如：

```text
总结一段文本
翻译一句话
判断用户意图
给内容打标签
把自然语言改写成 SQL 草稿
从文本里提取字段
```

它的优点是：

```text
简单
可控
调用链短
调试容易
成本更可预测
```

### 8. 什么时候用 agent.invoke？

如果任务需要模型自己决定下一步，就更适合 `agent.invoke`。

比如：

```text
需要调用工具
可能多轮工具调用
需要根据工具结果继续推理
需要 stream 观察中间过程
需要 middleware 动态切模型
需要统一管理复杂消息状态
需要结构化输出和工具调用一起编排
```

它的优点是：

```text
能编排工具
能保留中间过程
能形成执行循环
能接入 middleware
更适合复杂 Agent 应用
```

### 9. 最容易混淆的一句话

很多人会说：

```text
LLM 不是也能 tool calling 吗？
那 Agent 还有什么用？
```

答案是：

```text
LLM tool calling 只是让模型输出“我要调用哪个工具和参数”。
Agent 负责把“工具调用请求”变成“完整执行流程”。
```

换句话说：

```text
LLM 负责想。
Tool 负责做。
Agent 负责组织“想 -> 做 -> 再想 -> 最终回答”。
```

这就是两者最大的区别。

### 10. 本节小结

可以直接记这张对照表：

```text
llm.invoke:
  抽象层级：模型
  输入：messages 数组
  输出：AIMessage
  工具：可产生 tool_calls，但不自动执行
  适合：单次推理任务

agent.invoke:
  抽象层级：Agent 工作流
  输入：state，例如 { messages: [...] }
  输出：final state，例如 { messages: [...] }
  工具：自动执行工具调用流程
  适合：多步骤、工具型、可编排任务
```

一句话总结：

```text
llm.invoke 是一次模型调用。
agent.invoke 是一次 Agent 任务执行。
```

## 16 tools状态传递的三种方式

这一节讲一个非常实战的问题：

```text
工具执行时，需要的数据到底从哪里来？
```

比如一个工具要生成个性化学习建议，它可能需要：

```text
用户想学什么主题
当前请求 ID
租户 ID
用户身份
用户历史学习主题
当前 messages
```

这些东西不能全部都让模型自己填。

在 LangChain 的 tool 里，常见有三种状态传递方式：

```text
1. tool schema 参数
2. runtime.context
3. runtime.state
```

先给一句总纲：

```text
模型应该决定“任务参数”。
系统应该注入“运行时上下文”。
Agent 应该维护“执行状态”。
```

### 1. 本节示例

对应文件：

```text
langchain-system-lab/src/examples/13-tool-state-passing.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:tools:state
```

这个示例不需要 API Key。

它使用 `fakeModel` 模拟模型发起工具调用，所以不会消耗 token。

### 2. 方式一：通过 tool schema 传参

这是最常见的一种。

定义工具时写 schema：

```ts
const recommendLearningPlan = tool(
  async ({ topic }) => {
    return `当前学习主题是：${topic}`;
  },
  {
    name: "recommend_learning_plan",
    description: "根据学习主题生成学习建议。",
    schema: z.object({
      topic: z.string().describe("用户当前想学习的主题")
    })
  }
);
```

这里的 `topic` 是模型可见的。

模型会根据用户问题生成工具调用参数：

```json
{
  "name": "recommend_learning_plan",
  "args": {
    "topic": "LangChain tools 状态传递"
  }
}
```

这种方式适合传：

```text
搜索关键词
城市名
商品名
用户自然语言里明确提到的条件
模型需要理解后决定的业务参数
```

简单说：

```text
凡是“应该由模型理解用户意图后决定”的参数，放进 tool schema。
```

### 3. 不要把敏感状态放进 tool schema

不要这样设计：

```ts
schema: z.object({
  topic: z.string(),
  userId: z.string(),
  authToken: z.string()
})
```

因为 schema 里的字段会暴露给模型。

而且这些值会变成模型需要生成的参数。

这会带来两个问题：

```text
模型可能填错。
敏感信息不该交给模型决定。
```

比如：

```text
userId
tenantId
authToken
requestId
权限信息
数据库连接信息
内部开关
```

这些都不应该让模型自己生成。

它们应该由系统注入。

### 4. 方式二：通过 runtime.context 传运行时上下文

`runtime.context` 适合传：

```text
本次请求相关
不需要持久化
不应该由模型生成
工具执行时又必须知道
```

比如：

```text
requestId
tenantId
authToken
region
locale
权限信息
当前登录用户
```

先定义 `contextSchema`：

```ts
const contextSchema = z.object({
  requestId: z.string(),
  tenantId: z.string(),
  authToken: z.string()
});
```

创建 Agent 时传进去：

```ts
const agent = createAgent({
  model,
  tools: [recommendLearningPlan],
  contextSchema
});
```

调用 Agent 时，通过第二个参数传 context：

```ts
const response = await agent.invoke(
  {
    messages: [
      {
        role: "user",
        content: "我想继续学习 LangChain tools 的状态传递。"
      }
    ]
  },
  {
    context: {
      requestId: "req_20260716_001",
      tenantId: "course-lab",
      authToken: "course-token-demo"
    }
  }
);
```

然后在工具里读取：

```ts
const recommendLearningPlan = tool(
  async ({ topic }, runtime: ToolRuntime<ToolState, ToolContext>) => {
    return JSON.stringify({
      topic,
      requestId: runtime.context.requestId,
      tenantId: runtime.context.tenantId,
      canAccessMemberContent: runtime.context.authToken.startsWith("course-token-")
    });
  },
  {
    name: "recommend_learning_plan",
    schema: z.object({
      topic: z.string()
    })
  }
);
```

这里的重点是：

```text
topic 是模型传的。
requestId / tenantId / authToken 是系统传的。
```

模型不需要知道 authToken 是什么。

工具只需要知道：

```text
这个请求有没有权限。
```

### 5. context 的特点

`runtime.context` 的特点是：

```text
只属于本次 invoke。
不作为 agent state 返回。
不默认持久化。
适合请求级别的信息。
```

所以它很适合放：

```text
登录态
租户信息
请求追踪 ID
灰度开关
权限判断函数
```

可以这样记：

```text
context 是“这一次运行的环境”。
```

### 6. 方式三：通过 runtime.state 传 Agent 状态

`runtime.state` 适合传：

```text
Agent 当前执行状态
对话消息
用户画像
任务进度
中间结果
可能需要被 Agent 返回或持久化的数据
```

先定义 `stateSchema`：

```ts
const stateSchema = z.object({
  userProfile: z.object({
    userId: z.string(),
    name: z.string(),
    level: z.enum(["beginner", "intermediate", "advanced"])
  }),
  recentTopics: z.array(z.string()).default([])
});
```

创建 Agent：

```ts
const agent = createAgent({
  model,
  tools: [recommendLearningPlan],
  stateSchema,
  contextSchema
});
```

调用时，把状态放在第一个参数里：

```ts
const response = await agent.invoke(
  {
    messages: [
      {
        role: "user",
        content: "我想继续学习 LangChain tools 的状态传递。"
      }
    ],
    userProfile: {
      userId: "user_1001",
      name: "小李",
      level: "intermediate"
    },
    recentTopics: ["stream 流式输出", "message 内部结构", "agent invoke"]
  },
  {
    context: {
      requestId: "req_20260716_001",
      tenantId: "course-lab",
      authToken: "course-token-demo"
    }
  }
);
```

工具里读取：

```ts
const recommendLearningPlan = tool(
  async ({ topic }, runtime: ToolRuntime<ToolState, ToolContext>) => {
    return JSON.stringify({
      topic,
      userId: runtime.state.userProfile.userId,
      name: runtime.state.userProfile.name,
      level: runtime.state.userProfile.level,
      recentTopics: runtime.state.recentTopics,
      messageCount: runtime.state.messages.length
    });
  },
  {
    name: "recommend_learning_plan",
    schema: z.object({
      topic: z.string()
    })
  }
);
```

注意：

```text
messages 本身也是 Agent state 的一部分。
```

所以工具可以通过：

```ts
runtime.state.messages
```

看到当前 Agent 执行到这一步时的消息列表。

### 7. state 的特点

`runtime.state` 的特点是：

```text
属于 Agent 状态。
可以作为 invoke 输入的一部分。
可以出现在最终 response 里。
配合 checkpointer 时，可以跨轮持久化。
适合任务状态和用户状态。
```

可以这样记：

```text
state 是“Agent 正在维护的工作台”。
```

而 `context` 是：

```text
这次运行的环境。
```

这两个不要混。

### 8. 示例输出怎么看？

本节示例里，模型发起的工具调用只有：

```json
{
  "name": "recommend_learning_plan",
  "args": {
    "topic": "LangChain tools 状态传递"
  },
  "id": "tool_call_state_001",
  "type": "tool_call"
}
```

也就是说，模型只负责传：

```text
topic
```

工具真正执行时，还能拿到：

```json
{
  "fromRuntimeContext": {
    "requestId": "req_20260716_001",
    "tenantId": "course-lab",
    "canAccessMemberContent": true
  },
  "fromRuntimeState": {
    "userId": "user_1001",
    "name": "小李",
    "level": "intermediate",
    "recentTopics": [
      "stream 流式输出",
      "message 内部结构",
      "agent invoke"
    ],
    "messageCount": 2
  },
  "toolCallId": "tool_call_state_001"
}
```

这个结构说明：

```text
tool args:
  模型生成。

runtime.context:
  invoke 时系统传入。

runtime.state:
  Agent 当前状态。
```

### 9. 三种方式怎么选？

可以直接用这张表：

```text
tool schema 参数:
  谁提供：模型
  模型可见：是
  是否持久化：否
  适合：用户意图里的业务参数

runtime.context:
  谁提供：应用系统
  模型可见：否
  是否持久化：否
  适合：请求级上下文、权限、租户、requestId

runtime.state:
  谁提供：Agent state
  模型可见：取决于是否放进 messages/prompt
  是否持久化：可配合 checkpointer 持久化
  适合：用户画像、任务进度、历史主题、中间结果
```

一句话判断：

```text
让模型决定的，放 tool schema。
系统注入的，放 context。
Agent 维护的，放 state。
```

### 10. 生产建议

生产里建议遵守这几条：

```text
不要让模型生成 userId、tenantId、authToken。
不要把敏感字段放进 tool schema。
工具 schema 只放“模型应该决定的参数”。
请求级元信息放 runtime.context。
会影响后续执行的业务状态放 runtime.state。
```

尤其是垂类 Agent 应用里，常见写法是：

```text
用户问题:
  messages

模型决定的业务参数:
  tool args

登录态、租户、权限:
  context

用户画像、任务进度、业务会话状态:
  state
```

这样边界会比较清楚。

### 11. 还有 store 吗？

有。

`ToolRuntime` 里还可以看到：

```text
runtime.store
runtime.toolCallId
runtime.writer
runtime.config
```

其中 `runtime.store` 更偏长期存储。

比如：

```text
跨会话记忆
用户偏好
长期任务记录
```

但这一节先不展开。

当前先掌握三种最常见的传递方式：

```text
tool args
context
state
```

### 12. 本节小结

这节记住三句话：

```text
1. tool schema 参数是给模型填的。
2. runtime.context 是系统在本次 invoke 注入的运行环境。
3. runtime.state 是 Agent 当前维护的状态。
```

如果你能分清这三类，工具设计就会稳很多。
