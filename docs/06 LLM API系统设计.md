# 06 LLM API 系统设计

## 01 LLM API 目前主流技术方案

学习 LLM API，不要一上来就只问：

```text
我要用哪个模型？
```

更好的问题是：

```text
我的系统要通过哪一种方式接入大模型能力？
```

因为在真实项目里，LLM API 不只是“发一个 prompt，拿一个回答”。它还会涉及模型选择、接口协议、账号购买、密钥管理、限流、重试、流式输出、工具调用、结构化输出、日志、成本、合规和后续模型切换。

所以这一节先从整体上看：目前主流的 LLM API 技术方案大致有哪几类。

### 1. 方案一：直接调用模型厂商官方 API

这是最容易理解、也是学习阶段最常见的方案。

```text
业务代码
  ↓
官方 SDK / HTTP API
  ↓
OpenAI / Claude / Gemini / DeepSeek / Qwen / Doubao 等模型服务
```

典型例子：

- OpenAI：Responses API、Chat Completions、Embeddings、Realtime、Images 等。
- Anthropic Claude：Messages API。
- Google Gemini：Gemini API / Interactions API。
- DeepSeek：OpenAI / Anthropic 兼容 API。
- 阿里云百炼：DashScope 原生接口，也支持 OpenAI 兼容接口。
- 火山方舟、百度千帆等国内平台：通常也提供 OpenAI 兼容调用方式。

这种方式的优点是：

- 上手快。
- 文档和 SDK 完整。
- 新模型、新能力通常最先在官方接口出现。
- 适合学习、Demo、小项目、单一模型接入。

缺点是：

- 业务代码容易和某一家厂商绑定。
- 多模型切换成本较高。
- 密钥、限流、日志、成本控制容易散落在业务代码里。
- 不同厂商的接口格式并不完全一致。

例如 OpenAI 当前更推荐新文本生成项目使用 Responses API；Claude 的主接口是 Messages API；Gemini 也有自己的原生接口。虽然很多平台都说“兼容 OpenAI”，但兼容范围、工具调用、图片输入、结构化输出、流式返回等细节经常不完全一样。

所以直接调用官方 API 适合作为第一步，但不一定适合作为企业长期架构的最终形态。

### 2. 方案二：使用 OpenAI-compatible 接口

目前 LLM API 生态里，一个非常重要的事实是：

```text
OpenAI API 格式已经成为事实上的通用接口标准之一。
```

很多模型服务商即使不是 OpenAI，也会提供类似这样的调用方式：

```python
from openai import OpenAI

client = OpenAI(
    api_key="你的 API Key",
    base_url="https://某个模型平台的兼容地址"
)

response = client.chat.completions.create(
    model="某个模型名",
    messages=[
        {"role": "user", "content": "介绍一下 LLM API 的主流方案"}
    ]
)

print(response.choices[0].message.content)
```

核心思想是：

```text
SDK 不一定换
代码结构尽量不变
只改 api_key、base_url、model
```

这类方案常见于：

- DeepSeek API。
- 阿里云百炼 OpenAI 兼容接口。
- 火山方舟 OpenAI 兼容接口。
- 百度千帆 OpenAI 兼容接口。
- 本地模型服务，例如 Ollama、vLLM。
- 第三方聚合平台，例如 OpenRouter。
- 企业内部自建 LLM Gateway。

它的优点是：

- 迁移成本低。
- 很多框架和工具默认支持。
- 适合把多个模型统一到相似的调用方式里。
- 方便做模型替换和灰度切换。

但要注意：

```text
OpenAI-compatible 不等于 100% 等价 OpenAI。
```

常见差异包括：

- 支持的是 Chat Completions 还是 Responses。
- 是否支持 function calling / tool calling。
- 是否支持严格 JSON Schema。
- 是否支持图片、音频、文件输入。
- 流式返回事件格式是否一致。
- token 统计、错误码、限流策略是否一致。
- 模型参数名称是否完全兼容。

所以在生产项目里，不能只看“兼容 OpenAI”这几个字，还要对关键能力做集成测试。

### 3. 方案三：使用云厂商模型平台

企业项目里，经常不会直接去某个模型厂商官网买 API，而是通过云厂商平台统一接入。

典型平台包括：

- Microsoft Azure OpenAI / Azure AI Foundry。
- Amazon Bedrock。
- Google Vertex AI。
- 阿里云百炼。
- 火山方舟。
- 百度千帆。

