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

## 17 Tools 的组合调用、并行优化与性能监控

上一节解决的是：

```text
工具执行时，参数和状态从哪里来？
```

这一节解决的是：

```text
一次任务要调用多个工具时，应该怎样组织？
怎样减少等待时间？
怎样知道时间和 token 到底花在哪里？
```

### 1. 本节示例

代码位置：

```text
langchain-system-lab/src/examples/14-tools-parallel-performance.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:tools:performance
```

这个示例不调用真实 LLM，也不需要 API Key。

它用 `fakeModel` 固定模型决策，用两个带延迟的工具模拟真实网络请求：

```text
get_weather       约 400ms
get_attractions   约 600ms
```

然后分别运行：

```text
串行版本：两个工具分两轮调用
并行版本：两个工具在同一轮调用
```

### 2. 多个 Tools 有三种常见组合方式

#### 方式一：分轮串行

消息链路大致是：

```text
用户
  -> LLM
  -> tool A
  -> LLM
  -> tool B
  -> LLM
  -> 最终答案
```

如果 `tool B` 必须使用 `tool A` 的结果，这种串行是必要的。

例如：

```text
先通过手机号查询 userId
再通过 userId 查询订单
```

第二步没有第一步的结果就无法执行，不能强行并行。

#### 方式二：同一轮并行

如果两个工具互不依赖，模型可以在一个 `AIMessage` 中同时返回多个 `tool_calls`：

```ts
new AIMessage({
  content: "",
  tool_calls: [
    {
      name: "get_weather",
      args: { city: "杭州" },
      id: "weather_001",
      type: "tool_call"
    },
    {
      name: "get_attractions",
      args: { city: "杭州" },
      id: "attractions_001",
      type: "tool_call"
    }
  ]
});
```

`createAgent` 收到这样的消息后，会并发执行这两个工具。

链路变成：

```text
                 -> get_weather -----
用户 -> LLM ----|                     |-> LLM -> 最终答案
                 -> get_attractions --
```

假设两个工具分别耗时：

```text
400ms
600ms
```

那么：

```text
串行工具耗时约为：400 + 600 = 1000ms
并行工具耗时约为：max(400, 600) = 600ms
```

这里最关键的一句话是：

```text
多个 tool_calls 出现在同一个 AIMessage 中，才属于同一轮并行调用。
```

如果模型先返回一个工具，下一轮再返回另一个工具，它们仍然是串行的。

#### 方式三：组合工具

有时几个底层服务总是一起调用，可以封装成一个业务工具：

```ts
const getTravelBrief = tool(async ({ city }) => {
  const [weather, attractions] = await Promise.all([
    weatherService.query(city),
    attractionService.query(city)
  ]);

  return { weather, attractions };
});
```

这叫组合工具，也可以理解为业务级工具。

它的优点是：

```text
由代码保证并行，不依赖模型是否正确规划。
可以减少模型与 Agent 的往返轮次。
超时、重试、降级和缓存更容易统一控制。
```

但不要把所有能力都塞进一个巨型工具。

比较合适的判断方式是：

```text
调用组合比较固定：可以封装成业务工具。
调用组合由用户意图决定：保留独立工具，让 Agent 选择。
后一步依赖前一步：使用串行工作流或显式状态传递。
```

### 3. LangChain 为什么能自动并行？

Agent 的工具执行节点会收集当前 `AIMessage` 中尚未执行的 `tool_calls`，并发执行它们，再把结果转换成对应的 `ToolMessage`。

概念上可以理解为：

```ts
const results = await Promise.all(
  aiMessage.tool_calls.map((toolCall) => runTool(toolCall))
);
```

因此，应用层通常不需要再对同一轮的 `tool_calls` 手写一次 `Promise.all`。

真正决定是否并行的是调用拓扑：

```text
一个 AIMessage 有多个 tool_calls：可以并行。
多个 AIMessage 各有一个 tool_call：分轮串行。
```

### 4. 哪些工具适合并行？

适合并行：

```text
查询天气 + 查询景点
查询商品详情 + 查询库存
搜索多个独立数据源
读取多个互不依赖的文档
```

不适合直接并行：

```text
创建订单 -> 支付订单
上传文件 -> 解析该文件
查询用户 -> 使用查询结果读取订单
两个工具同时修改同一份状态
```

并行前至少确认三件事：

```text
1. 数据上没有前后依赖。
2. 工具没有冲突的副作用。
3. 下游服务允许并发，不会触发限流。
```

### 5. 为什么需要性能监控中间件？

只记录 Agent 总耗时是不够的。

例如一次请求用了 5 秒，我们还不知道是：

```text
模型慢
工具慢
工具排队
工具失败后重试
模型调用轮次太多
输入上下文太长
```

本节使用两个中间件钩子：

```text
wrapModelCall：监控每一次模型调用
wrapToolCall：监控每一次工具调用
```

核心结构如下：

```ts
const performanceMonitor = createMiddleware({
  name: "PerformanceMonitor",

  wrapModelCall: async (request, handler) => {
    const startedAt = performance.now();
    const response = await handler(request);

    record({
      phase: "model",
      durationMs: performance.now() - startedAt,
      usage: response.usage_metadata
    });

    return response;
  },

  wrapToolCall: async (request, handler) => {
    const startedAt = performance.now();
    const result = await handler(request);

    record({
      phase: "tool",
      name: request.toolCall.name,
      callId: request.toolCall.id,
      durationMs: performance.now() - startedAt
    });

    return result;
  }
});
```

`handler(request)` 是真正执行模型或工具的位置。

因此必须围绕它计时：

```text
开始时间
  -> await handler(request)
结束时间
```

### 6. 监控 token 用量

模型响应中的标准化 token 信息通常位于：

```ts
response.usage_metadata
```

典型结构：

```json
{
  "input_tokens": 250,
  "output_tokens": 35,
  "total_tokens": 285
}
```

一次 `agent.invoke` 可能调用模型很多次，所以不能只看最后一条 `AIMessage`。

应该对每次模型调用求和：

```text
Agent 总 token
  = 第一次模型调用 token
  + 第二次模型调用 token
  + ...
```

这也是并行工具可能进一步省钱的原因：

```text
串行版本通常需要更多模型往返轮次。
并行版本可能用一次模型决策发出多个工具调用。
```

注意：不同模型提供商对 usage 字段的支持可能略有差异，流式调用还需要从最终 chunk 或聚合后的消息中读取，生产代码要允许它为空。

### 7. 示例结果怎么看？

运行后会看到两份时间表。

串行版本大致是：

```text
model -> get_weather 400ms
model -> get_attractions 600ms
model -> final answer

Agent 总耗时约 1000ms
模型调用 3 次
```

并行版本大致是：

```text
model -> get_weather 400ms
      -> get_attractions 600ms
model -> final answer

Agent 总耗时约 600ms
模型调用 2 次
```

在并行时间表里，两个工具的 `startedAfterMs` 会非常接近。

这比只看总耗时更能证明它们确实发生了重叠执行。

### 8. 生产环境应该监控哪些指标？

最少建议记录：

```text
请求级：
  requestId
  agent 总耗时
  最终状态

模型级：
  provider
  model
  调用次数
  首 token 延迟
  总耗时
  input/output/total tokens
  估算成本

工具级：
  toolName
  toolCallId
  排队时间
  执行耗时
  success/error/timeout
  retry 次数
  cache hit/miss
```

聚合监控时重点看：

```text
p50：普通请求的体验
p95：大多数慢请求的体验
p99：尾部慢请求
错误率：工具是否稳定
平均工具数和模型轮次：Agent 是否绕路
```

日志中不要直接记录：

```text
authToken
完整个人信息
工具返回的敏感业务数据
未经脱敏的完整 prompt
```

### 9. 并行不是越多越好

`Promise.all` 会一次性启动所有任务。

如果模型一次生成几十个工具调用，可能造成：

```text
触发第三方 API 限流
耗尽数据库连接池
瞬间占满 CPU 或内存
一个失败导致整组任务处理复杂
```

生产环境通常还需要：

```text
并发上限
单工具超时
有限次数重试
熔断与降级
AbortSignal 取消
幂等键
```

所以正确目标不是“最大并行”，而是：

```text
在依赖关系、资源容量和业务正确性允许的范围内并行。
```

### 10. 本节小结

记住下面四句话：

```text
1. 有依赖的工具串行，无依赖的工具才并行。
2. 同一个 AIMessage 中的多个 tool_calls 会被 Agent 并发执行。
3. 固定组合可以封装成业务工具，但不要制造巨型工具。
4. 用 wrapModelCall 和 wrapToolCall 分层记录耗时、状态与 token。
```

性能优化的第一步不是立刻改成并行，而是先从监控数据里找到真正的等待时间。

## 18 max token 的核心作用

`max token` 更准确的写法通常是：

```text
max tokens
```

它最核心的作用只有一句话：

```text
限制一次模型调用最多可以生成多少输出 token。
```

在当前 TypeScript 项目的 LangChain 配置里，对应参数是：

```ts
const model = new ChatOpenAI({
  model: "deepseek-v4-flash",
  maxTokens: 600
});
```

### 1. 本节示例

代码位置：

```text
langchain-system-lab/src/examples/15-max-tokens.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:max-tokens
```

示例会使用同一个 prompt 调用模型两次：

```text
第一次：maxTokens = 80
第二次：maxTokens = 600
```

然后对比：

```text
可见输出内容
finish_reason
input tokens
output tokens
reasoning tokens
```

这个示例会调用真实模型，需要配置当前 provider 对应的 API Key。

### 2. token 到底是什么？

模型不是直接按照“字数”读写文本，而是先把文本拆成 token。

例如：

```text
输入文本
  -> tokenizer
  -> token id 序列
  -> 模型处理
```

token 可能是：

```text
一个汉字
汉字的一部分
一个英文单词
英文单词的一部分
标点或空格
```

所以不能使用固定公式把字符数换算成 token 数：

```text
字符数 != token 数
单词数 != token 数
```

实际用量应该读取模型响应中的：

```ts
response.usage_metadata
```

### 3. maxTokens 限制的是输出，不是输入

假设：

```ts
const model = new ChatOpenAI({
  maxTokens: 200
});
```

它表达的是：

```text
这一次模型最多生成 200 个 completion/output tokens。
```

它不表示：

```text
输入最多只能有 200 tokens。
输入和输出加起来最多 200 tokens。
模型一定要生成满 200 tokens。
```

因此可以记成：

```text
实际输出 tokens <= maxTokens
```

`maxTokens` 是天花板，不是目标值。

如果模型在 70 tokens 时已经完整回答，它可以自然停止，不会为了凑到 200 继续输出。

### 4. maxTokens 和上下文窗口不是一回事

每个模型还有一个更大的限制，叫上下文窗口：

```text
context window
```

可以先用这个简化公式理解：

```text
输入 tokens + 输出 tokens <= 模型上下文窗口
```

例如，假设某模型的上下文窗口是 `8,000` tokens：

```text
输入已经使用 7,500 tokens
maxTokens 配置为 1,000
```

并不代表它真的还有 1,000 tokens 可以输出，因为剩余上下文空间只有约 500 tokens。

实际可用输出预算可以粗略理解为：

```text
effective output limit
  = min(maxTokens, contextWindow - inputTokens - safetyMargin)
```

不同服务商在上下文不足时可能拒绝请求、截断输入或提前结束，所以生产代码不能假设它们的处理方式完全相同。

### 5. 为什么输出会突然断掉？

模型响应中通常可以看到：

```ts
response.response_metadata.finish_reason
```

常见值包括：

```text
stop:
  模型自然结束，或者命中了 stop sequence。

length:
  达到输出 token 上限，或者可用上下文空间耗尽。

tool_calls:
  模型停止文本生成，转而请求调用工具。

content_filter:
  输出被内容安全策略停止。
```

当看到：

```text
finish_reason = length
```

同时回答在半句话、半段 JSON 或半个代码块处结束，就应该优先检查：

```text
maxTokens 是否太小
输入上下文是否太长
推理 token 是否占用了输出预算
```

