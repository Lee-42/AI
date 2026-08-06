# LLM/RAG 架构与 AiOrchestrator 边界

`AiOrchestrator` 是语音客服进入 LLM/RAG 的应用边界。它编排答案通道、知识检索、证据
门禁、模型生成和引用验证，但不拥有 RTC、身份认证、向量数据库实现或订单事务。

架构决策及候选方案见
[`ADR-003`](../adr/ADR-003-ai-orchestrator-hexagonal-boundary.md)。

## 1. 依赖方向

```text
┌──────────────── Driving Adapters ────────────────┐
│ RTC 最终文本 │ HTTP/SSE 调试 │ 离线评测          │
└──────────────────────┬───────────────────────────┘
                       v
              AiOrchestrator (input port)
                       |
              DefaultAiOrchestrator
             /         |           \
            v          v            v
      TurnRouter  KnowledgeRetriever  LanguageModel
                          |
                    AiAnswerPolicy
```

内层定义 Port，外层 Adapter 依赖 Port。内层不能导入：

- Fastify Request/Reply 或 OpenAPI 类型。
- veRTC、火山 OpenAPI 或具体模型 SDK。
- Chroma Client 或具体 Embedding 响应。
- 浏览器事件、React 状态或 TTS 音频帧。

## 2. 一轮公开政策问答

```text
AiOrchestrator.answer(turn)
  -> TurnRouter.route(turn)
  <- grounded_answer + normalized query
  -> KnowledgeRetriever.retrieve(tenant + query + topK)
  <- sufficient + evidence[]
  -> validate active evidence
  -> LanguageModel.generate(question + evidence + budget)
  <- text + cited_source_ids[]
  -> validate citations are a subset of evidence
  <- spoken_text + structured citations
```

模型只收到生成所需的最少数据，不收到 `tenantId`、`sessionId` 或 `roundId`。这些标识用于
服务端权限、取消和 Trace，不需要成为 Prompt 内容。

## 3. 一轮无证据问答

```text
Retriever -> none / conflicting / stale
Orchestrator -> skip LLM
Orchestrator -> AiAnswerPolicy fixed fallback
Result -> abstain + no citations
```

跳过模型既能减少幻觉风险，也减少延迟和费用。不能让模型在没有证据时“再试着凭常识回答”。

## 4. 订单问题为什么不走 Retriever？

```text
用户：我的订单到哪里了？
TurnRouter -> tool_required
Orchestrator -> 不调用知识 Retriever
             -> 不调用通用 LLM 生成订单事实
```

后续 Tool Gateway 必须从服务端 Session 解析 Principal，再调用现有
`BusinessToolService`。模型最多提供允许的工具名和业务参数，不能提供 Tenant、Customer
或授权结论。

## 5. 当前代码

| 文件 | 责任 |
| --- | --- |
| `ai-types.ts` | 答案模式、证据状态、输入/输出和领域错误 |
| `ai-ports.ts` | Router、Retriever、LanguageModel、AnswerPolicy 输出 Port |
| `default-ai-orchestrator.ts` | Provider-neutral 编排和失败关闭不变量 |
| `mock-language-model.ts` | 零网络、零费用、确定性模型 Adapter |
| `ai-orchestrator.test.ts` | 架构行为与隐私边界证据 |

第 02 节只稳定内核，没有修改 `app.ts`。第 03 节已经通过
`createDebugAiOrchestrator()` 装配 Mock/方舟 LanguageModel，并增加默认关闭的 Session 绑定
调试 API；实时 RTC 仍未接入。第 04 节再定义流式协议、取消与背压。

## 6. Mock LLM 能证明什么？

Mock LLM 可以证明：

- Orchestrator 何时调用或跳过模型。
- 传给模型的字段是否最小化。
- 输出引用能否映射回本轮证据。
- 取消和错误是否阻止旧结果生效。
- 测试不会产生模型费用。

Mock LLM 不能证明：

- 真实模型能够正确遵循 Prompt。
- 回答事实忠实度和自然语言质量达标。
- Provider 的超时、限流、Token 用量或流式顺序正确。
- 生产检索器能召回黄金来源。

这些必须由真实 Adapter 契约测试、Staging 测试和离线评测补齐。

## 7. 运行练习

```bash
nvm use 22
pnpm test:ai-orchestrator
```

建议实验：

1. 把 Retriever 状态从 `sufficient` 改成 `none`，观察 Mock LLM 调用次数变为 0。
2. 让 Mock LLM 返回 `hallucinated-source`，观察 Orchestrator 失败关闭。
3. 在模型请求中加入 `tenantId`，观察隐私边界测试失败，并解释为什么模型不需要它。
4. 将已取消的 `AbortSignal` 传入，确认 Router、Retriever 和 LLM 都没有调用。

实验后恢复文件并运行完整 `pnpm check`。