这类平台的特点是：

```text
模型能力 + 企业账号体系 + 权限管理 + 账单 + 区域 + 合规 + 运维能力
```

它适合：

- 公司已经在某个云上。
- 需要统一账单和权限控制。
- 需要企业级 IAM、审计、私网、区域合规。
- 需要同时访问多个模型厂商。
- 需要让平台团队统一管理模型资源。

例如 Amazon Bedrock 提供统一的 Converse API，用一套接口访问支持消息式对话的不同模型；Azure OpenAI 则把 OpenAI 模型能力放到 Azure 的资源、鉴权、区域和企业治理体系里。

这类方案的缺点是：

- 配置比直接 API 更复杂。
- 模型和功能可能落后于原厂最新接口。
- 不同云平台的概念不同，例如 deployment、region、project、endpoint。
- 迁移时可能受云厂商体系影响。

一句话：

```text
学习阶段用官方 API 更直接，企业落地经常会走云平台。
```

### 4. 方案四：使用 LLM Gateway / Proxy

当项目从 Demo 进入真实业务后，很容易遇到这些问题：

- 不想把 API Key 写在各个业务服务里。
- 想统一记录每次调用的模型、token、耗时、费用。
- 想根据场景自动选择模型。
- 想做失败重试和模型降级。
- 想限制不同用户、团队、业务线的调用额度。
- 想同时接入 OpenAI、Claude、Gemini、DeepSeek、Qwen、本地模型。

这时就会引入一层 LLM Gateway：

```text
业务系统
  ↓
LLM Gateway / Proxy
  ↓
不同模型厂商 / 云平台 / 本地模型
```

Gateway 常见能力包括：

- 统一 API 格式。
- 统一密钥管理。
- 模型路由。
- 失败重试。
- 超时控制。
- 限流与熔断。
- 成本统计。
- 日志与审计。
- Prompt 模板管理。
- 结果缓存。
- 模型灰度发布。

常见选择：

- 使用 LiteLLM 这类开源 LLM Gateway。
- 使用 OpenRouter 这类第三方聚合平台。
- 企业自己封装一个内部 LLM Service。

生产系统里更推荐的结构通常是：

```text
业务代码
  ↓
公司内部 LLM Service
  ↓
Provider Adapter
  ↓
OpenAI / Claude / Gemini / DeepSeek / Qwen / 本地模型
```

这样业务代码不需要直接知道底层用了哪家模型，也不需要到处处理不同厂商的错误码和调用细节。

### 5. 方案五：本地或私有化部署开源模型

如果业务对数据安全、成本、网络环境或定制化有较高要求，就可能考虑本地部署或私有化部署。

常见工具包括：

- Ollama：适合本地开发、测试、轻量应用。
- vLLM：适合高吞吐生产推理服务。
- SGLang、TGI、NVIDIA NIM 等推理服务方案。
- 基于 Kubernetes / GPU 集群的私有模型服务平台。

结构大致是：

```text
业务系统
  ↓
OpenAI-compatible API
  ↓
本地推理服务
  ↓
开源模型权重
```

优点：

- 数据不必发到外部模型厂商。
- 可以控制模型版本和部署环境。
- 长期高调用量时，成本可能更可控。
- 可以结合微调、LoRA、私有知识库做深度定制。

缺点：

- 需要 GPU 资源。
- 需要推理服务运维能力。
- 模型效果不一定超过顶级闭源模型。
- 并发、延迟、显存、扩缩容都要自己处理。

所以本地部署并不是“免费替代 API”，而是把成本从 API 账单转移到了 GPU、运维和工程复杂度上。

### 6. 方案六：应用框架封装

除了底层 API，应用开发中还会用到更高一层的框架。

常见框架包括：

- LangChain。
- LlamaIndex。
- Semantic Kernel。
- OpenAI Agents SDK。
- 各类工作流 / Agent 框架。

这些框架不是模型厂商本身，而是帮你组织：

- Prompt。
- 多轮对话。
- RAG。
- 工具调用。
- Agent 流程。
- Memory。
- 文档解析。
- 向量检索。
- 多模型适配。

可以这样理解：

```text
模型 API 解决“怎么调用模型”
应用框架解决“怎么组织 AI 应用流程”
```

如果只是做一个简单总结功能，直接调 API 就够了。

如果要做复杂 RAG、Agent、多工具调用、多步骤任务，框架会更有价值。