### 6. 推理模型还要考虑 reasoning tokens

普通聊天模型的输出预算比较直观：

```text
completion tokens 大部分就是看到的回答。
```

推理模型可能还会在输出预算中使用 reasoning tokens：

```text
completion/output tokens
  = reasoning tokens
  + visible answer tokens
```

因此可能出现：

```text
maxTokens 看起来不小
但模型进行了较长推理
最终可见回答仍然很短
```

可以通过下面的标准化字段观察：

```ts
response.usage_metadata?.output_token_details?.reasoning
```

并非每个 provider 都会返回这个细分字段，所以代码要允许它为空。

### 7. maxTokens 的三个直接作用

#### 控制输出长度上限

聊天机器人通常不希望一次生成一篇长论文：

```text
简短问答：较小预算
详细报告：较大预算
代码生成：为完整代码预留足够预算
```

#### 控制最坏情况下的成本

模型通常按照实际使用的 token 计费，而不是只要配置较大上限就一定全部收费。

但更大的上限允许模型生成更多内容，所以它扩大了单次请求的潜在成本。

可以把它理解为：

```text
maxTokens 是输出成本的护栏，不是精确账单。
```

#### 控制最坏情况下的延迟

生成 token 需要时间。

允许输出越长，请求可能持续越久。尤其是非流式调用，用户要等完整结果生成后才能看到内容。

所以 `maxTokens` 也是延迟保护的一部分，但它不能替代：

```text
timeout
AbortSignal
流式输出
请求取消
```

### 8. 在 Agent 中，它限制的是每一次模型调用

这是本节最重要的 Agent 结论。

假设：

```ts
const model = new ChatOpenAI({
  maxTokens: 500
});

const agent = createAgent({ model, tools });
```

一次 `agent.invoke` 可能产生：

```text
第 1 次 LLM：决定调用工具
第 2 次 LLM：继续规划
第 3 次 LLM：生成最终答案
```

这里的 `500` 是每次模型调用的输出上限，不是整个 Agent 运行累计只能使用 500 tokens。

粗略的最坏情况可能是：

```text
3 次模型调用 * 每次最多 500 output tokens
```

因此要控制整个 Agent 的成本，还需要同时限制：

```text
模型调用次数
工具调用次数
Agent 总超时
累计 token
最大迭代轮数
```

上一节的 `wrapModelCall` 性能中间件正好可以统计每轮 token，再聚合成整个 Agent 的实际用量。

### 9. maxTokens 太小会伤害 Tool Calling

工具调用参数也是模型输出的一部分。

例如模型需要生成：

```json
{
  "name": "search_orders",
  "args": {
    "userId": "user_1001",
    "startDate": "2026-07-01",
    "endDate": "2026-07-17"
  }
}
```

如果输出预算在 JSON 中途耗尽，可能得到：

```text
不完整的 tool call
invalid_tool_calls
参数解析失败
Agent 无法进入工具节点
```

因此 Agent 的规划阶段不能为了省 token 把预算压得过低。

工具数量越多、schema 越复杂，模型生成工具名和参数所需的输出空间通常也越大。

### 10. maxTokens 太小也会伤害结构化输出

对于 JSON、代码和结构化报告，截断比普通文字更危险。

普通文字被截断：

```text
可能只是少了一段结尾。
```

JSON 被截断：

```text
整个结果都可能无法解析。
```

代码被截断：

```text
可能缺少括号、函数体或关键分支。
```

所以使用 `toolStrategy`、`providerStrategy` 或 JSON Output 时，要根据 schema 的最坏输出规模设置预算，并处理 `finish_reason=length`。

### 11. Prompt 中要求“简短”和 maxTokens 有什么区别？

这两种控制不是一回事。

Prompt：

```text
请用 3 句话回答。
```

这是给模型的语义指令，模型通常会遵守，但不是绝对的硬限制。

`maxTokens`：

```ts
maxTokens: 200
```

这是 API 层的生成上限。

生产中通常两者一起使用：

```text
Prompt 控制期望的回答形态。
maxTokens 防止输出失控。
```

### 12. 应该设置多少？

没有适用于所有任务的固定答案。

建议按照任务类型分别配置：

```text
意图分类：
  输出很短，预算可以较小。

普通问答：
  根据产品期望的回答长度设置。

结构化 JSON：
  根据 schema 和数组最大长度估算。

代码或报告：
  需要更大的预算，并检测是否截断。

Agent 规划：
  必须为 tool_calls 和参数保留空间。
```

调参时不要只看平均值，要观察真实请求中的：

```text
output_tokens 分布
finish_reason=length 的比例
回答完整率
延迟 p95/p99
单请求成本
```

比较稳妥的流程是：

```text
1. 先给足够预算，收集真实 usage。
2. 查看不同任务的 output_tokens 分布。
3. 为长尾留出安全余量。
4. 对分类、聊天、报告、Agent 分别设定预算。
5. 持续监控 length 截断率和任务成功率。
```

### 13. 参数名称为什么不完全一样？

不同抽象层和 provider 的命名可能不同：

```text
LangChain JavaScript:
  maxTokens

DeepSeek Chat Completions API:
  max_tokens

部分 OpenAI 模型或接口:
  max_completion_tokens
  max_output_tokens
```

在本项目使用的 `@langchain/openai` 中，应用代码统一配置 `maxTokens`，适配器再转换成底层接口需要的参数。

所以写业务代码时先遵循当前 LangChain 集成的字段，同时核对目标 provider 和模型的官方文档。

### 14. 本节小结

记住下面六句话：

```text
1. maxTokens 限制一次模型调用的最大输出 token 数。
2. 它不限制输入，也不等于模型的上下文窗口。
3. 它是上限，不代表模型一定会生成满。
4. finish_reason=length 是预算不足的重要信号。
5. 在 Agent 中，maxTokens 对每一轮 LLM 调用分别生效。
6. 预算太小会截断文字、JSON、代码和 tool_calls。
```

一句话总结：

```text
maxTokens 是输出预算护栏；上下文窗口是输入与输出共同使用的总空间。
```

参考资料：

