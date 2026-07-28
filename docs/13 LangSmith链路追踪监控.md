# 13 LangSmith 链路追踪监控

本章把现有的豆包、Embedding、Chroma 和 RAG 调用接入 LangSmith，逐步观察一次
请求中的输入、输出、耗时、错误和父子调用关系。

## 学习进度

- [x] 01 开通 LangSmith 账户
- [x] 02 用 LangSmith 对火山引擎的数据进行监控
- [x] 03 改写 LangChain 底层 Embedding 类兼容火山引擎（已评估后跳过）
- [x] 04 `traceable` 支持的 `run_type`
- [ ] 05 改进后的 trace 追踪
- [ ] 06 逐行断点解读 trace 业务代码
- [ ] 07 RAG 检索增强架构改造
- [ ] 08 查看 LangSmith 中的检索与 LLM 数据

---

## 01 开通 LangSmith 账户

### 1. LangSmith 解决什么问题？

程序最终只打印一个结果时，很难知道中间发生了什么：

```text
用户问题
-> Embedding
-> Chroma 检索
-> 拼装上下文
-> LLM
-> 最终回答
```

LangSmith 会把每一步记录成 trace，帮助我们查看：

- 每一步的输入和输出。
- 父调用与子调用关系。
- 每一步耗时和错误。
- 模型名称、token 和 metadata。
- 哪一步让结果变慢或不准确。

LangSmith 负责“观察应用”，不会替代豆包、LangChain 或 Chroma。

### 2. 五个名称先分清

| 名称 | 可以怎样理解 |
| --- | --- |
| Account | 登录 LangSmith 的个人身份 |
| Organization | 成员和账单边界 |
| Workspace | 项目、数据和权限的工作空间 |
| Project | 一组相关 traces，例如开发环境 |
| Trace | 一次端到端请求及其所有子步骤 |

后面的课程统一使用：

```text
Workspace：个人学习 workspace
Project：langsmith-volcengine-lab
```

Project 不必提前在网页创建。第一次 trace 上报后，LangSmith 可以根据
`LANGSMITH_PROJECT` 自动创建它。

### 3. 先选区域

推荐使用 GCP APAC：

```text
网页：https://apac.smith.langchain.com
API：https://apac.api.smith.langchain.com
```

选择 APAC 的原因：

- 更符合亚洲学习环境。
- 非 US 账户必须使用对应区域 API，否则 API Key 可能验证失败。
- LangSmith 目前不支持把 Organization 从一个区域迁移到另一个区域。

如果已经在其他区域创建账户，应继续使用那个区域对应的网页和 API，不要让
同一套配置混用两个区域。

### 4. 注册步骤