### 7. 主流方案对比

| 技术方案 | 适合场景 | 优点 | 主要风险 |
| --- | --- | --- | --- |
| 直接调用官方 API | 学习、Demo、单模型应用 | 简单、能力最新 | 厂商绑定、治理能力弱 |
| OpenAI-compatible 接口 | 多模型切换、快速迁移 | 接入成本低、生态好 | 兼容细节不完全一致 |
| 云厂商模型平台 | 企业项目、合规场景 | IAM、账单、审计、区域能力强 | 配置复杂、功能可能滞后 |
| LLM Gateway / Proxy | 多业务、多模型、生产系统 | 统一治理、路由、成本控制 | 需要额外维护网关层 |
| 本地 / 私有化部署 | 数据敏感、高调用量、离线环境 | 数据可控、可定制 | GPU 和运维成本高 |
| 应用框架封装 | RAG、Agent、复杂 AI 应用 | 流程组织能力强 | 抽象复杂，调试成本上升 |

### 8. 目前最常见的企业落地架构

如果从系统设计角度看，一个比较稳妥的架构是：

```text
前端 / 业务服务
  ↓
AI 应用层
  ↓
LLM Service
  ↓
模型适配层 Provider Adapter
  ↓
OpenAI / Claude / Gemini / DeepSeek / Qwen / 本地模型
```

其中 LLM Service 负责：

- 管理 API Key。
- 统一请求和响应格式。
- 统一错误处理。
- 统一重试和超时。
- 统一日志和 token 统计。
- 根据业务场景选择模型。
- 控制成本和限流。
- 暴露内部稳定接口给业务方。

这比在每个业务文件里直接写：

```text
client.chat.completions.create(...)
```

更适合长期维护。

### 9. 初学者应该怎么选

如果是学习 LLM API，可以按下面顺序来：

```text
第一步：先学 OpenAI-compatible Chat Completions
第二步：理解 Responses API / Messages API / Gemini 原生接口差异
第三步：学流式输出、结构化输出、工具调用
第四步：封装一个自己的 LLM Client
第五步：升级成 LLM Service / Gateway 思维
第六步：再考虑 RAG、Agent、多模型路由、本地部署
```

不要一开始就陷入所有模型平台细节。

更重要的是先掌握共同主线：

```text
输入消息
  ↓
模型选择
  ↓
参数配置
  ↓
API 请求
  ↓
模型生成
  ↓
流式或非流式返回
  ↓
业务解析和落库
```

只要这条链路理解清楚，换不同模型厂商，本质上都是换配置、换协议细节、换能力边界。

### 10. 一句话总结

LLM API 当前主流技术方案不是单一答案，而是分层组合：

```text
学习阶段：直接调用官方 API 或 OpenAI-compatible API
业务阶段：封装自己的 LLM Client
生产阶段：建设 LLM Service / Gateway
企业阶段：结合云平台、权限、审计、成本和合规
特殊场景：使用本地部署或私有化模型服务
```

真正的重点不是“会不会调一次 API”，而是：

```text
能不能把大模型调用变成一个稳定、可观测、可切换、可控成本的系统能力。
```

### 参考资料

以下资料按 2026-06-29 核对：

