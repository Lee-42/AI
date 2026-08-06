# ADR-003：以六边形边界实现 AiOrchestrator，暂不拆分微服务

| 字段 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-08-04 |
| 决策范围 | LLM/RAG 编排、Provider 隔离、部署边界 |
| 关联需求 | RAG 答案边界、证据门禁、可替换模型与检索器、零费用测试 |

## 1. 背景

实时语音客服已经拥有 RTC、Agent 生命周期、客服 Prompt、订单工具、会话隐私和观测
能力。加入 RAG 后，ASR 最终文本可能需要经历问题路由、知识检索、证据判断、LLM 生成、
引用验证和业务工具处理。

如果 Fastify Route、RTC 回调或火山 Provider 直接完成这些步骤，会产生以下耦合：

- HTTP/SSE/RTC 三个入口复制编排逻辑。
- Chroma、模型 SDK 和供应商字段进入业务规则。
- 单元测试必须启动网络服务或调用付费模型。
- 订单授权容易被误放进 Prompt 或模型参数。
- 将来切换模型、检索实现或部署方式需要改写上层入口。

需要一个稳定的应用边界，但当前流量、团队规模和故障隔离需求不足以证明必须立即增加一
个远程微服务。

## 2. 候选方案

### 方案 A：入口直接调用模型和向量库

优点：

- 初始文件较少。
- 可以很快做出单一路径演示。

代价：

- 编排、协议和厂商字段混在一起。
- 难以复用到 RTC、SSE 和离线评测。
- 无证据门禁和引用验证容易因入口不同而漂移。

### 方案 B：立即创建独立 RAG/LLM 微服务

优点：

- 可以独立部署和扩缩容。
- 故障与资源使用可以单独隔离。

代价：

- 立刻增加网络协议、服务发现、认证、重试、发布和观测成本。
- 本地调试与零费用测试更复杂。
- 在没有真实负载证据时，部署拓扑会反向塑造代码边界。

### 方案 C：同进程六边形架构

优点：

- 上层依赖稳定的 `AiOrchestrator` Port。
- 模型、Retriever 和策略通过输出 Port 注入。
- 单元测试使用确定性 Mock，不调用网络或付费服务。
- 将来可以在不改变应用语义的前提下增加远程 Adapter。

代价：

- 需要显式定义领域类型和依赖方向。
- 当前 AI 工作负载与 API 进程共享 CPU、内存和故障域。

## 3. 决策

采用方案 C。当前在 `apps/api` 中实现 Provider-neutral 的 `DefaultAiOrchestrator`，但所有
入口只依赖 `AiOrchestrator` 接口：

```text
Driving Adapters
RTC final transcript / HTTP-SSE debug / offline evaluation
                         |
                         v
                 AiOrchestrator Port
                         |
                 DefaultAiOrchestrator
                    /    |     \
                   v     v      v
             TurnRouter Retriever LanguageModel
                         |
                  AiAnswerPolicy
```

依赖方向始终指向应用 Port。`DefaultAiOrchestrator` 不导入 Fastify、RTC SDK、Chroma Client
或任何具体模型 SDK。

当前代码位置：

```text
apps/api/src/ai/ai-types.ts
apps/api/src/ai/ai-ports.ts
apps/api/src/ai/default-ai-orchestrator.ts
apps/api/src/ai/mock-language-model.ts
```

## 4. Port 决定

### 4.1 输入 Port

`AiOrchestrator.answer()` 接收：

- 服务端 Session 绑定的 `tenantId`。
- `sessionId` 与 `roundId`。
- ASR 最终文本或调试文本。
- Locale。
- 可选 `AbortSignal`。

它返回 Provider-neutral 的答案模式、证据状态、播报文本、结构化引用和内部执行元数据。
输入对象不是公开 HTTP Schema；入口 Adapter 必须单独执行认证、运行时校验和字段白名单。

### 4.2 输出 Port

| Port | 责任 | 不允许承担 |
| --- | --- | --- |
| `TurnRouter` | 决定答案通道并生成标准化查询 | 身份认证、订单授权 |
| `KnowledgeRetriever` | 按可信 Tenant 范围检索并返回证据状态 | 生成最终回答、执行文档指令 |
| `LanguageModel` | 根据问题和允许证据生成文本与候选引用 | 决定来源是否有效、直接执行工具 |
| `AiAnswerPolicy` | 提供版本、输出预算和固定回复 | 保存 Provider 密钥 |

订单工具继续由现有 `BusinessToolService` 在模型之外进行对象级授权和字段白名单处理。后续
接入 Tool Gateway 时，模型仍不能提供 `tenantId`、`customerId` 或最终授权结论。

## 5. 编排不变量

`DefaultAiOrchestrator` 强制执行：

1. 非 `grounded_answer` 路由不调用 Retriever 或 LLM。
2. Retriever 返回 `none`、`conflicting` 或 `stale` 时不调用 LLM，改为 `abstain`。
3. `sufficient` 至少包含一条字段完整、状态为 `active` 的证据。
4. LLM 请求只包含问题、允许证据和生成预算，不包含 Tenant/Session/Round 标识。
5. Grounded 答案必须返回至少一个引用。
6. 模型引用必须是本轮 Retriever 返回来源的子集；伪造来源失败关闭。
7. 取消信号在每个外部依赖边界前后检查，不能让已取消轮次继续产生有效结果。

这里的引用白名单只能证明“引用来自本轮证据”，还不能证明每个自然语言断言都被真正
支持。Claim-level 忠实度将在后续生成评测中验证。

## 6. 部署决定

当前：

```text
Fastify API process
  ├─ Session / Agent / Tool services
  └─ AiOrchestrator module
```

暂不创建额外网络跳转。只有出现下面的实际证据时才考虑独立部署：

- AI 请求的 CPU、内存或连接池与控制面明显互相干扰。
- 模型/Retrieval 扩缩容节奏与 API 显著不同。
- 需要独立故障域、发布节奏或团队所有权。
- Python 专属解析、推理或 GPU 能力不能合理留在 Node 进程。

拆分时增加 Remote `AiOrchestrator` Adapter，并保留同样的应用语义。远程协议必须补齐：

- 服务间认证与 Tenant 绑定。
- Deadline 和取消传播。
- Trace Context。
- 幂等、重试和背压语义。
- 版本化请求、事件和错误契约。

浏览器不得为了减少一跳而直接调用模型或向量库。

## 7. 后果

正面影响：

- 同一编排逻辑可以服务 RTC、SSE 调试和离线评测。
- Mock LLM 可以零费用、确定性验证编排与失败关闭。
- 模型和 Retriever 不接触授权主体标识。
- 供应商替换和未来服务拆分不会污染业务入口。

需要继续完成：

- 本节尚未增加公开 HTTP/SSE API。
- 本节的 Router/Retriever 只有 Port，具体实现进入后续课程。
- 模型配置、密钥和真实 Provider Adapter 进入第 03 节。
- 类型化流事件、取消与背压进入第 04 节。
- Tool Gateway、观测指标和完整 RAG Trace 在后续集成中补齐。

## 8. 验证

`apps/api/test/ai-orchestrator.test.ts` 覆盖：

- 正常路由、检索、生成和引用映射。
- 无证据时跳过模型并拒答。
- 订单问题不进入 Retriever/LLM。
- 模型伪造引用失败关闭。
- 空的充分证据失败关闭。
- 取消轮次不调用任何依赖。