1. 打开 [LangSmith APAC](https://apac.smith.langchain.com)。
2. 使用 GitHub、Google 或邮箱登录。
3. 使用自动创建的个人 Organization，不需要额外创建共享 Organization。
4. 保留 Developer 个人方案，学习阶段不需要绑定信用卡。
5. 进入 `Settings -> API Keys`，创建一个 Personal Access Token。
6. 创建时只关联当前个人 Workspace。

本地学习推荐：

```text
Key 类型：Personal Access Token
用途：仅本机课程实验
有效期：30～90 天
```

PAT 会继承你的个人权限，适合本地脚本；生产应用再使用限制到 Organization 或
Workspace 的 Service Key。

API Key 只显示一次。复制后写入本地 `.env`，不要：

- 发到聊天中。
- 写入教学文档或代码。
- 提交到 Git。
- 截图公开。

### 5. 学习阶段会收费吗？

个人 Developer Organization 在没有绑定付款方式时，每月最多接收 5,000 条
trace。达到限制后会停止接收更多 trace，而不是自动扣费。

因此本章的少量学习调用通常不需要付费。我们还会：

- 使用独立 Project，方便观察和删除实验数据。
- 默认使用 Base retention。
- 不创建 Deployment。
- 不绑定信用卡。
- 不额外创建需要 Plus 的共享 Organization。

Trace 与 run 不相同：

```text
一次用户请求 = 1 条 trace
trace 内部可以包含多个 run
```

例如一次 RAG trace 可能包含 Embedding、检索和 LLM 三个子 run。

### 6. 本地环境变量

项目已在
[.env.example](../langchain-commerce-rag-lab/.env.example)
中预留配置。请把下面几项写到
`langchain-commerce-rag-lab/.env`：

```dotenv
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=这里填写刚创建的Key
LANGSMITH_ENDPOINT=https://apac.api.smith.langchain.com
LANGSMITH_PROJECT=langsmith-volcengine-lab
# 只有 Key 能访问多个 Workspace 时才需要：
LANGSMITH_WORKSPACE_ID=
# 短命令退出前等待 trace 上传：
LANGSMITH_TRACING_BACKGROUND=false
```

说明：

- `LANGSMITH_TRACING`：是否启用自动追踪。
- `LANGSMITH_API_KEY`：认证密钥，必须保密。
- `LANGSMITH_ENDPOINT`：必须与注册区域一致。
- `LANGSMITH_PROJECT`：trace 在网页中的分组名称。
- `LANGSMITH_WORKSPACE_ID`：仅当 Key 能访问多个 Workspace，或使用组织级
  Service Key 时需要。只关联一个 Workspace 的个人 PAT 应留空。
- `LANGSMITH_TRACING_BACKGROUND=false`：让短命令等待 trace 上传，避免程序退出
  太快导致网页暂时看不到数据。

LangSmith 官方文档仍提到可以在 `Settings -> General` 复制 Workspace ID，但
部分新版区域界面不再显示这个入口。此时不必为了单 Workspace PAT 单独查找 ID。
如果以后确实需要，可以通过 LangSmith 的 `GET /api/v1/workspaces` API 获取。

`.env` 已被 `.gitignore` 忽略，不会进入版本库。`.env.example` 只保留空值和
公开配置。

### 7. 本课不测试 API

第 01 课只完成账户、区域、Workspace 和 Key 准备，不发送任何 trace。

第 02 课才会：

```text
读取本地环境变量
-> 验证 LangSmith 连接
-> trace 豆包调用
-> 在网页中找到第一条 trace
```

这样可以把“账户问题”和“代码接入问题”分开排查。

### 8. 本课验收

- [ ] 能登录 APAC LangSmith。
- [ ] 使用个人 Developer Organization。
- [ ] 已创建本地学习用 PAT。
- [ ] 已将 Key 写入本地 `.env`，没有发到聊天或提交 Git。
- [ ] `LANGSMITH_ENDPOINT` 与账户区域一致。
- [ ] `LANGSMITH_PROJECT` 设置为 `langsmith-volcengine-lab`。
- [ ] 当前 PAT 只关联一个 Workspace，`LANGSMITH_WORKSPACE_ID` 保持空白。

完成后只需要告诉我：

```text
LangSmith APAC 已开通，配置已写入 .env
```

不要告诉我 API Key 的具体内容。

### 9. 检查理解

1. LangSmith 会替代豆包或 Chroma 吗？
2. 为什么不能混用 US 账户和 APAC API endpoint？
3. 本地学习应该选择 PAT 还是生产 Service Key？
4. Project 是否必须在第一次运行前手动创建？
5. 哪些情况下才必须配置 `LANGSMITH_WORKSPACE_ID`？
6. 为什么不能把 LangSmith API Key 发到聊天中？

答案：

1. 不会；它负责追踪、调试、评估和监控调用链。
2. Key 和数据属于注册区域，错误 endpoint 会导致认证失败或配置混乱。
3. 本地个人实验使用 PAT；生产应用使用权限更小的 Service Key。
4. 不必；首次 trace 可以根据 `LANGSMITH_PROJECT` 自动创建。
5. Key 能访问多个 Workspace，或使用需要显式目标的组织级 Service Key 时。
6. API Key 可以代表你的身份调用 LangSmith API，泄露后必须立即撤销和轮换。

### 10. LangSmith 与阿里云 ARMS/SLS 怎样选择？

它们不是完全相同的产品：

```text
LangSmith
≈ LLM 应用追踪、调试和评估平台

ARMS LLM 应用监控
≈ 阿里云的 LLM 专用观测层

SLS
≈ 日志、Trace、查询分析和存储平台
```

简单比较：

| 能力 | LangSmith | ARMS/SLS |
| --- | --- | --- |
| LangChain 与 LLM 调用树 | 强 | 已支持 |
| Prompt、输入输出和 Token | 强 | 支持 LLM 语义字段 |
| Dataset、Evaluation、人工反馈 | 强 | 不是主要优势 |
| 日志、指标和 Trace 统一分析 | 一般 | 强 |
| ECS、ACK、数据库和中间件监控 | 非重点 | 强 |
| 国内访问和阿里云生态 | 一般 | 强 |
| OpenTelemetry | 支持 | 原生重点支持 |
| SQL 分析、自定义告警和仪表盘 | 有限 | 强 |

阿里云 SLS 全栈可观测支持 OpenTelemetry、SkyWalking 和 Jaeger 等协议，可以
统一分析 logs、metrics 和 traces。ARMS 则在这套通用链路能力之上增加 LLM
调用次数、Token、会话和操作类型等视图。

对当前 TypeScript 项目，阿里云 Node.js Agent 已支持 LangChain v1.x 和
LangGraph 插桩。但 SLS 的普通 HTTP Trace 不会自动变成高质量的 LLM Trace；
仍需 Agent、OpenTelemetry GenAI 语义字段或手动 span 正确标注：

```text
chain
embedding
retriever
llm
tool
agent
```

本项目建议分两个阶段选择：

```text
课程与本地开发：
LangSmith
优点：最少配置即可理解 traceable、run_type、RAG 调用树和 Evaluation。

国内生产环境：
OpenTelemetry + ARMS/SLS
优点：统一基础设施、应用、日志、指标、Trace、告警和阿里云资源。
```

长期可以使用厂商无关的 OpenTelemetry 作为采集层：

```text
TypeScript / LangChain
        ↓
OpenTelemetry / GenAI spans
        ↓
OpenTelemetry Collector
        ├── ARMS / SLS：生产监控、日志和告警
        └── LangSmith：开发调试、Dataset 和 Evaluation
```

这样业务代码不必永久绑定某一个平台，也可以按环境关闭其中一个 exporter。

成本方面：

- LangSmith 个人 Developer 方案适合少量课程 trace。
- SLS 全栈可观测应用本身免费，但数据写入、索引和存储按量计费。
- 阿里云可观测链路提供每日免费 Span 额度，超出后按当前计费规则收费。
- 双写两个平台会增加传输量、存储量和敏感数据暴露面，不应默认全量开启。

因此本章仍先使用 LangSmith 复现原课程；完成基础学习后，再增加一个
OpenTelemetry 导出到 ARMS/SLS 的对照实验。生产环境如果主要部署在国内或
阿里云，则优先考虑 ARMS/SLS。

## 01 官方参考

- [LangSmith：创建账户和 API Key](https://docs.langchain.com/langsmith/create-account-api-key)
- [LangSmith：Regions FAQ](https://docs.langchain.com/langsmith/regions-faq)
- [LangSmith：Tracing quickstart](https://docs.langchain.com/langsmith/observability-quickstart)
- [LangSmith：Billing and usage](https://docs.langchain.com/langsmith/billing)
- [阿里云 SLS：全栈可观测](https://help.aliyun.com/zh/sls/full-stack-observability/)
- [阿里云：Node.js Agent 版本说明](https://help.aliyun.com/zh/arms/application-monitoring/user-guide/probe-node-js-agent-release-notes)
- [阿里云：Node.js OpenTelemetry 接入](https://help.aliyun.com/zh/opentelemetry/user-guide/use-managed-service-for-opentelemetry-to-submit-the-trace-data-of-a-node-js-application)
- [阿里云：链路追踪计费规则](https://help.aliyun.com/zh/opentelemetry/product-overview/billing-rules/)

---

## 02 用 LangSmith 对火山引擎的数据进行监控

### 1. 本课目标

发起一次真实的豆包 Embedding 请求，并在 LangSmith 中看到：

```text
输入文本
-> doubao-text-embedding
-> 火山引擎 Ark
-> 向量摘要、模型、Token、耗时和成功/失败状态
```

本课不会改写已有的 `DoubaoTextEmbeddings`。我们只在业务调用外包一层
`traceable`，先学会“给一个普通异步函数加观测”。

### 2. 为什么不能直接记录所有数据？

Embedding 返回的向量可能有上千维。完整记录既难读，又会增加传输和存储量。
请求头中的 API Key 更不能进入 Trace。

本课只发送：

| Trace 字段 | 记录内容 |
| --- | --- |
| Input | 输入文本、字符数 |
| Output | 模型、向量维度、前 4 维、Token |
| Metadata | provider、课程序号 |
| Tags | `lesson-13-02`、`volcengine`、`embedding` |

不发送 API Key、Authorization 请求头和完整向量。输入文本仍会进入 LangSmith，
所以生产环境需要进一步脱敏用户隐私；本课只使用公开的样例商品描述。

### 3. 核心代码

实现位于
[trace-doubao-embedding.ts](../langchain-commerce-rag-lab/src/observability/trace-doubao-embedding.ts)：

```ts
return traceable(runEmbedding, {
  name: "doubao-text-embedding",
  run_type: "embedding",
  project_name: "langsmith-volcengine-lab",
  processInputs: summarizeEmbeddingTraceInput,
  processOutputs: summarizeEmbeddingTraceOutput
});
```

几个参数可以这样理解：

- `name`：网页调用树中显示的步骤名称。
- `run_type`：这一步的语义类型；这里是向量化，所以用 `embedding`。
- `project_name`：把 Trace 分组到本章的独立 Project。
- `processInputs`：上报前整理输入。
- `processOutputs`：上报前把完整向量换成摘要，不会改变函数真实返回值。

`run_type` 的所有类型和父子调用关系会在第 04 课单独讲解。

### 4. 为什么要等待上传？

LangSmith SDK 默认可以在后台批量上传。普通服务会持续运行，后台上传没有问题；
但这个课程命令执行几秒就退出，因此在 `finally` 中显式等待：

```ts
try {
  const result = await tracedEmbedding({ text });
  // 使用完整向量
} finally {
  await client.awaitPendingTraceBatches();
}
```

即使豆包调用报错，`finally` 也会尽量把失败 Trace 发送出去。

### 5. 运行

先确认配置写在
`langchain-commerce-rag-lab/.env`，不是 `.env.example`：

```dotenv
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=新创建的Key
LANGSMITH_ENDPOINT=https://apac.api.smith.langchain.com
LANGSMITH_PROJECT=langsmith-volcengine-lab
LANGSMITH_WORKSPACE_ID=
LANGSMITH_TRACING_BACKGROUND=false
```

然后运行：

```bash
cd langchain-commerce-rag-lab
pnpm langsmith:02
```

这条命令会产生一次豆包 Embedding 用量和一条 LangSmith Trace，不会访问
Chroma。

### 6. 预期结果

终端会显示类似内容：

```text
13-02 用 LangSmith 监控火山引擎数据

LangSmith Project: langsmith-volcengine-lab
实际模型: doubao-embedding-vision-...
向量维度: 2048
向量预览: [...]
本次用量: ... tokens
Trace 上传完成，可前往 LangSmith Tracing 查看。
```

打开 LangSmith 的 `Tracing`，进入 `langsmith-volcengine-lab`，应能找到：

```text
Name: doubao-text-embedding
Run type: embedding
Status: Success
Tags: lesson-13-02, volcengine, embedding
```

点开后核对 Input 和 Output。Output 应只有 `model`、`vectorDimension`、
`vectorPreview` 和可选的 `totalTokens`，不应出现完整向量或任何 Key。

### 7. 本课验收

- [x] `langsmith` 是项目的直接依赖，版本由 lockfile 固定。
- [x] 豆包调用已由 `traceable` 包装为 `embedding` run。
- [x] Trace 不记录 API Key、Authorization 和完整向量。
- [x] 短命令退出前等待 Trace 上传。
- [x] 脱敏摘要的离线测试通过。
- [x] 真实调用成功，LangSmith 网页能看到一条 Trace。
- [x] 网页中的向量维度与终端一致。

实际验收（2026-07-28）：

```text
name: doubao-text-embedding
run_type: embedding
status: success
model: doubao-embedding-vision-251215
vectorDimension: 2048
vectorPreview: 4 个数值
totalTokens: 37
fullVectorStored: false
```

终端结果和 LangSmith API 查询结果一致，说明“豆包调用、Trace 上传、服务端
存储、脱敏摘要”整条链路已经跑通。

### 8. 检查理解

1. `traceable` 会替代豆包 Embedding 吗？
2. 为什么 `processOutputs` 只发送前 4 维？
3. 为什么 CLI 程序需要等待上传队列？
4. `LANGSMITH_TRACING=true` 是否意味着可以记录 API Key？

答案：

1. 不会；它只包裹并观测原来的函数。
2. 完整向量不利于排错，还会增加数据量；维度和少量预览已足够验收。
3. CLI 很快退出，不等待可能让后台 Trace 来不及发送。
4. 不是；无论是否启用追踪，密钥都不能进入输入、输出或 metadata。

## 02 官方参考

- [LangSmith：使用 `traceable` 标注代码](https://docs.langchain.com/langsmith/annotate-code)
- [LangSmith：隐藏或处理 Inputs/Outputs](https://docs.langchain.com/langsmith/mask-inputs-outputs)
- [LangSmith：短生命周期环境](https://docs.langchain.com/langsmith/serverless-environments)
- [LangSmith：查看 Trace](https://docs.langchain.com/langsmith/view-traces)
- [LangSmith JavaScript `traceable` API](https://reference.langchain.com/javascript/langsmith/traceable)

---

## 03 改写 LangChain 底层 Embedding 类（跳过）

现有 `DoubaoTextEmbeddings` 已实现 LangChain `EmbeddingsInterface` 要求的
`embedDocuments` 和 `embedQuery`。TypeScript 使用结构类型，因此它已经可以
传给 LangChain VectorStore。

本节不会修改 LangChain 源码，也不增加只有形式、没有行为收益的继承层。后续
如果遇到只接受特定基类的集成，再增加薄适配器。

---

## 04 `traceable` 支持的 `run_type`

### 1. `run_type` 是什么？

一条 Trace 由多个 run 组成。`run_type` 告诉 LangSmith：“这一步在业务上做了
什么”。

```ts
const tracedFunction = traceable(originalFunction, {
  name: "demo-inventory-tool",
  run_type: "tool"
});
```

它不会改变函数执行结果，也不会自动调用模型。它主要影响：

- LangSmith 调用树中的语义和展示方式。
- 按类型筛选、统计和排错。
- `llm` 的消息、Token、成本等专用视图。
- `retriever` 的文档与 metadata 专用视图。

省略 `run_type` 时，`traceable` 默认按 `chain` 处理。

### 2. 当前支持的 7 种类型

| 类型 | 什么时候用 | 本课例子 |
| --- | --- | --- |
| `chain` | 组织多个步骤的流程 | 完整商品 RAG 流程 |
| `llm` | 调用语言模型 | 离线假模型 |
| `embedding` | 生成文本或图片向量 | 查询向量化 |
| `prompt` | 把变量格式化为模型输入 | 组装 system/user 消息 |
| `tool` | 执行工具或外部动作 | 查询商品库存 |
| `retriever` | 查找相关文档或上下文 | 检索商品资料 |
| `parser` | 将原始输出转为结构化数据 | 提取答案和引用 SKU |

一个典型 RAG 调用树可以是：

```text
chain: commerce-rag
├── embedding: query-embedding
├── retriever: product-retriever
├── tool: inventory-tool
├── prompt: prompt-template
├── llm: chat-model
└── parser: output-parser
```

`agent`、`vectorstore` 和 `database` 不是当前标准 `run_type`。一般这样映射：

```text
Agent 的整体编排 -> chain
Agent 调用的动作 -> tool
向量数据库召回上下文 -> retriever
数据库执行一个外部动作 -> tool
```

### 3. 类型选对还不够

部分类型需要正确的数据形状才能获得专用 UI。

`retriever` 应返回文档数组：

```ts
[
  {
    page_content: "商品正文",
    type: "Document",
    metadata: { sku: "LAPTOP-AIR-14", score: 0.93 }
  }
]
```

`llm` 应使用标准消息格式，并提供模型 metadata：

```ts
{
  run_type: "llm",
  metadata: {
    ls_provider: "volcengine",
    ls_model_name: "doubao-..."
  }
}
```

真正调用模型时还应提供 `usage_metadata`，LangSmith 才能正确显示 Token 和
成本。仅仅把普通函数标成 `llm`，不会凭空产生 Token 数据。

### 4. 本课为什么使用假模型？

本课只学习 run 的分类和调用树，不测试模型效果。因此所有结果都由本地固定
数据生成：

```text
豆包调用：0
Chroma 调用：0
模型 Token：0
LangSmith：只上传 1 条教学 Trace、7 个 runs
```

这样能把“Trace 结构问题”和“外部 API 问题”分开。

### 5. 运行

```bash
cd langchain-commerce-rag-lab
pnpm langsmith:04
```

核心实现：

- [run-type-demo.ts](../langchain-commerce-rag-lab/src/observability/run-type-demo.ts)
- [04-traceable-run-types.ts](../langchain-commerce-rag-lab/src/examples/langsmith/04-traceable-run-types.ts)

### 6. 实际验收

2026-07-28 已在 LangSmith 服务端读取本课 Trace：

```text
demo-commerce-rag-chain  chain      root
demo-query-embedding     embedding  child
demo-product-retriever   retriever  child
demo-inventory-tool      tool       child
demo-prompt-template     prompt     child
demo-fake-llm            llm        child
demo-output-parser       parser     child
```

7 个 run 状态全部成功，类型无重复也无缺失。

### 7. 本课验收

- [x] 能说出 7 种标准 `run_type`。
- [x] 理解 `run_type` 描述语义，不改变函数行为。
- [x] 理解 `llm` 和 `retriever` 需要专用数据格式。
- [x] 使用一棵调用树展示 7 种类型。
- [x] 演示没有调用豆包或 Chroma。
- [x] LangSmith 服务端确认 7 个 run 全部成功。

### 8. 检查理解

1. 一个包含多个步骤的 Agent 根节点应标成什么？
2. 从 Chroma 取回相关文档应标成什么？
3. 格式化 Prompt 时是否已经调用了 LLM？
4. 标记 `run_type: "llm"` 后为什么不一定有 Token？

答案：

1. `chain`；Agent 使用的具体外部动作标成 `tool`。
2. `retriever`。
3. 没有，`prompt` 只负责格式化输入。
4. `run_type` 只是语义分类；仍需真实模型响应或显式提供
   `usage_metadata`。

## 04 官方参考

- [LangSmith：Run 数据格式与 7 种类型](https://docs.langchain.com/langsmith/run-data-format)
- [LangSmith：查看不同类型的 Trace](https://docs.langchain.com/langsmith/view-traces)
- [LangSmith：记录 Retriever Trace](https://docs.langchain.com/langsmith/log-retriever-trace)
- [LangSmith：记录 LLM Trace](https://docs.langchain.com/langsmith/log-llm-trace)
- [LangSmith JavaScript `traceable` API](https://reference.langchain.com/javascript/langsmith/traceable)