- [OpenAI API：Responses API](https://platform.openai.com/docs/api-reference/responses)、[Text generation](https://platform.openai.com/docs/guides/text)、[Function calling](https://platform.openai.com/docs/guides/function-calling)。
- [Anthropic Claude：Messages API](https://docs.anthropic.com/en/api/messages)。
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)、[Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview)。
- [Amazon Bedrock：Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)。
- [Microsoft Learn：Azure OpenAI Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)。
- [DeepSeek API 文档](https://api-docs.deepseek.com/)。
- [阿里云百炼：OpenAI Chat 接口兼容](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)、[文本生成模型 API 参考](https://help.aliyun.com/zh/model-studio/qwen-api-reference/)。
- [火山方舟：兼容 OpenAI SDK](https://www.volcengine.com/docs/82379/1330626)。
- [百度千帆：OpenAI SDK 兼容介绍](https://cloud.baidu.com/doc/qianfan/s/Hmh4suq26)。
- [vLLM：OpenAI-compatible server](https://docs.vllm.ai/en/stable/serving/online_serving/)。
- [Ollama：OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)。
- [LiteLLM：LLM Gateway / Proxy](https://docs.litellm.ai/docs/simple_proxy)。

## 02 安装 SDK 环境与技术选型

这一节不要只理解成：

```text
安装某一个模型厂商的 SDK。
```

更准确地说，它是在解决一个更工程化的问题：

```text
我要用什么语言、什么包管理器、什么 SDK、什么项目结构，来搭建一个可扩展的 LLM API 实验项目？
```

因为 LLM API 学到后面，不会只停留在一次简单问答。后面会涉及：

- API Key 管理。
- base_url 切换。
- 模型选择。
- 多轮历史会话。
- 流式输出。
- 工具调用。
- 结构化输出。
- 图片、文件、视频等多模态输入。
- 错误处理。
- token 统计。
- 缓存。
- 联网搜索。
- 后端服务封装。

所以技术选型不能只看“哪个 SDK 能跑通第一个例子”，而要看它是否适合后面持续扩展。

### 1. 学 AI 应用开发，到底选 Python 还是 TypeScript？

如果只给一个结论：

```text
系统学习 AI 应用开发：Python 优先。
做 AI Web 产品和前后端一体应用：TypeScript 很适合。
如果你已经是 TypeScript 开发者：先用 TypeScript 入门，不要一开始强行切 Python。
```

这不是二选一，而是看学习阶段。

| 学习目标 | 更推荐 |
| --- | --- |
| 学 LLM API 调用、流式输出、结构化输出、工具调用 | Python / TypeScript 都可以 |
| 做 AI Web 应用、聊天界面、SaaS 产品、Next.js 应用 | TypeScript |
| 做 RAG、Agent、文档解析、数据处理、模型评测 | Python 更有优势 |
| 做模型训练、微调、本地推理、数据工程 | Python |
| 已经有前端或 Node.js 基础，希望快速做出产品 | TypeScript |

对于本章来说，TypeScript 完全够用。

因为第 06 章的重点是：

```text
LLM API 系统设计
```

而不是模型训练、微调、GPU 推理。

本章要练的是：

- 怎么调用模型 API。
- 怎么管理 API Key。
- 怎么处理多轮 messages。
- 怎么做 stream 流式输出。
- 怎么做 JSON 结构化输出。
- 怎么做图片识别。
- 怎么做工具调用。
- 怎么封装统一 LLM Client。
- 怎么理解 Response API 和 Chat API 的差异。

这些内容用 TypeScript 学起来非常自然，尤其适合后面接前端页面。

但是从长期学习路线看，Python 仍然要补。

原因是 AI 生态底层大量工具仍然以 Python 为主，例如：

- 数据处理。
- 向量检索实验。
- 模型评测。
- RAG 工程。
- 本地模型推理。
- 微调。
- 机器学习和深度学习工具链。

所以更合理的路线是：

```text
第 06 章：TypeScript 先把 LLM API 系统跑通
后续 RAG / Agent / 本地模型 / 评测：逐步补 Python
```

### 2. 本章示例项目推荐技术栈

本章示例项目叫：

```text
llm-api-system-lab
```

如果你是 TypeScript 开发者，推荐使用：

```text
Node.js 22 或 24 LTS
pnpm
TypeScript
tsx
openai
zod
dotenv
```

每个技术的作用如下：

| 技术 | 作用 |
| --- | --- |
| Node.js | 运行 TypeScript/JavaScript 服务端代码 |
| pnpm | 管理依赖，比 npm 更适合多项目和长期维护 |
| TypeScript | 提供类型约束，减少 API 参数和返回结构错误 |
| tsx | 直接运行 TypeScript 文件，适合课程实验 |
| openai | 调用 OpenAI，以及部分 OpenAI-compatible 平台 |
| zod | 校验结构化输出，例如 JSON Schema 返回结果 |
| dotenv | 从 `.env` 读取 API Key 等环境变量 |

第一阶段不急着安装 LangChain、LlamaIndex、Vercel AI SDK 或 Agent 框架。

原因是：

```text
先学清楚底层 API，再学框架封装。
```

如果一开始就用大框架，学生可能会跑通 Demo，但不知道底层发生了什么：

- messages 是怎么组织的？
- stream 是怎么返回的？
- tool call 是怎么触发的？
- JSON 输出为什么会不稳定？
- base_url 为什么可以切换模型平台？
- API Key 为什么不能放在浏览器前端？

这一章应该先把这些问题讲透。

### 3. 为什么第一主线推荐 openai SDK？

不是因为只能用 OpenAI，而是因为：

```text
OpenAI API 格式已经成为 LLM API 生态里的事实标准之一。
```

很多模型平台都提供 OpenAI-compatible 接口。

也就是说，代码结构可以大致保持不变，只改：

```text
apiKey
baseURL
model
```

例如：

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

如果切到兼容 OpenAI 格式的平台，通常会变成：

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});
```

这背后的思想是：

```text
用统一 SDK 学会通用调用模式，再逐步理解不同模型平台的差异。
```

但是也要提醒：

```text
OpenAI-compatible 不等于 100% 完全兼容。
```

不同平台在下面这些能力上可能有差异：

- Responses API 是否支持。
- Chat Completions 是否支持。
- tool calling 是否支持。
- strict JSON Schema 是否支持。
- 图片输入格式是否一致。
- stream 事件格式是否一致。
- 错误码是否一致。
- token 统计是否一致。
- 思考模型参数是否一致。

所以课程里可以先用 openai SDK 建立主线，然后在后续课程里专门比较不同模型平台的接口差异。

### 4. 安装 Node.js 和 pnpm

建议使用 Node.js LTS 版本。

可以先检查本机版本：

```bash
node -v
pnpm -v
```

如果没有 pnpm，可以安装：

```bash
npm install -g pnpm
```

如果你的机器上有多个 Node.js 版本，建议使用 nvm、fnm 或 mise 管理 Node.js 版本。

课程里不建议把 Node.js 版本讲得太复杂，只要明确：

```text
使用当前 LTS 版本即可。
```

### 5. 初始化 TypeScript 项目

进入项目目录：

```bash
cd llm-api-system-lab
```

初始化项目：

```bash
pnpm init
```

安装运行依赖：

```bash
pnpm add openai zod dotenv
```

安装开发依赖：

```bash
pnpm add -D typescript tsx @types/node
```

初始化 TypeScript 配置：

```bash
pnpm exec tsc --init
```

推荐 `package.json` 里保留这些脚本：

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "check": "tsc --noEmit"
  }
}
```

含义是：

- `dev`：直接运行 TypeScript 示例代码。
- `check`：只做类型检查，不生成 JS 文件。

### 6. 推荐目录结构

本章项目可以先设计成这样：

```text
llm-api-system-lab/
  src/
    index.ts
    config.ts
    providers/
      openai.ts
      deepseek.ts
    examples/
      01-basic-text.ts
      02-stream.ts
      03-json-output.ts
      04-vision.ts
      05-tool-call.ts
      06-conversation.ts
  .env.example
  package.json
  tsconfig.json
```

目录含义：

| 文件 / 目录 | 作用 |
| --- | --- |
| `src/index.ts` | 当前课程入口 |
| `src/config.ts` | 统一读取环境变量 |
| `src/providers/` | 封装不同模型服务商 |
| `src/examples/` | 每节课一个独立示例 |
| `.env.example` | 告诉学生需要配置哪些环境变量 |
| `tsconfig.json` | TypeScript 编译配置 |

这样组织有一个好处：

```text
每个知识点都能单独跑，又能逐步沉淀成一个 LLM Client。
```

### 7. 环境变量设计

不要把 API Key 写死在代码里。

错误示例：

```ts
const client = new OpenAI({
  apiKey: "sk-xxxx",
});
```

正确方式是放到 `.env`：

```bash
OPENAI_API_KEY=your_openai_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
OPENAI_MODEL=gpt-4.1-mini
DEEPSEEK_MODEL=deepseek-chat
```

然后在代码里读取：

```ts
import "dotenv/config";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("Missing OPENAI_API_KEY");
}
```

课程里要强调：

```text
API Key 属于服务端秘密，不能放到浏览器前端代码里。
```

如果是 React、Vue、Next.js 前端项目，正确结构应该是：

```text
浏览器前端
  ↓
自己的后端 API
  ↓
LLM SDK
  ↓
模型厂商 API
```

而不是：

```text
浏览器前端
  ↓
直接调用模型厂商 API
```

因为浏览器里的代码和请求都可能被用户看到，API Key 会泄露。

### 8. 第一个 TypeScript 调用示例

`src/index.ts` 可以先写成：

```ts
import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await client.responses.create({
  model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  input: "用三句话解释什么是 LLM API。",
});

console.log(response.output_text);
```

运行：

```bash
pnpm dev
```

这段代码先不追求复杂。

它只让学生看懂四件事：

```text
1. SDK 如何初始化
2. API Key 从哪里来
3. model 参数是什么
4. input 如何传给模型
```

后面再逐步展开：

- 多轮对话。
- stream。
- JSON 输出。
- tool call。
- 图片输入。
- Files API。
- 缓存。
- 联网搜索。

### 9. 什么时候引入 Vercel AI SDK？

如果你做的是 AI Web 应用，尤其是 Next.js 项目，Vercel AI SDK 很有价值。

它适合解决：

- 聊天 UI。
- 前后端流式响应。
- 多模型 Provider 抽象。
- React / Vue / Svelte 等前端集成。
- Chatbot 和 Agent 应用。

但在本章一开始不建议直接用它。

原因是本章的教学目标是理解 LLM API 底层机制：

```text
先学模型厂商 SDK
再学统一应用框架
```

可以把学习顺序设计成：

```text
第一阶段：openai SDK
第二阶段：自己封装 LLM Client
第三阶段：接入后端 API
第四阶段：如果做 Web 聊天应用，再引入 Vercel AI SDK
```

### 10. 什么时候引入 LangChain.js 或 LlamaIndex.TS？

LangChain.js、LlamaIndex.TS 不是不能用，而是不应该太早用。

它们更适合：

- RAG。
- Agent。
- 工具编排。
- 文档加载。
- 向量检索。
- 多步骤任务流。

但是本章前半部分重点是：

```text
模型 API 本身怎么工作。
```

如果一上来就使用 LangChain.js，学生很容易只记住框架写法，却不理解：

- 原始请求长什么样。
- 原始响应长什么样。
- stream 是如何分片返回的。
- tool call 在 API 层是什么结构。
- JSON Schema 是怎么约束输出的。

所以本章推荐：

```text
先不用 LangChain.js
先不用 LlamaIndex.TS
先把模型 API 调用链路讲清楚
```

等后面进入 RAG 和 Agent 章节，再引入这些框架会更自然。

### 11. Python 方案应该怎么保留？

虽然本章可以用 TypeScript，但课程整体不要放弃 Python。

可以把 Python 放在后续阶段：

```text
LLM API 入门：TypeScript
AI 后端服务：TypeScript 或 Python
RAG / Agent / 数据处理：Python
模型部署 / 微调 / 评测：Python
```

如果后面要开 Python 版本项目，可以使用：

```text
Python 3.11 / 3.12
uv
FastAPI
pydantic
openai
python-dotenv
httpx
```

对应安装命令：

```bash
uv init
uv venv --python 3.12
source .venv/bin/activate
uv add openai python-dotenv pydantic httpx fastapi uvicorn
```

Python 适合补充这些内容：

- FastAPI 后端服务。
- 文档解析。
- 向量数据库。
- RAG Pipeline。
- 模型评测。
- 本地模型推理。
- 训练和微调相关工具。

所以本课程可以形成一个清晰分工：

```text
TypeScript：更适合产品应用层
Python：更适合 AI 工程和算法生态层
```

### 12. 本节最终推荐

如果你是 TypeScript 开发者，本章就用 TypeScript。

推荐路线：

```text
Node.js LTS
  ↓
pnpm
  ↓
TypeScript
  ↓
openai SDK
  ↓
zod 做结构校验
  ↓
自己封装 LLM Client
  ↓
后面再接后端 API / 前端页面 / Vercel AI SDK
```

不要因为 AI 生态里 Python 很强，就一开始强迫自己切语言。

更好的策略是：

```text
用你熟悉的 TypeScript 先理解 AI 应用开发主线；
再用 Python 补齐 RAG、Agent、数据处理、本地模型这些深水区。
```

一句话总结：

```text
本章示例项目用 TypeScript；长期 AI 工程能力要补 Python。
```

### 参考资料

以下资料按 2026-07-07 核对：

- [OpenAI API：SDKs and CLI](https://developers.openai.com/api/docs/libraries)。
- [OpenAI TypeScript and JavaScript API Library](https://developers.openai.com/api/reference/typescript/)。
- [Vercel AI SDK 文档](https://ai-sdk.dev/docs/introduction)。
- [Google Gemini API：Libraries](https://ai.google.dev/gemini-api/docs/libraries)。
- [Google Gen AI SDK for TypeScript and JavaScript](https://github.com/googleapis/js-genai)。
- [FastAPI 官方文档](https://fastapi.tiangolo.com/)。