- [LangChain JavaScript Models](https://docs.langchain.com/oss/javascript/langchain/models)
- [LangChain JavaScript Agents](https://docs.langchain.com/oss/javascript/langchain/agents)
- [DeepSeek Chat Completion API](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)

## 19 LangGraph 短期记忆：StateSnapshot metadata 解析

这一节第一次正式接触 LangGraph，但我们只学习和短期记忆直接相关的部分。

先记住整个关系：

```text
LangChain createAgent
  -> 底层运行在 LangGraph 上
  -> LangGraph 用 state 保存当前工作状态
  -> checkpointer 按 thread_id 保存 state 快照
  -> 每份快照都带有 metadata
```

### 1. 本节示例

代码位置：

```text
langchain-system-lab/src/examples/16-short-term-memory-metadata.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:memory:metadata
```

这个示例使用确定性的本地节点，不调用真实 LLM，也不需要 API Key。

我们会完成两轮对话：

```text
第一轮：你好，我叫小李。
第二轮：我叫什么名字？
```

两次调用使用相同的：

```ts
const threadConfig = {
  configurable: {
    thread_id: "course-thread-001"
  }
};
```

第二轮能够回答“小李”，说明第一轮 state 被保存并在第二轮开始前恢复了。

### 2. 什么是短期记忆？

短期记忆不是模型参数发生了变化，也不是模型真的永久记住了用户。

它实际上是应用保存了一份会话状态：

```text
thread_id = course-thread-001

state = {
  messages: [...],
  userName: "小李",
  turnCount: 2
}
```

下一次使用相同 `thread_id` 调用时，LangGraph 会先恢复这份 state，再执行节点。

所以更准确地说：

```text
短期记忆 = thread 范围内可恢复的 Agent state。
```

它通常包含：

```text
messages
当前任务进度
本轮收集到的业务字段
工具中间结果
用户在当前会话中的临时偏好
```

### 3. State、Thread、Checkpoint 的关系

这三个词容易混在一起。

#### State

Agent 当前拥有的数据：

```ts
const ShortTermMemoryState = new StateSchema({
  messages: MessagesValue,
  userName: z.string().default(""),
  turnCount: z.number().default(0)
});
```

其中 `MessagesValue` 会按照消息 reducer 的规则追加和更新消息，而不是每次直接覆盖整个数组。

#### Thread

一段独立会话的身份：

```text
thread_id = course-thread-001
```

可以把它理解成聊天产品中的：

```text
conversationId
sessionId
chatId
```

不同 `thread_id` 的短期记忆互相隔离。

#### Checkpoint

某个执行步骤结束时保存的 state 快照。

一个 thread 不是只有一份 checkpoint，而是会随着执行不断产生历史版本：

```text
checkpoint 1
  -> checkpoint 2
  -> checkpoint 3
  -> checkpoint 4
```

最新 checkpoint 表示当前状态，旧 checkpoint 构成状态历史。

### 4. MemorySaver 做了什么？

示例中创建了：

```ts
const checkpointer = new MemorySaver();
```

然后在编译图时传入：

```ts
const graph = new StateGraph(ShortTermMemoryState)
  .addNode("memory_agent", memoryAgentNode)
  .addEdge(START, "memory_agent")
  .addEdge("memory_agent", END)
  .compile({ checkpointer });
```

没有 checkpointer 时：

```text
一次 invoke 结束后，下一次 invoke 不会自动恢复上一轮 state。
```

配置 checkpointer 和 `thread_id` 后：

```text
invoke 开始：读取该 thread 的最新 checkpoint
节点执行：读取并更新 state
执行步骤结束：保存新的 checkpoint
```

`MemorySaver` 把数据保存在当前 Node.js 进程的内存中，因此适合：

```text
本地学习
单元测试
功能原型
```

它不适合生产持久化，因为应用重启后数据就没了。

### 5. getState() 返回的不是普通 state

执行完后调用：

```ts
const snapshot = await graph.getState(threadConfig);
```

返回的是 `StateSnapshot`：

```ts
{
  values,
  next,
  config,
  metadata,
  createdAt,
  parentConfig,
  tasks
}
```

这一节只重点看：

```ts
snapshot.metadata
```

但必须先区分：

```text
snapshot.values:
  记忆里保存了什么。

snapshot.metadata:
  这份 checkpoint 是怎样产生的。
```

### 6. metadata 的实际结构

当前项目安装的 `@langchain/langgraph 1.4.7` 中，一次图节点执行完成后的 metadata 类似：

```json
{
  "source": "loop",
  "step": 3,
  "parents": {},
  "thread_id": "course-thread-001"
}
```

核心字段是：

```text
source
step
parents
thread_id
```

一些 LangGraph 版本、LangGraph Platform 返回值和官方文档示例中，还可能看到：

```json
{
  "writes": {
    "memory_agent": {
      "userName": "小李"
    }
  }
}
```

但当前本地版本没有在 `StateSnapshot.metadata` 中暴露 `writes`。

因此示例会主动打印：

```text
metadataKeys
writesFromNodes
```

你会看到真实存在的字段，以及：

```text
writesFromNodes: 当前版本未提供
```

这不是程序没有执行节点，而是当前版本的 checkpoint metadata 结构发生了变化。

### 7. source：checkpoint 从哪里来？

`source` 表示 checkpoint 的产生方式。

常见值：

```text
input:
  由 invoke/stream 的新输入产生。

loop:
  由图内部节点执行产生。

update:
  由 updateState() 手动修改状态产生。

fork:
  从某个历史 checkpoint 分叉产生。
```

本节示例中主要能看到：

```text
input
loop
```

例如第二轮输入“我叫什么名字？”进入图时，会形成输入相关 checkpoint；`memory_agent` 节点写入回答后，又会形成 `loop` checkpoint。

所以：

```text
source 不是消息的 role，也不是调用方名称。
它描述 checkpoint 在图运行中的来源。
```

### 8. step：不是对话轮数

这是最容易误解的字段。

`step` 表示 LangGraph 的 super-step 序号。

super-step 可以先简单理解为：

```text
图完成一轮可执行节点调度和状态写入的步骤编号。
```

因此：

```text
step != 对话轮数
step != messages.length
step != tool 调用次数
step != token 数量
```

一次用户对话可能经过：

```text
输入
模型节点
工具节点
模型节点
```

于是一次对话就可能让 `step` 增加多次。

本节只有一个 `memory_agent` 节点，结构非常简单。真实 Agent 有模型和工具循环时，step 增长会更快。

### 9. writes：为什么教材中可能有，本地却没有？

部分版本的 `metadata.writes` 会按节点名记录本步骤产生的 state 更新。

例如：

```json
{
  "writes": {
    "memory_agent": {
      "userName": "小李",
      "turnCount": 2
    }
  }
}
```

它可以读成：

```text
memory_agent 节点在这个 checkpoint 对 state 写入了这些内容。
```

在真实 Agent 中可能出现：

```text
agent 节点写入 AIMessage 和 tool_calls
tools 节点写入 ToolMessage
middleware 写入自定义 state
```

这个字段很适合排查：

```text
状态为什么变成了这个值？
到底是哪个节点写入的？
工具结果有没有进入 messages？
某一步是否根本没有产生更新？
```

但在当前项目的 `1.4.7` 版本里，`CheckpointMetadata` 的稳定核心主要是：

```text
source
step
parents
```

实际运行也没有返回 `writes`。

所以生产代码不要依赖：

```ts
snapshot.metadata.writes
```

需要观察每个节点的增量更新时，可以使用前面学过的：

```ts
graph.stream(input, {
  ...threadConfig,
  streamMode: "updates"
});
```

也可以使用 LangSmith trace 查看每个节点的输入和输出。

如果当前运行环境确实返回了 `writes`，仍然可以按下面的方式理解：

```text
writes 是这个步骤的增量写入。
values 是应用所有历史写入之后的当前完整状态。
```

### 10. parents：checkpoint 的来源关系

`parents` 保存 checkpoint 的父级映射。

在简单的根图中，经常看到：

```json
{
  "parents": {}
}
```

这不表示没有历史 checkpoint。

前一个 checkpoint 通常还可以通过 `StateSnapshot.parentConfig` 找到。`parents` 更常用于子图、命名空间和分叉执行之间的来源关系。

所以初学阶段看到 `{}` 是正常的。

### 11. thread_id 为什么也可能出现在 metadata？

调用时，`thread_id` 原本放在：

```ts
threadConfig.configurable.thread_id
```

读取状态快照时，LangGraph 也可能把它附加进 metadata，方便追踪这份 checkpoint 属于哪个 thread。

它的作用是定位会话，不是用户身份认证。

生产中不要直接假设：

```text
thread_id == userId
```

一个用户可以有多个 thread，一个 thread 也应该经过业务权限校验后才能访问。

### 12. getStateHistory() 能看到什么？

获取当前最新状态：

```ts
await graph.getState(threadConfig);
```

查看这个 thread 的 checkpoint 历史：

```ts
for await (const snapshot of graph.getStateHistory(threadConfig)) {
  console.log(snapshot.metadata);
}
```

示例把历史整理成表格：

```text
step
source
writesFromNodes（当前版本可能显示“未提供”）
messageCount
checkpointId
```

历史通常从较新的 checkpoint 向较旧的 checkpoint 返回。

通过这张表可以看出：

```text
同一个 thread 产生了多份状态快照。
messages 随着两轮调用逐渐累积。
input 和图内部执行对应不同 source。
step 是图执行序号，而不是消息数量。
```

### 13. 不要混淆四种 metadata

项目中可能同时出现多个同名概念。

```text
StateSnapshot.metadata:
  checkpoint 的执行来源、step 和父级关系；部分版本还包含 writes。

AIMessage.response_metadata:
  模型 provider、finish_reason 等响应信息。

AIMessage.usage_metadata:
  input/output/total tokens。

RunnableConfig.metadata:
  应用传给一次运行的标签或追踪信息。
```

本节标题中的 metadata 指的是：

```ts
StateSnapshot.metadata
```

判断方法也很简单：

```text
它和 source、step、parents 一起出现，就是 checkpoint metadata。
```

### 14. 生产环境怎么保存？

生产环境不会依赖 `MemorySaver`。

通常会换成数据库支持的 checkpointer，例如：

```text
PostgreSQL
MongoDB
Redis
其他持久化实现
```

这样应用重启或请求落到另一台实例时，仍然可以通过 `thread_id` 恢复状态。

生产设计还要考虑：

```text
thread 访问权限
checkpoint 数据保留周期
敏感消息加密和脱敏
历史消息裁剪或摘要
并发更新冲突
删除会话和隐私合规
```

### 15. 本节小结

这一节记住五句话：

```text
1. 短期记忆是按 thread 保存和恢复的 Agent state。
2. checkpointer 会在执行过程中生成 checkpoint。
3. values 是记忆内容，metadata 是 checkpoint 的产生过程。
4. source 表示来源，step 表示 super-step；writes 是否提供取决于版本和环境。
5. MemorySaver 适合学习，生产应使用持久化 checkpointer。
```

一句话总结：

```text
StateSnapshot.metadata 不是 Agent 记住了什么，而是 LangGraph 如何走到这份记忆。
```

参考资料：

- [LangChain JavaScript Short-term memory](https://docs.langchain.com/oss/javascript/langchain/short-term-memory)
- [LangGraph JavaScript Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)

## 20 内置工具解读 01：先分清 Client Tool 与 Server Tool

“内置工具”不是一个足够精确的名字。

实际开发中，至少有三类东西经常被统称为内置工具：

```text
1. 自己通过 tool() 创建的 Client Tool
2. LangChain 集成包提供的预制 Client Tool
3. 模型提供商托管的 Server Tool
```

这三类工具虽然都能交给模型选择，但执行位置、部署责任、兼容性和返回消息完全不同。

这一节先解决最重要的问题：

```text
工具到底在哪里执行？
```

### 1. 本节示例

代码位置：

```text
langchain-system-lab/src/examples/17-built-in-tools-overview.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:tools:built-in
```

这个示例不调用真实模型，不需要 API Key，也不会产生费用。

它会：

```text
实际执行一个本地 Client Tool
创建三个 OpenAI Server Tool 定义
检查它们是否具有 invoke()
对比工具的执行位置
```

### 2. 第一类：自己定义的 Client Tool

我们前面一直在使用：

```ts
const getWeather = tool(
  async ({ city }) => {
    return {
      city,
      weather: "晴",
      temperatureCelsius: 26
    };
  },
  {
    name: "get_weather",
    description: "查询指定城市的天气。",
    schema: z.object({
      city: z.string()
    })
  }
);
```

这是一个 `ClientTool`。

这里的 client 不是浏览器，而是相对于模型提供商来说的调用方应用。

执行位置是：

```text
我们自己的 Node.js 服务
```

因此它具有真正的执行函数，可以直接调用：

```ts
await getWeather.invoke({ city: "杭州" });
```

应用需要负责：

```text
业务代码
数据库连接
第三方 API Key
超时和重试
权限检查
日志和监控
部署与扩容
```

### 3. Client Tool 的完整调用链

模型不会直接进入我们的 Node.js 进程执行函数。

调用过程是：

```text
用户问题
  -> 应用把工具 schema 发给模型
  -> 模型返回 AIMessage.tool_calls
  -> LangGraph ToolNode 找到对应 ClientTool
  -> 应用执行 tool.invoke(args)
  -> 结果转换成 ToolMessage
  -> ToolMessage 再发给模型
  -> 模型生成最终答案
```

可以简写为：

```text
模型负责决定“调用什么”。
应用负责真正执行。
```

这也是为什么 Client Tool 通常会产生：

```text
AIMessage(tool_calls)
ToolMessage(result)
AIMessage(final answer)
```

### 4. 第二类：预制 Client Tool

LangChain 生态中还有大量集成工具，例如：

```text
网页搜索
数据库查询
浏览器访问
向量数据库检索
第三方 SaaS API
```

它们通常由某个 LangChain 集成包提前实现，我们不需要从零编写函数。

但是“代码不是我们写的”不等于“服务端帮我们执行”。

很多预制工具依然运行在：

```text
我们自己的应用进程
```

依然需要我们提供第三方服务的 API Key、网络和运行环境。

因此它们本质上仍然属于：

```text
Client Tool
```

判断标准不是谁写了代码，而是：

```text
谁执行工具逻辑？
```

### 5. 第三类：模型提供商的 Server Tool

有些模型厂商直接提供托管工具。

以当前 `@langchain/openai` 为例：

```ts
import { tools as openAITools } from "@langchain/openai";

const webSearch = openAITools.webSearch();
const codeInterpreter = openAITools.codeInterpreter();
const fileSearch = openAITools.fileSearch({
  vectorStoreIds: ["vs_123"]
});
```

这三个工具分别表示：

```text
webSearch:
  在模型提供商侧搜索网页。

codeInterpreter:
  在提供商托管的沙箱中运行代码。

fileSearch:
  检索已经上传到提供商向量存储中的文件。
```

它们返回的不是本地执行类，而是配置对象。

本节示例中的真实结构类似：

```json
{
  "type": "web_search",
  "filters": {
    "allowed_domains": ["docs.langchain.com"]
  },
  "search_context_size": "low"
}
```

或者：

```json
{
  "type": "code_interpreter",
  "container": {
    "type": "auto",
    "memory_limit": "1g"
  }
}
```

### 6. 为什么 Server Tool 没有 invoke()？

下面可以直接执行：

```ts
await getWeather.invoke({ city: "杭州" });
```

但下面不可以：

```ts
await webSearch.invoke(...);
```

因为 `webSearch` 只是告诉模型 API：

```text
这次请求允许使用 web_search 能力。
```

真正执行搜索的是模型提供商的服务器。

正确用法是把它作为模型请求的工具参数：

```ts
const response = await model.invoke(
  "查找今天的 LangChain 新闻",
  {
    tools: [openAITools.webSearch()]
  }
);
```

因此：

```text
ClientTool:
  是“可执行对象”。

ServerTool:
  是“提供商能力配置”。
```

### 7. Server Tool 的调用链

Server Tool 的流程更短：

```text
用户问题
  -> 应用把 Server Tool 配置发给模型提供商
  -> 提供商内部决定并执行工具
  -> 提供商把工具调用和结果放进模型响应
  -> 应用收到最终 AIMessage
```

可以简写为：

```text
模型提供商负责决定和执行。
```

与 Client Tool 不同，Server Tool 通常不需要应用创建本地 `ToolMessage` 再回传一次。

在 LangChain 的标准化消息中，服务端调用和结果可能出现在：

```ts
response.contentBlocks
```

常见 block 类型包括：

```text
server_tool_call
server_tool_result
text
```

具体内容仍然取决于 provider 和工具类型，下一部分再专门解析返回结构。

### 8. 三类工具对比

```text
自定义 Client Tool:
  谁定义：我们
  谁执行：我们的应用
  是否有 invoke：有
  可移植性：较高

预制 Client Tool:
  谁定义：LangChain 集成包
  谁执行：我们的应用
  是否有 invoke：通常有
  可移植性：取决于第三方服务

Server Tool:
  谁定义：模型提供商
  谁执行：模型提供商
  是否有 invoke：没有
  可移植性：较低，通常绑定 provider
```

最简单的判断方式：

```text
能在应用里直接 invoke 的，通常是 Client Tool。
只有 type 等配置字段的，通常是 Server Tool。
```

### 9. OpenAI 兼容接口不等于内置工具兼容

这一点和当前项目使用 DeepSeek 有直接关系。

DeepSeek 提供 OpenAI 风格的聊天接口，不代表它会实现 OpenAI 托管的：

```text
web_search
code_interpreter
file_search
image_generation
```

所以不能因为下面可以复用 `ChatOpenAI` 客户端：

```ts
new ChatOpenAI({
  baseURL: "https://api.deepseek.com"
});
```

就认为下面也一定可用：

```ts
openAITools.webSearch()
```

需要分别确认：

```text
目标 provider 是否支持该工具类型
目标模型是否支持该工具
使用的是 Chat Completions 还是 Responses API
请求字段和响应 block 是否兼容
```

对于 DeepSeek，更通用的方式通常是：

```text
保留 DeepSeek 作为负责决策的 LLM。
把搜索、数据库和业务能力封装为 Client Tool。
由自己的 Agent 执行工具并返回 ToolMessage。
```

### 10. Server Tool 的优势和代价

优势：

```text
少维护一套执行服务
减少部分模型和应用之间的往返
模型与工具结果的格式集成更紧密
代码解释器和文件检索可以快速接入
```

代价：

```text
产生额外工具费用
绑定特定 provider 和支持的模型
工具行为和运行环境可控性较低
文件或查询数据可能离开自己的基础设施
监控、缓存和调试方式与 Client Tool 不同
```

选择时不要只看代码量，还要评估：

```text
数据合规
成本
可移植性
延迟
结果质量
可观测性
```

### 11. 一个容易踩的坑

`@langchain/openai` 的 `tools` 命名空间中不只有纯 Server Tool。

当前版本还包含：

```text
localShell
shell
applyPatch
computerUse
mcp
toolSearch
```

这些能力的执行方式并不完全相同。

例如某些工具需要应用提供执行回调，有些由 provider 执行，有些需要应用和 provider 多轮协作。

所以不要只根据：

```ts
openAITools.xxx()
```

就判断它一定在服务端执行。

更可靠的判断方式是查看：

```text
返回类型是 ClientTool 还是 ServerTool
是否存在 invoke()
官方文档描述的执行位置
是否需要 execute 回调
```

### 12. 本节小结

这一节记住五句话：

```text
1. “内置工具”至少要区分 Client Tool、预制 Client Tool 和 Server Tool。
2. tool() 创建的 Client Tool 由自己的应用执行。
3. webSearch 等 Server Tool 是配置对象，由支持它的模型提供商执行。
4. OpenAI API 兼容不代表 OpenAI Server Tool 兼容。
5. 选择工具时先问执行位置，再考虑成本、合规和可移植性。
```

一句话总结：

```text
工具是不是“内置”的不重要，真正重要的是执行权和数据去了哪里。
```

参考资料：

- [LangChain JavaScript Tools](https://docs.langchain.com/oss/javascript/langchain/tools)
- [LangChain OpenAI Built-in Tools](https://docs.langchain.com/oss/javascript/integrations/tools/openai)
- [LangChain JavaScript Models: Server-side tool use](https://docs.langchain.com/oss/javascript/langchain/models)

## 21 Agent 调用的生命周期

调用：

```ts
await agent.invoke(...)
```

看起来只有一行代码，但它不一定只调用一次模型。

一个典型 Agent 会不断执行：

```text
模型判断
  -> 需要工具就执行工具
  -> 把工具结果交回模型
  -> 模型再次判断
  -> 直到生成最终回答
```

这个从 `invoke` 开始，到最终 state 返回的完整过程，就是一次 Agent run 的生命周期。

### 1. 本节示例

代码位置：

```text
langchain-system-lab/src/examples/18-agent-lifecycle.ts
```

运行：

```bash
cd langchain-system-lab
pnpm example:agent:lifecycle
```

示例使用 `fakeModel` 固定模型响应，不需要 API Key。

它模拟下面的决策：

```text
第一次模型调用：
  决定调用 get_course_progress

工具执行：
  返回课程进度

第二次模型调用：
  根据工具结果生成最终回答
```

中间件会把所有生命周期事件依次记录下来。

### 2. Agent run 不等于 model call

这是这一节最重要的区别。

```text
一次 agent.invoke：
  表示一次完整 Agent run。

一次 model.invoke：
  只表示一次模型请求。
```

一次 Agent run 内部可以包含：

```text
0 次或多次工具执行
1 次或多次模型调用
多次 state 更新
多次 checkpoint 保存
多轮 middleware hook
```

因此：

```text
Agent 总耗时 != 单次模型耗时
Agent 总 token != 最后一条 AIMessage 的 token
Agent 错误 != 一定是模型错误
```

### 3. 最外层生命周期

先只看最外层：

```text
应用调用 agent.invoke
  -> 初始化或恢复 Agent state
  -> beforeAgent
  -> 执行 Agent 循环
  -> afterAgent
  -> 返回最终 state
```

`beforeAgent` 和 `afterAgent` 面向的是整个 Agent run。

在一次正常完成的 `invoke` 中：

```text
beforeAgent：一次
afterAgent：一次
```

适合放在这里的逻辑包括：

```text
请求级日志
初始化本次 run 的状态
整体计时
最终结果审计
整次运行的数据清理
```

### 4. Agent 内部是一个循环

`createAgent()` 底层使用 LangGraph 构建图式运行时。

核心循环可以简化为：

```text
                 有 tool_calls
              ┌─────────────────┐
              ↓                 │
输入 -> 模型节点 -> 工具节点 -> 模型节点
              │
              │ 没有 tool_calls
              ↓
             结束
```

伪代码可以理解为：

```ts
while (true) {
  const aiMessage = await callModel(state);
  state.messages.push(aiMessage);

  if (!aiMessage.tool_calls?.length) {
    break;
  }

  const toolMessages = await runTools(aiMessage.tool_calls);
  state.messages.push(...toolMessages);
}
```

真实实现还包含：

```text
middleware
并行工具调用
state reducer
checkpoint
stream
retry
interrupt
结构化输出
```

但核心仍然是“模型与工具之间循环”。

### 5. 一次完整的事件顺序

本节示例的实际顺序是：

```text
application: 准备调用 agent.invoke

beforeAgent

beforeModel
wrapModelCall: before
模型第一次执行
wrapModelCall: after
afterModel

wrapToolCall: before
tool body
wrapToolCall: after

beforeModel
wrapModelCall: before
模型第二次执行
wrapModelCall: after
afterModel

afterAgent

application: agent.invoke 已返回
```

从这个顺序可以看出：

```text
Agent 级钩子包住整个循环。
Model 级钩子每调用一次模型就执行一轮。
Tool 级钩子每执行一次工具就执行一轮。
```

### 6. 每个 hook 在什么时候运行？

#### beforeAgent

执行时间：

```text
一次 Agent run 开始时，进入模型与工具循环之前。
```

典型用途：

```text
创建 run 级统计信息
读取或验证初始 state
初始化任务状态
记录请求开始
```

#### beforeModel

执行时间：

```text
每一次模型调用之前。
```

如果 Agent 调用模型三次，它通常也执行三次。

典型用途：

```text
裁剪历史消息
摘要长上下文
补充模型输入需要的 state
调用前校验
```

#### wrapModelCall

执行时间：

```text
包住每一次真正的模型请求。
```

结构类似：

```ts
wrapModelCall: async (request, handler) => {
  // 模型调用前
  const response = await handler(request);
  // 模型调用后
  return response;
}
```

典型用途：

```text
动态选择模型
重试和 fallback
单次模型耗时监控
修改临时 prompt 或 tools
```

#### afterModel

执行时间：

```text
模型已经生成 AIMessage，但工具还没有开始执行。
```

这一点很关键。

此时可以检查：

```text
最终文字
tool_calls
结构化输出
安全策略
是否需要人工审批
```

如果第一轮模型返回工具调用，顺序是：

```text
afterModel
  -> 路由判断
  -> wrapToolCall
  -> 工具执行
```

#### wrapToolCall

执行时间：

```text
包住每一次 Client Tool 执行。
```

结构类似：

```ts
wrapToolCall: async (request, handler) => {
  // 工具调用前
  const result = await handler(request);
  // 工具调用后
  return result;
}
```

典型用途：

```text
权限校验
参数修正
工具超时
错误重试
缓存
性能监控
结果脱敏
```

#### afterAgent

执行时间：

```text
Agent 已经结束模型与工具循环，即将返回最终 state。
```

典型用途：

```text
最终输出验证
整体指标汇总
审计记录
清理 run 级资源
```

### 7. Hook 调用次数怎么判断？

本节示例包含：

```text
1 次 agent.invoke
2 次模型调用
1 次工具调用
```

所以正常情况下可以预期：

```text
beforeAgent              1 次
afterAgent               1 次

beforeModel              2 次
wrapModelCall: before    2 次
wrapModelCall: after     2 次
afterModel               2 次

wrapToolCall: before     1 次
tool body                1 次
wrapToolCall: after      1 次
```

通用规律：

```text
Agent hook 次数跟 run 数量有关。
Model hook 次数跟模型调用数量有关。
Tool hook 次数跟工具调用数量有关。
```

### 8. messages 如何随生命周期增长？

初始 state：

```text
HumanMessage
```

第一次模型调用后：

```text
HumanMessage
AIMessage(tool_calls)
```

工具执行后：

```text
HumanMessage
AIMessage(tool_calls)
ToolMessage(result)
```

第二次模型调用后：

```text
HumanMessage
AIMessage(tool_calls)
ToolMessage(result)
AIMessage(final answer)
```

所以示例最终得到：

```text
messages.length = 4
```

每个 hook 看到的是执行到那个时间点时的 state，而不是永远相同的数据。

### 9. Agent 在什么时候结束？

最常见的正常结束条件是：

```text
模型返回 AIMessage，并且没有需要继续执行的 tool_calls。
```

其他停止方式还包括：

```text
达到模型或工具调用限制
达到图递归/迭代限制
中间件主动跳转到 end
结构化输出已经完成
人工审批产生 interrupt，暂时暂停
请求被取消或超时
出现未处理错误
```

注意：

```text
interrupt 是暂停并等待恢复，不一定等于生命周期彻底失败。
```

配合 checkpointer 时，Agent 可以从保存的状态继续运行。

### 10. 发生异常时，after 钩子一定执行吗？

不能简单假设一定执行。

例如：

```ts
const response = await handler(request);
```

如果 `handler` 抛出异常，并且没有在当前中间件或外层捕获：

```text
wrapModelCall 的 handler 后代码不会自然执行。
wrapToolCall 的 handler 后代码不会自然执行。
Agent 可能无法正常走到 afterAgent。
```

因此计时和资源清理通常要使用：

```ts
const startedAt = performance.now();

try {
  return await handler(request);
} finally {
  recordDuration(performance.now() - startedAt);
}
```

业务错误处理则根据需要使用：

```text
catch
retry middleware
fallback middleware
tool error ToolMessage
```

下一节会继续拆解 wrap hook 的异常和包裹行为。

### 11. Checkpointer 在生命周期中的位置

配置 checkpointer 后，短期记忆会参与生命周期：

```text
invoke 开始：
  根据 thread_id 恢复最新 state

图执行过程中：
  在步骤边界保存 checkpoint

invoke 结束：
  最新 state 留在当前 thread
```

所以 Agent 生命周期不仅是函数调用顺序，也包括：

```text
state 读取
state 更新
state 持久化
```

这正好衔接上一节的 `StateSnapshot.metadata`。

### 12. 如何在生产中观察生命周期？

有三种常见方式：

```text
Middleware：
  执行业务级日志、监控、权限和重试。

Stream：
  实时向调用方发送模型、工具和 state 更新。

LangSmith Trace：
  查看完整 run、子 run、模型调用和工具调用树。
```

建议至少给一次 Agent run 统一关联：

```text
requestId
threadId
runId
modelCallId
toolCallId
```

否则模型和工具多轮循环后，日志很难拼回一条完整链路。

### 13. 本节小结

记住下面五句话：

```text
1. 一次 agent.invoke 是完整 run，不等于一次模型调用。
2. Agent 会在模型节点与工具节点之间循环。
3. beforeAgent/afterAgent 面向整次 run，通常各执行一次。
4. Model 和 Tool hook 会随着实际调用次数重复执行。
5. 模型不再返回 tool_calls 时，Agent 通常结束并返回最终 state。
```

一句话总结：

```text
Agent 生命周期是一层 run，里面包着多轮 model 和 tool 生命周期。
```

参考资料：

- [LangChain JavaScript Agents](https://docs.langchain.com/oss/javascript/langchain/agents)
- [LangChain JavaScript Custom Middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/custom)
- [LangChain JavaScript Context Engineering](https://docs.langchain.com/oss/javascript/langchain/context-engineering)

## 22 定义一个最小化的 MCP 服务

这一节先不急着背 MCP 的完整定义。

我们先做一个能够真正运行的最小系统：

```text
MCP Client
  -> 发现 add 工具
  -> 调用 add({ a: 7, b: 5 })
  -> MCP Server 执行加法
  -> 返回文本 12
```

跑通之后，再回头解释 Host、Client、Server、Transport 和 Protocol 会容易很多。

### 1. 本节代码

MCP Server：

```text
langchain-system-lab/src/mcp/01-minimal-server.ts
```

验证 Client：

```text
langchain-system-lab/src/mcp/02-verify-minimal-server.ts
```

运行完整验证：

```bash
cd langchain-system-lab
pnpm example:mcp:minimal
```

这个示例：

```text
不需要 LLM
不需要 API Key
不需要 HTTP 端口
不产生模型费用
```

### 2. 安装官方 TypeScript SDK

项目增加了：

```bash
pnpm add @modelcontextprotocol/sdk@^1.29.0
```

截至 `2026-07-17`，官方 TypeScript SDK v2 仍处于 beta，v1.x 仍是官方建议的生产版本。因此本节固定使用稳定的：

```text
@modelcontextprotocol/sdk 1.29.x
```

当前版本要求：

```text
Node.js >= 18
Zod 3.25+ 或 Zod 4
```

本项目已经使用 Zod 4，不需要再引入另一套 schema 库。

### 3. 最小 Server 完整代码

核心代码只有下面这些：

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "minimal-calculator-server",
  version: "1.0.0"
});

server.registerTool(
  "add",
  {
    description: "计算两个数字之和。",
    inputSchema: {
      a: z.number(),
      b: z.number()
    }
  },
  async ({ a, b }) => ({
    content: [
      {
        type: "text",
        text: String(a + b)
      }
    ]
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

接下来逐块解释。

### 4. McpServer 是什么？

首先创建服务实例：

```ts
const server = new McpServer({
  name: "minimal-calculator-server",
  version: "1.0.0"
});
```

这里声明的是 Server 身份，不是工具本身。

它会在 MCP 初始化握手中告诉 Client：

```text
我叫什么名字
我的版本是什么
我支持哪些 MCP 能力
```

一个 MCP Server 可以暴露三类主要能力：

```text
Tools：
  可以执行的函数或操作。

Resources：
  可以读取的数据或内容。

Prompts：
  可以获取的提示词模板。
```

本节为了最小化，只暴露一个 Tool。

### 5. registerTool() 做了什么？

注册工具：

```ts
server.registerTool("add", config, handler);
```

这三个参数分别是：

```text
"add":
  协议中的工具名称。

config:
  工具描述、输入 schema 等元数据。

handler:
  Client 真正调用工具时执行的业务函数。
```

可以把它类比成：

```text
REST 路由：
  method + path + handler

MCP 工具：
  name + schema + handler
```

但 MCP 工具天然带有机器可读 schema，Client 可以先发现工具，再决定怎样展示或交给 LLM 使用。

### 6. inputSchema 有什么作用？

```ts
inputSchema: {
  a: z.number().describe("第一个数字"),
  b: z.number().describe("第二个数字")
}
```

它同时承担三件事：

```text
描述：告诉 Client 和 LLM 参数含义。
校验：拒绝不符合类型的调用参数。
类型推导：让 TypeScript 知道 handler 中 a、b 是 number。
```

Client 调用：

```json
{
  "name": "add",
  "arguments": {
    "a": 7,
    "b": 5
  }
}
```

如果传入：

```json
{
  "a": "seven",
  "b": 5
}
```

SDK 会在进入业务 handler 前进行参数校验。

### 7. Tool 为什么返回 content 数组？

Handler 返回：

```ts
{
  content: [
    {
      type: "text",
      text: "12"
    }
  ]
}
```

MCP Tool 的结果不是只能返回一个字符串。

`content` 使用数组，是因为一次结果可以包含多个内容块，例如：

```text
text
image
audio
嵌入的 resource
resource link
```

本节只返回最简单的文本块。

如果业务需要稳定的机器可读结果，还可以在后面学习：

```text
outputSchema
structuredContent
```

当前先把协议调用链跑通。

### 8. Transport 是什么？

MCP Server 需要通过某种传输方式与 Client 交换协议消息。

本节使用：

```ts
const transport = new StdioServerTransport();
await server.connect(transport);
```

`stdio` 表示：

```text
Client 启动 Server 子进程。
Client 通过 Server 的 stdin 发送 MCP 消息。
Server 通过 stdout 返回 MCP 消息。
```

它非常适合：

```text
本地开发工具
IDE 插件
桌面 Agent
同一台机器上的进程集成
```

下一阶段需要跨机器调用时，再换成 Streamable HTTP。

### 9. 为什么 stdio Server 不能 console.log？

因为 stdout 已经是协议通道。

错误写法：

```ts
console.log("MCP Server started");
```

这段普通文本会混入 JSON-RPC 消息流，可能导致 Client 无法解析协议。

需要调试时写 stderr：

```ts
console.error("MCP Server started");
```

或者使用写入文件、stderr 的日志系统。

因此本节 Server 本体没有任何 `console.log()`。

### 10. 为什么直接运行 Server 看起来没有反应？

可以单独启动：

```bash
pnpm mcp:minimal:server
```

终端看起来会一直等待，而且没有输出。

这是正常现象：

```text
Server 已连接 stdio transport。
它正在等待 MCP Client 通过 stdin 发来协议请求。
```

它不是命令执行完就退出的普通脚本，也不是启动后打印 URL 的 HTTP 服务。

停止时可以按：

```text
Ctrl+C
```

学习阶段更推荐直接运行验证 Client，它会自动启动和关闭 Server。

### 11. 验证 Client 做了什么？

验证程序首先创建 MCP Client：

```ts
const client = new Client({
  name: "minimal-server-verifier",
  version: "1.0.0"
});
```

然后通过 `StdioClientTransport` 启动 Server 子进程：

```ts
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", serverFile]
});

await client.connect(transport);
```

`connect()` 不只是打开管道，还会完成 MCP 初始化握手和能力协商。

然后执行两个核心协议操作。

#### 发现工具

```ts
const tools = await client.listTools();
```

对应 MCP 方法：

```text
tools/list
```

Client 会得到 `add` 的名称、描述和 JSON Schema。

#### 调用工具

```ts
const result = await client.callTool({
  name: "add",
  arguments: {
    a: 7,
    b: 5
  }
});
```

对应 MCP 方法：

```text
tools/call
```

最后使用：

```ts
await client.close();
```

关闭连接和 Server 子进程。

### 12. 运行结果怎么看？

`tools/list` 会返回类似：

```json
{
  "tools": [
    {
      "name": "add",
      "description": "计算两个数字之和。",
      "inputSchema": {
        "type": "object",
        "properties": {
          "a": { "type": "number" },
          "b": { "type": "number" }
        },
        "required": ["a", "b"]
      }
    }
  ]
}
```

这说明 Client 不需要提前硬编码工具参数结构，也能发现 Server 的能力。

`tools/call` 会返回：

```json
{
  "content": [
    {
      "type": "text",
      "text": "12"
    }
  ]
}
```

这说明：

```text
Client 已经通过 MCP 协议调用 Server。
Server 完成参数校验和业务执行。
结果按照 MCP content block 返回。
```

### 13. MCP Server 里面为什么没有 LLM？

因为 MCP Server 的职责不是理解自然语言，也不是决定调用哪个工具。

它只负责：

```text
声明能力
接收标准协议调用
校验参数
执行工具或读取数据
返回标准协议结果
```

通常是 MCP Host 中的 Agent 或 LLM 决定：

```text
是否调用 add
什么时候调用
参数应该是什么
如何使用返回结果
```

所以：

```text
MCP Server 可以完全不依赖任何大模型。
```

本节验证 Client 也是直接调用工具，没有使用 LLM。

### 14. Host、Client、Server 初步关系

现在可以先建立一个最小认识：

```text
MCP Host
  承载聊天应用或 Agent，例如 IDE、桌面应用、LangChain 应用。

MCP Client
  Host 内负责连接某一个 MCP Server 的协议组件。

MCP Server
  暴露 Tools、Resources、Prompts 等能力。

Transport
  Client 和 Server 交换 MCP 消息的通道。
```

本节程序中没有完整 Host，只写了：

```text
测试 Client
  -> stdio
  -> minimal-calculator-server
```

后面的 LangChain 章节会让 Agent 成为真正的工具使用者。

### 15. 最小不等于生产可用

这个 Server 故意没有加入：

```text
身份认证
权限控制
超时
限流
审计日志
持久化
优雅关闭
业务错误映射
指标监控
```

它的唯一目标是证明：

```text
一个 MCP Server 至少需要什么？
```

答案是：

```text
Server 身份
至少一个能力
能力处理函数
一个 Transport
```

### 16. 本节小结

记住下面六句话：

```text
1. MCP Server 不一定包含 LLM，它负责标准化暴露能力。
2. registerTool() 注册工具名称、schema 和执行函数。
3. tools/list 用于发现工具，tools/call 用于调用工具。
4. stdio 通过子进程 stdin/stdout 传输 MCP 消息。
5. stdio Server 不能把普通日志写入 stdout。
6. 本节的 add 工具证明 MCP 可以在零模型参与下独立运行。
```

一句话总结：

```text
最小 MCP Server，就是“一个可发现、可校验、可调用的标准化工具进程”。
```

参考资料：

- [MCP 官方教程：Build an MCP server](https://modelcontextprotocol.io/docs/develop/build-server)
- [MCP 官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## 23 到底什么是 MCP？

MCP 的全称是：

```text
Model Context Protocol
模型上下文协议
```

先给出一句最重要的定义：

```text
MCP 是 AI 应用与外部能力提供方之间的一套标准通信协议。
```

它让 AI 应用可以用相对统一的方式：

```text
发现能力
理解参数
调用能力
读取上下文
接收结果
协商协议版本与双方能力
```

这里的“外部能力”可能来自：

```text
本地文件
数据库
公司内部 API
GitHub
浏览器
搜索服务
支付或订单系统
```

MCP 本身不是模型，也不会替 Agent 做决策。它解决的是：

```text
Agent 决定需要某项能力之后，怎样用标准方式找到并调用它？
```

### 1. 从上一节的 add 服务反推 MCP

上一节运行了：

```bash
pnpm example:mcp:minimal
```

完整过程是：

```text
Client 连接 Server
  -> listTools()
  -> 发现 add 的名称、说明和参数 schema
  -> callTool({ name: "add", arguments: { a: 7, b: 5 } })
  -> Server 返回 content: [{ type: "text", text: "12" }]
```

这个过程没有 LLM，也没有 Agent。

它证明 MCP 最基础的能力不是“让模型变聪明”，而是建立一份双方都能理解的协议：

```text
怎样连接
怎样声明身份和能力
怎样发现工具
怎样描述参数
怎样发起调用
怎样返回结果
```

如果没有 MCP，调用方也能直接调用一个函数或 REST API，但必须针对每个服务分别适配：

```text
服务地址是什么？
认证信息放在哪里？
工具名称是什么？
参数格式是什么？
返回结构是什么？
错误如何表达？
```

MCP 把其中通用的通信部分标准化了。

### 2. 为什么需要 MCP？

假设有三种 AI 应用：

```text
IDE
桌面聊天应用
LangChain Agent
```

又有四种外部能力：

```text
文件系统
数据库
GitHub
企业知识库
```

没有统一协议时，每个应用都可能为每项能力写一套专用集成：

```text
IDE -> 文件系统适配器
IDE -> 数据库适配器
IDE -> GitHub 适配器
...
LangChain Agent -> 企业知识库适配器
```

接入关系很容易变成：

```text
N 个应用 x M 个能力提供方
```

使用 MCP 后，双方围绕同一份协议实现：

```text
AI 应用实现 MCP Host / Client
能力提供方实现 MCP Server
```

这不会消除业务接入、认证和权限设计，但会显著减少协议层的重复适配。

MCP 经常被类比为 AI 应用的 USB-C。这个类比有帮助，但不要理解过头：

```text
统一接口，只代表双方可以按相同规则通信；
不代表所有设备能力相同，也不代表连接后自动获得权限。
```

### 3. Host、Client、Server 到底是什么？

MCP 的基本架构是：

```text
用户
  |
  v
MCP Host：IDE、聊天应用、LangChain 应用
  |-- LLM / Agent
  |-- MCP Client A <----> MCP Server A <----> 文件系统
  |-- MCP Client B <----> MCP Server B <----> 数据库或 REST API
  `-- MCP Client C <----> MCP Server C <----> GitHub
```

三个角色分别负责：

```text
Host：
  面向用户的 AI 应用。
  管理模型、对话、权限、多个 Client 以及结果怎样进入上下文。

Client：
  Host 内部的协议组件。
  与某一个 Server 建立连接并收发 MCP 消息。

Server：
  能力提供方。
  通过 MCP 暴露 Tools、Resources、Prompts 等能力。
```

一个 Host 可以连接多个 Server。按照 MCP 架构，每个 Client 通常维护一条到特定 Server 的专用连接。

上一节的验证程序只包含：

```text
测试 Client <----> add Server
```

它没有用户界面和 LLM，因此还不是一个完整的 MCP Host 应用，但已经足以验证协议。

### 4. LLM 会直接连接 MCP Server 吗？

通常不会。

更准确的调用链是：

```text
用户
  -> Host
  -> LLM
  -> LLM 表达“我要调用 add”
  -> Host 把调用路由给 MCP Client
  -> MCP Client 调用 MCP Server
  -> Server 返回结果
  -> Host 把结果放回模型上下文
  -> LLM 生成最终回答
```

所以需要区分两件事：

```text
LLM 负责：
  根据上下文决定是否使用工具，以及生成工具参数。

MCP 负责：
  Client 与 Server 如何发现能力、发起调用和交换结果。
```

Host 也可以不经过 LLM，直接调用 MCP 工具。上一节的验证 Client 就是这样做的。

这说明：

```text
“必须由 LLM 选择工具”不是 MCP 协议的要求。
```

### 5. 一次真实的 MCP 工具调用怎样发生？

将 LangChain Agent 接入 MCP 后，一次典型调用可以拆成九步：

```text
1. Host 创建 MCP Client。
2. Client 通过 stdio 或 Streamable HTTP 连接 Server。
3. 双方通过 initialize 协商协议版本和能力。
4. Client 通过 tools/list 获取工具及其 JSON Schema。
5. Host 把这些工具转换成模型能够理解的 Tool 定义。
6. LLM 根据用户问题生成工具调用意图和参数。
7. Host 通过 Client 发送 tools/call。
8. Server 执行业务逻辑并返回 content 或 structuredContent。
9. Host 把工具结果交给 LLM，模型继续推理或生成最终回答。
```

其中：

```text
第 3、4、7、8 步主要属于 MCP 协议范围。
第 5、6、9 步属于 Host、Agent 框架和模型的工作。
```

这条边界非常重要。MCP 规定“能力如何交换”，不规定 Agent 应该如何思考。

### 6. MCP 有哪两层？

可以把 MCP 拆成数据层和传输层。

#### 数据层

数据层定义消息“说什么”，主要包括：

```text
JSON-RPC 2.0 消息格式
初始化与生命周期
能力协商
Tools、Resources、Prompts 等原语
请求、响应与通知
错误表达
```

例如：

```text
initialize
tools/list
tools/call
resources/list
resources/read
prompts/list
prompts/get
```

#### 传输层

传输层定义消息“怎么送过去”。官方主要支持：

```text
stdio：
  Client 启动本地 Server 子进程，通过 stdin/stdout 通信。

Streamable HTTP：
  Client 通过 HTTP 与远程或独立部署的 Server 通信。
```

因此：

```text
MCP 不等于 stdio，也不等于 HTTP。
stdio 和 Streamable HTTP 只是承载同一套 MCP 语义的不同传输方式。
```

### 7. 初始化为什么重要？

MCP 不是一连上就盲目调用的无状态约定。

正式工作前，Client 和 Server 会完成初始化：

```text
Client -> initialize：
  我支持哪个协议版本、拥有哪些能力、身份是什么。

Server -> initialize result：
  我选择哪个协议版本、拥有哪些能力、身份是什么。

Client -> initialized notification：
  初始化完成，可以开始正常通信。
```

这叫能力协商。

它允许不同 Client 和 Server 明确知道对方支持什么，而不是依靠猜测。

### 8. Server 可以暴露什么？

最常见的三类 Server 原语是：

| 原语 | 用途 | 常见操作 | 例子 |
| --- | --- | --- | --- |
| Tools | 执行动作或计算 | `tools/list`、`tools/call` | 查询天气、创建订单、执行 SQL |
| Resources | 提供可读取的上下文 | `resources/list`、`resources/read` | 文件、文档、数据库 schema |
| Prompts | 提供可复用的提示模板 | `prompts/list`、`prompts/get` | 代码审查模板、周报模板 |

一个容易记忆的区分是：

```text
Tool：做一件事。
Resource：读一份内容。
Prompt：获得一套交互模板。
```

这只是理解模型，不代表 MCP 自动替你建立安全边界。Server 仍然必须校验权限和输入。

MCP 还定义了一些由 Client 提供、供 Server 请求使用的能力，例如：

```text
Sampling：请求 Host 使用模型生成内容。
Elicitation：请求 Host 向用户补充信息或确认。
Logging：发送结构化日志消息。
```

初学阶段先掌握 Tools 即可，后面遇到需求再扩展。

### 9. MCP 和 Function Calling 有什么区别？

它们处在不同边界：

```text
Function Calling / Tool Calling：
  主要约定应用怎样向模型描述工具，
  以及模型怎样表达“我要调用哪个工具、参数是什么”。

MCP：
  主要约定 Host 中的 Client 怎样发现和调用外部 Server 的能力。
```

二者经常协作：

```text
MCP Server
  -> tools/list 返回工具 schema
  -> Host 转换成模型的 Function Calling 定义
  -> 模型返回 tool call
  -> Host 转换成 MCP tools/call
```

因此 MCP 没有替代 Function Calling，它为 Function Calling 后面的能力接入提供了标准协议。

### 10. MCP 和 LangChain Tool 有什么区别？

```text
LangChain Tool：
  LangChain 运行时中的工具抽象。
  它可以直接包装当前进程里的 TypeScript 函数。

MCP Tool：
  由 MCP Server 通过协议暴露的工具。
  Client 可以在运行时发现并调用它。
```

二者也不是竞争关系。

在 LangChain 应用中，通常会把 MCP Server 发现到的工具适配成 LangChain Tool，然后交给 Agent 使用：

```text
MCP Tool -> LangChain Tool -> Agent
```

下一节“在 LangChain 中调用天气查询 MCP 服务”就会完成这一步。

### 11. MCP 和 REST API 有什么区别？

REST API 通常面向普通软件系统，MCP 主要面向 AI Host 与能力提供方的集成。

```text
REST API 关注：
  HTTP 资源、路径、方法、状态码和业务数据。

MCP 关注：
  能力发现、schema、调用、内容块、生命周期和能力协商。
```

一个 MCP Server 完全可以在内部继续调用 REST API：

```text
LangChain Agent
  -> MCP Client
  -> 天气 MCP Server
  -> 第三方天气 REST API
```

所以 MCP 更像 AI 侧的标准适配层，不是要求企业把现有 REST 服务全部重写。

### 12. MCP 不是什么？

为了避免概念无限扩大，记住 MCP 不是：

```text
不是 LLM：
  它不生成答案，也没有推理能力。

不是 Agent 框架：
  它不提供规划、循环、记忆和工作流编排。

不是工具实现：
  它不替你实现天气查询、数据库访问或订单逻辑。

不是 REST 的全面替代品：
  Server 内部仍可使用 REST、RPC、数据库或本地函数。

不是权限魔法：
  能发现工具不等于有权执行工具。

不是“接上就一定兼容”：
  协议格式统一，不代表不同 Server 的业务语义相同。
```

### 13. MCP 标准化了什么，没有标准化什么？

MCP 主要标准化：

```text
连接后的初始化和生命周期
协议版本与能力协商
Tools、Resources、Prompts 等原语
能力发现和调用方法
输入 schema 与结果内容结构
请求、响应、通知和错误的基本形式
stdio 与 Streamable HTTP 等传输方式
```

MCP 不负责决定：

```text
使用哪一个 LLM
怎样写系统提示词
Agent 什么时候调用工具
多个工具怎样规划和编排
业务结果是否正确
租户、角色和审批规则怎样设计
工具结果怎样展示给用户
```

官方对 MCP 范围的描述也强调：协议关注上下文交换，不规定 AI 应用如何使用 LLM 或管理上下文。

### 14. 安全边界在哪里？

生产环境不能因为工具来自 MCP 就默认信任它。

Host 侧至少需要考虑：

```text
只连接可信 Server
向用户展示敏感工具的真实影响
对写操作、付款、删除等动作增加确认
限制 Server 能接触的文件、网络和凭据
把 Server 描述和工具结果当作不可信输入
记录工具名称、参数、结果、耗时和调用者
```

Server 侧至少需要考虑：

```text
身份认证与业务授权
参数校验
最小权限
超时、限流和资源隔离
敏感信息脱敏
幂等与审计
```

最关键的一句话是：

```text
协议兼容性解决“能不能通信”，权限系统解决“允不允许执行”。
```

### 15. 用一句完整的话描述 MCP

现在可以给出比开头更完整的定义：

```text
MCP 是一种基于 Client-Server 架构的开放协议，
它通过标准化的生命周期、能力协商、原语和消息格式，
让 AI Host 能够发现并使用本地或远程 Server 暴露的上下文与工具；
它不负责模型推理、Agent 编排和具体业务实现。
```

### 16. 本节小结

记住下面八句话：

```text
1. MCP 是协议，不是模型、Agent 框架或工具库。
2. Host 是 AI 应用，Client 是协议连接组件，Server 是能力提供方。
3. LLM 通常不直接连接 MCP Server，Host 负责在二者之间编排。
4. Tools 用来执行，Resources 用来读取，Prompts 用来复用模板。
5. MCP 数据层使用 JSON-RPC 2.0，并有初始化和能力协商。
6. stdio 与 Streamable HTTP 是传输方式，不是 MCP 本身。
7. MCP 可以和 Function Calling、LangChain Tool、REST API 同时存在。
8. MCP 标准化通信，但不替代业务权限、安全和 Agent 决策。
```

一句话总结：

```text
MCP 不是 Agent 的大脑，而是 Agent 连接外部世界时使用的标准接口。
```

参考资料：

- [MCP 官方架构说明](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP Server Concepts](https://modelcontextprotocol.io/docs/learn/server-concepts)
- [MCP Lifecycle 规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [MCP Transports 规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

## 24 在 LangChain 中调用天气查询 MCP 服务

上一节建立了这条概念链：

```text
LLM 决定是否调用工具
MCP 负责 Host 与 Server 之间的标准通信
```

这一节把它真正运行起来：

```text
用户问题
  -> LangChain Agent
  -> LLM 生成 get_weather tool call
  -> LangChain MCP Adapter
  -> stdio MCP Client
  -> Weather MCP Server
  -> ToolMessage
  -> LLM 生成最终中文回答
```

为了只关注 LangChain 与 MCP 的集成，天气 Server 使用课程内置固定数据，不依赖天气 API，也不代表实时天气。

### 1. 本节代码

天气 MCP Server：

```text
langchain-system-lab/src/mcp/03-weather-server.ts
```

LangChain Agent：

```text
langchain-system-lab/src/mcp/04-langchain-weather-agent.ts
```

运行完整 Agent：

```bash
cd langchain-system-lab
pnpm example:mcp:weather
```

完整模式需要 `.env` 中配置的 OpenAI 或 DeepSeek API Key，会产生少量模型调用费用。

只验证 MCP 与 LangChain Tool 适配，不调用 LLM：

```bash
pnpm example:mcp:weather -- --tool-only
```

### 2. 安装 LangChain MCP Adapter

项目增加了：

```bash
pnpm add @langchain/mcp-adapters@^1.1.3
```

两个包的职责不同：

```text
@modelcontextprotocol/sdk：
  实现 MCP Client、Server 和 Transport。

@langchain/mcp-adapters：
  把 MCP Server 暴露的工具转换为 LangChain 可以使用的 Tool。
```

本节最关键的桥梁就是：

```text
MCP Tool
  -> @langchain/mcp-adapters
  -> LangChain DynamicStructuredTool
  -> createAgent({ tools })
```

### 3. 天气 MCP Server 做了什么？

Server 创建方式和上一节相同：

```ts
const server = new McpServer({
  name: "course-weather-server",
  version: "1.0.0"
});
```

然后注册 `get_weather`：

```ts
server.registerTool(
  "get_weather",
  {
    description: "查询城市天气。当前提供上海、北京和深圳的课程演示数据，不代表实时天气。",
    inputSchema: {
      city: z.string().min(1).describe("要查询的城市，例如：上海")
    }
  },
  async ({ city }) => {
    // 查询课程内置天气数据并返回 MCP content
  }
);
```

它向 Client 声明了三件事：

```text
工具名：get_weather
工具用途：查询城市天气
输入参数：{ city: string }
```

成功结果使用 MCP content block 返回：

```ts
return {
  content: [
    {
      type: "text",
      text: JSON.stringify(weather, null, 2)
    }
  ]
};
```

未知城市则返回：

```ts
return {
  isError: true,
  content: [
    {
      type: "text",
      text: "暂时没有该城市的演示天气数据……"
    }
  ]
};
```

`isError: true` 表示工具已经正常接收到调用，但业务执行没有得到成功结果。

### 4. Server 为什么仍然使用 stdio？

启动代码是：

```ts
const transport = new StdioServerTransport();
await server.connect(transport);
```

本节的重点是 LangChain 集成，不是 HTTP 部署，因此继续使用最简单的本地子进程模型：

```text
LangChain 进程
  -> 启动 Weather Server 子进程
  -> stdin 发送 MCP 请求
  <- stdout 接收 MCP 响应
```

下一节会再把同一个 MCP 服务改造成 HTTP 服务。

### 5. 创建 MultiServerMCPClient

Agent 端首先导入：

```ts
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
```

然后配置 Weather Server：

```ts
const client = new MultiServerMCPClient({
  weather: {
    transport: "stdio",
    command: process.execPath,
    args: ["--import", "tsx", serverFile]
  }
});
```

配置逐项解释：

```text
weather：
  Host 内部给这条 Server 连接起的名字。

transport: "stdio"：
  使用本地进程的标准输入输出通信。

command: process.execPath：
  使用当前正在运行的 Node.js 可执行文件。

args: ["--import", "tsx", serverFile]：
  让 Node.js 通过 tsx 直接运行 TypeScript Server 文件。
```

`serverFile` 被转换成绝对路径：

```ts
const serverFile = fileURLToPath(
  new URL("./03-weather-server.ts", import.meta.url)
);
```

stdio Server 由 Client 作为子进程启动时，绝对路径比依赖当前工作目录的相对路径更稳定。

虽然本节只有一个 Server，仍使用 `MultiServerMCPClient`，因为同一个 Client 后续可以继续配置：

```text
weather
database
filesystem
github
```

### 6. getTools() 是本节的核心

真正完成 MCP 与 LangChain 转换的是：

```ts
const tools = await client.getTools();
```

这一行背后大致发生：

```text
1. 启动 Weather MCP Server 子进程。
2. 创建 stdio Transport。
3. 完成 initialize 初始化和能力协商。
4. 发送 tools/list。
5. 收到 get_weather 的名称、描述和 inputSchema。
6. 把它包装成 LangChain DynamicStructuredTool。
```

因此可以直接查看：

```ts
tools.forEach((tool) => {
  console.log(`- ${tool.name}: ${tool.description}`);
});
```

实际输出：

```text
- get_weather: 查询城市天气。当前提供上海、北京和深圳的课程演示数据，不代表实时天气。
```

注意 Agent 代码里没有再次手写：

```ts
tool(handler, {
  name: "get_weather",
  schema: ...
});
```

工具定义的唯一来源是 MCP Server。

这就是 MCP 的价值之一：Host 可以在运行时发现能力，而不是把每个外部工具的 schema 重复写进 Agent。

### 7. 先绕过 LLM 验证适配结果

`--tool-only` 模式从工具数组中找到 `get_weather`：

```ts
const weatherTool = tools.find(
  (tool) => tool.name === "get_weather"
);
```

然后像普通 LangChain Tool 一样调用：

```ts
const result = await weatherTool.invoke({ city: "上海" });
```

代码看起来是普通 LangChain Tool 调用，但内部实际路径是：

```text
weatherTool.invoke({ city: "上海" })
  -> Adapter 转成 MCP tools/call
  -> Weather MCP Server handler
  -> MCP content
  -> Adapter 转回 LangChain Tool 结果
```

实际输出：

```json
{
  "city": "上海",
  "condition": "多云",
  "temperatureC": 24,
  "humidityPercent": 68,
  "wind": "东南风 2 级",
  "outdoorAdvice": "适合散步，建议随身带伞。",
  "dataSource": "课程内置演示数据，非实时天气"
}
```

这种分层验证很有用：

```text
tool-only 失败：
  优先检查 Server、Transport、MCP schema 或 Adapter。

tool-only 成功但 Agent 失败：
  优先检查模型的 Tool Calling 能力、Prompt 或模型响应。
```

### 8. 把 MCP Tools 交给 Agent

`getTools()` 返回的数组可以直接传给 `createAgent()`：

```ts
const agent = createAgent({
  model: createChatModel(activeModel),
  tools,
  systemPrompt: [
    "你是一个简洁的中文天气助手。",
    "查询天气时必须使用 get_weather 工具，不要自行编造天气。",
    "工具返回的是课程演示数据，最终回答必须明确说明它不是实时天气。"
  ].join("\n")
});
```

从 `createAgent()` 的视角看，它并不关心工具来自哪里：

```text
本地 tool() 包装的函数
MCP Adapter 加载的工具
其他 Toolkit 提供的工具
```

只要最终符合 LangChain Tool 接口，Agent 就可以统一编排。

### 9. 发起 Agent 调用

调用方式与前面章节完全相同：

```ts
const response = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "请查询上海的天气，并告诉我是否适合散步。"
    }
  ]
});
```

用户没有显式指定工具参数格式，只说了自然语言。

LLM 根据工具描述和 schema 生成：

```json
{
  "name": "get_weather",
  "args": {
    "city": "上海"
  }
}
```

随后 Agent 自动完成工具执行和模型续答。

### 10. 四条 messages 怎样理解？

实际运行得到四条消息。

#### 第 1 条：HumanMessage

```text
请查询上海的天气，并告诉我是否适合散步。
```

这是用户原始问题。

#### 第 2 条：AIMessage + tool_calls

```json
{
  "name": "get_weather",
  "args": {
    "city": "上海"
  },
  "type": "tool_call"
}
```

这时模型还没有天气结果，只表达了调用意图。

#### 第 3 条：ToolMessage

```json
{
  "city": "上海",
  "condition": "多云",
  "temperatureC": 24,
  "humidityPercent": 68,
  "wind": "东南风 2 级",
  "outdoorAdvice": "适合散步，建议随身带伞。",
  "dataSource": "课程内置演示数据，非实时天气"
}
```

这条内容经过了：

```text
LangChain ToolNode
  -> MCP Adapter
  -> MCP tools/call
  -> Weather Server
  -> MCP Adapter
  -> ToolMessage
```

#### 第 4 条：AIMessage

模型读取 ToolMessage 后，生成面向用户的最终回答，并明确说明数据不是实时天气。

因此整个 Agent 循环仍然是熟悉的：

```text
model -> tools -> model
```

只是工具节点内部多了一段 MCP 调用。

### 11. 谁负责工具选择，谁负责工具执行？

这一节可以把职责分得非常清楚：

```text
Weather MCP Server：
  定义并执行 get_weather。

MultiServerMCPClient：
  连接 Server、发现工具、发送调用、接收结果。

@langchain/mcp-adapters：
  在 MCP Tool 和 LangChain Tool 之间转换。

LangChain Agent：
  管理 model -> tool -> model 循环。

LLM：
  根据用户问题决定调用 get_weather，并生成 city 参数。
```

最值得记住的是：

```text
MCP Server 不知道用户的完整对话，也不负责选择自己。
它只收到 get_weather({ city: "上海" }) 并返回结果。
```

### 12. 为什么一定要 close()？

Client 被放在 `try/finally` 中：

```ts
try {
  const tools = await client.getTools();
  // 创建并调用 Agent
} finally {
  await client.close();
}
```

本节使用 stdio Transport，Client 启动了一个 Server 子进程。

`close()` 用来关闭连接并清理子进程。即使模型调用或工具执行抛出异常，`finally` 也会执行。

如果遗漏清理，可能出现：

```text
脚本一直不退出
残留 Server 子进程
连接和系统资源泄漏
测试进程互相影响
```

### 13. 换成真实天气 API，需要改哪里？

Agent 端原则上不需要改。

只需要替换 Weather Server handler 的内部实现：

```text
当前：
  从 weatherByCity Map 读取课程数据。

生产：
  城市名 -> 经纬度
  -> 调用天气 REST API
  -> 校验和归一化结果
  -> 返回 MCP content / structuredContent
```

只要继续保持：

```text
工具名
输入 schema
返回语义
```

Agent 侧的 `client.getTools()` 和 `createAgent({ tools })` 可以保持不变。

这也展示了 MCP Server 作为适配层的意义：外部 API 的认证、限流、数据清洗和错误映射，可以封装在 Server 内部。

### 14. 本节小结

记住下面七句话：

```text
1. @langchain/mcp-adapters 负责把 MCP Tool 转成 LangChain Tool。
2. MultiServerMCPClient 负责连接一个或多个 MCP Server。
3. getTools() 会发现 Server 工具并返回 LangChain 工具数组。
4. Agent 无须知道工具来自本地函数还是 MCP Server。
5. LLM 负责选择 get_weather 和生成 city 参数。
6. MCP Server 只负责执行天气查询并返回协议结果。
7. stdio Client 使用完后必须 close()，以清理连接和子进程。
```

一句话总结：

```text
LangChain 不会直接重写 MCP 工具，而是通过 Adapter 把 MCP Server 的能力装配进现有 Agent 工具循环。
```

参考资料：

- [LangChain JavaScript MCP 官方文档](https://docs.langchain.com/oss/javascript/langchain/mcp)
- [MCP 官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Tools 概念](https://modelcontextprotocol.io/docs/learn/server-concepts#tools)

## 25 把 MCP 改成 HTTP 服务

上一节使用 stdio：

```text
LangChain Client
  -> 启动 Weather Server 子进程
  -> stdin/stdout 传输 MCP 消息
```

这一节把 Weather MCP Server 改成独立 HTTP 服务：

```text
LangChain Agent 进程
  -> HTTP 请求
  -> http://127.0.0.1:3001/mcp
  -> Weather MCP Server 进程
```

最重要的变化只有一层：

```text
stdio Transport -> Streamable HTTP Transport
```

工具名、参数 schema、业务 handler、Agent 调用方式和最终 messages 循环都保持不变。

### 1. 为什么不是旧的 SSE Transport？

当前 MCP 官方推荐远程服务使用：

```text
Streamable HTTP
```

早期 MCP 教程中经常出现：

```text
HTTP + SSE
SSEServerTransport
transport: "sse"
```

这种旧 Transport 现在主要用于向后兼容。新服务应优先使用：

```ts
StreamableHTTPServerTransport
```

LangChain Client 对应配置为：

```ts
transport: "http"
```

不要因为 Streamable HTTP 可以使用 SSE 响应流，就把它和旧版 SSE Transport 当成同一个协议实现。

### 2. 本节代码

共享的天气 MCP Server 工厂：

```text
langchain-system-lab/src/mcp/weather-server-factory.ts
```

stdio 入口：

```text
langchain-system-lab/src/mcp/03-weather-server.ts
```

LangChain Client / Agent：

```text
langchain-system-lab/src/mcp/04-langchain-weather-agent.ts
```

新增 HTTP 入口：

```text
langchain-system-lab/src/mcp/05-weather-http-server.ts
```

### 3. 为什么先抽出 Server 工厂？

原来的文件同时包含两类代码：

```text
业务能力：
  get_weather 的 schema、天气数据和 handler。

传输入口：
  创建 StdioServerTransport 并连接。
```

为了让两个 Transport 使用完全相同的工具定义，现在把业务能力抽成：

```ts
export function createWeatherMcpServer(): McpServer {
  const server = new McpServer({
    name: "course-weather-server",
    version: "1.0.0"
  });

  server.registerTool("get_weather", config, handler);
  return server;
}
```

stdio 入口只负责：

```ts
const server = createWeatherMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
```

HTTP 入口也调用同一个工厂。

这能清楚表达：

```text
MCP Server 能力与 Transport 是两个不同维度。
```

业务逻辑不应该因为从 stdio 换成 HTTP 而复制一份。

### 4. 创建 HTTP 应用

HTTP Server 使用 SDK 提供的 Express 工厂：

```ts
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

const app = createMcpExpressApp({ host });
```

本节默认：

```text
host: 127.0.0.1
port: 3001
MCP endpoint: http://127.0.0.1:3001/mcp
health endpoint: http://127.0.0.1:3001/health
```

之所以绑定 `127.0.0.1`，是因为它只供本机课程示例使用，不应该默认暴露到局域网。

`createMcpExpressApp({ host: "127.0.0.1" })` 还会启用 SDK 针对本地服务提供的 Host Header / DNS rebinding 防护。

端口可以覆盖：

```bash
MCP_WEATHER_PORT=3100 pnpm mcp:weather:http:server
```

Client URL 也可以覆盖：

```bash
MCP_WEATHER_URL=http://127.0.0.1:3100/mcp \
  pnpm example:mcp:weather:http
```

### 5. 添加普通健康检查

HTTP Server 增加了一个普通 HTTP 路由：

```ts
app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "course-weather-mcp"
  });
});
```

可以检查：

```bash
curl http://127.0.0.1:3001/health
```

返回：

```json
{
  "status": "ok",
  "service": "course-weather-mcp"
}
```

注意：

```text
/health 是普通运维接口，不是 MCP 协议方法。
/mcp 才是 MCP Client 连接的协议端点。
```

### 6. 创建 Streamable HTTP Transport

核心代码是：

```ts
app.post("/mcp", async (request, response) => {
  const server = createWeatherMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  await server.connect(transport);
  await transport.handleRequest(request, response, request.body);
});
```

逐项解释。

#### sessionIdGenerator: undefined

表示使用无会话模式：

```text
不生成 Mcp-Session-Id
不在内存中维护 Client Session
不支持会话恢复
每个请求可以独立处理
```

本节只有无状态天气查询，使用无会话模式最容易理解。

#### enableJsonResponse: true

表示普通请求直接返回 JSON 响应，而不是为响应建立 SSE 流。

它依然是 Streamable HTTP Transport，只是本节不需要：

```text
服务端主动通知
长时间 SSE 流
断线恢复
```

#### transport.handleRequest()

它把 Express 的 HTTP 请求交给 MCP Transport：

```text
读取 JSON-RPC 消息
识别 initialize、tools/list、tools/call
交给 McpServer 处理
把 MCP Result 写入 HTTP response
```

Express 本身并不知道 `tools/call` 是什么意思，真正处理 MCP 语义的是 Transport 和 McpServer。

### 7. 为什么每个 POST 都创建 Server 和 Transport？

无会话模式下，本节采用官方示例的结构：

```ts
app.post("/mcp", async (request, response) => {
  const server = createWeatherMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  // 处理当前请求
});
```

请求关闭后清理：

```ts
response.on("close", () => {
  void transport.close();
  void server.close();
});
```

这与 stateful 模式不同。

有状态服务通常需要：

```text
生成 Session ID
保存 Session ID -> Transport 映射
后续请求根据 Mcp-Session-Id 找回 Transport
处理 GET SSE 流
处理 DELETE 终止会话
考虑多实例之间的 Session 路由
```

本节先不引入这些复杂度。

### 8. GET 和 DELETE 为什么返回 405？

本节启用了：

```text
无会话
JSON response
无服务端通知流
```

因此只需要 `POST /mcp`。

代码对下面两个请求明确返回 `405 Method Not Allowed`：

```text
GET /mcp
DELETE /mcp
```

这不是说 Streamable HTTP 永远不使用 GET 和 DELETE。

在有状态或支持 SSE 通知的实现中，它们可能分别用于：

```text
GET：建立服务端到 Client 的 SSE 消息流。
DELETE：终止指定 MCP Session。
```

当前模式不具备这些能力，所以应该明确拒绝，而不是制造一个看似成功但没有语义的路由。

### 9. 启动 HTTP Server

第一个终端运行：

```bash
cd langchain-system-lab
pnpm mcp:weather:http:server
```

输出：

```text
Weather MCP Server: http://127.0.0.1:3001/mcp
Health check: http://127.0.0.1:3001/health
```

与 stdio 不同，HTTP Server 是独立常驻进程：

```text
它不会由 LangChain Client 自动启动。
它可以同时接受多个 Client 的请求。
Agent 退出后它仍然继续运行。
```

### 10. LangChain Client 怎样切换到 HTTP？

stdio 配置是：

```ts
{
  transport: "stdio",
  command: process.execPath,
  args: ["--import", "tsx", serverFile]
}
```

HTTP 配置简化为：

```ts
{
  transport: "http",
  url: "http://127.0.0.1:3001/mcp"
}
```

本节复用同一个 Agent 文件，通过 `--http` 选择配置：

```ts
const useHttp = process.argv.includes("--http");

const client = useHttp
  ? new MultiServerMCPClient({
      weather: {
        transport: "http",
        url: weatherHttpUrl
      }
    })
  : new MultiServerMCPClient({
      weather: {
        transport: "stdio",
        command: process.execPath,
        args: ["--import", "tsx", serverFile]
      }
    });
```

后面的代码完全不变：

```ts
const tools = await client.getTools();

const agent = createAgent({
  model,
  tools,
  systemPrompt
});
```

这说明 LangChain Adapter 屏蔽了 Transport 差异。

### 11. 先运行无模型验证

保持 HTTP Server 运行，在第二个终端执行：

```bash
pnpm example:mcp:weather:http -- --tool-only
```

实际输出：

```text
## MCP transport: Streamable HTTP (http://127.0.0.1:3001/mcp)
## LangChain 从 MCP Server 加载到的工具
- get_weather: 查询城市天气……

## 不经过 LLM，直接调用适配后的 LangChain Tool
{
  "city": "上海",
  "condition": "多云",
  "temperatureC": 24,
  ...
}
```

这证明 HTTP 链路已经完成：

```text
initialize
  -> tools/list
  -> get_weather.invoke()
  -> tools/call
  -> MCP result
```

### 12. 运行完整 Agent

第二个终端执行：

```bash
pnpm example:mcp:weather:http
```

实际 messages 仍然是：

```text
1. HumanMessage
2. AIMessage + get_weather tool_call
3. ToolMessage + 天气结果
4. AIMessage + 最终回答
```

Agent 生命周期没有变：

```text
model -> tools -> model
```

变化只发生在 Tool 内部：

```text
上一节：
  Tool -> stdio -> Server 子进程

这一节：
  Tool -> Streamable HTTP -> 独立 Server 进程
```

### 13. HTTP MCP 是 REST API 吗？

不是。

表面上它使用 HTTP，但没有为每个 Tool 创建 REST 路由：

```text
错误理解：
  GET /weather?city=上海
  POST /tools/get-weather

本节真实接口：
  POST /mcp
```

具体操作位于 JSON-RPC 消息中：

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "上海"
    }
  },
  "id": 1
}
```

所以它是：

```text
HTTP 负责传输
JSON-RPC 表达请求和响应
MCP 定义 method、生命周期和能力语义
```

不能只用普通浏览器地址栏访问 `/mcp` 来完成一次有效 MCP 调用，因为 MCP Client 还需要处理初始化、协议版本、请求 ID 和正确的请求头。

### 14. client.close() 的含义发生了什么变化？

Agent 代码仍然执行：

```ts
await client.close();
```

但两种模式的影响不同：

```text
stdio：
  关闭 Transport，并清理由 Client 启动的 Server 子进程。

HTTP：
  关闭 Client 侧连接资源，但不会关闭独立 HTTP Server。
```

因此 HTTP Server 必须自己管理生命周期。

本节监听：

```text
SIGINT
SIGTERM
```

收到信号后停止接受新连接并关闭 HTTP Server。

### 15. 生产环境还缺什么？

当前 Server 只适合本地教学。

部署到网络环境前至少需要增加：

```text
HTTPS / TLS
身份认证和工具级授权
请求限流
超时与并发控制
结构化日志和 tracing
输入、输出与错误脱敏
反向代理配置
Host 校验与正确的 CORS 策略
健康检查与优雅关闭
Server 和 Tool 版本管理
```

如果需要有状态 Session，还要增加：

```text
Session ID 生成与校验
Transport 生命周期管理
Session 过期清理
多实例 Session 路由或共享存储
断线恢复和 Event Store
```

特别注意：

```text
把 host 从 127.0.0.1 改成 0.0.0.0，
不只是“让其他机器能访问”，也意味着安全边界发生了变化。
```

### 16. stdio 和 Streamable HTTP 怎么选？

| 维度 | stdio | Streamable HTTP |
| --- | --- | --- |
| Server 位置 | 通常与 Host 同机 | 可以独立或远程部署 |
| 启动方式 | Client 启动子进程 | Server 独立启动 |
| 通信通道 | stdin / stdout | HTTP POST，可选 SSE |
| 多 Client | 通常一条进程连接服务一个 Client | 更适合多个网络 Client |
| 认证 | 常依赖本机权限和进程环境 | 通常需要网络认证与授权 |
| 部署复杂度 | 低 | 较高 |
| 典型场景 | IDE、本地桌面工具、CLI | 企业服务、跨机器 Agent、集中式能力平台 |

选择原则：

```text
能力只供本机 Host 使用：优先 stdio。
能力需要独立部署或供多个 Host 使用：考虑 Streamable HTTP。
```

HTTP 并不天然比 stdio 高级，它只是解决不同的部署边界。

### 17. 本节小结

记住下面八句话：

```text
1. 当前远程 MCP 服务应优先使用 Streamable HTTP，不要新建旧式 SSE Transport。
2. Tool 和 Transport 可以解耦，同一套 get_weather 能同时支持 stdio 与 HTTP。
3. 无会话模式使用 sessionIdGenerator: undefined，适合简单无状态工具。
4. enableJsonResponse: true 仍然属于 Streamable HTTP，只是不建立 SSE 响应流。
5. HTTP Client 只需要 transport: "http" 和 MCP endpoint URL。
6. HTTP MCP 使用 JSON-RPC，不等于把每个 Tool 设计成 REST 路由。
7. HTTP Server 独立运行，client.close() 不会把它关闭。
8. 暴露到网络前必须补齐认证、授权、TLS、限流和审计。
```

一句话总结：

```text
把 MCP 从 stdio 改成 HTTP，本质上是更换 Transport 和部署边界，而不是重写工具或 Agent。
```

参考资料：

- [MCP TypeScript SDK v1 Server 文档](https://ts.sdk.modelcontextprotocol.io/server)
- [MCP Streamable HTTP Transport 规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [LangChain JavaScript MCP 官方文档](https://docs.langchain.com/oss/javascript/langchain/mcp)
