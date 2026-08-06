# Realtime RAG Conversation Policy

## 目标与非目标

本层为实时 RAG 提供 Provider 无关的固定欢迎语、Grounded Prompt、Session 记忆和安全降级
决策。它只准备运行组件；本课不修改 `AiOrchestrator`、SSE、RTC 或火山 Agent 的在线装配。

它不承担以下职责：

- Tenant、用户身份和订单对象授权；
- 文档生命周期、检索 Allowlist 和证据冲突治理；
- 真实模型的 Prompt 遵循率评测；
- 跨 Session 用户画像或长期记忆；
- 企业级 DLP。

## 策略所有权

| 配置 | 所有权 |
| --- | --- |
| `customer-service-policy.v1.json` | 身份、固定欢迎语、隐私、语音表达和应用记忆预算 |
| `rag-answer-policy.v1.json` | Grounded 指令、证据降级、服务降级和生成参数 |

`RealtimeConversationPolicy` 组合这两份策略，不创建第三份重复配置。Locale 不一致时失败关闭，
`version` 以固定顺序包含两份源策略版本。

## 运行组件

```text
CustomerServicePromptPolicy ----+
                                 +-> RealtimeConversationPolicy
VersionedRagAnswerPolicy --------+          |
                                            +-> fixed welcome
ConversationMemorySnapshot ----------------+-> Grounded context
Provider/evidence outcome -----------------+-> SafeFallbackDecision
```

- `GroundedPromptBuilder`：构造稳定 System Instruction，并把完整轮次转换为独立历史消息。
- `ConversationMemory`：可替换 Port；课程实现为进程内 `SessionConversationMemory`。
- `SensitiveConversationDetector`：只返回敏感类别；课程 Adapter 不返回命中值。
- `SafeFallbackPolicy`：把证据状态或异常映射为固定的 `speak` / `silent` 决策。

## Prompt 信任边界

System Instruction 是受信策略；用户问题、ASR、History、Evidence 正文和工具结果都是不可信
输入。History 只能协助理解指代，旧用户陈述和旧 AI 回答都不能支持本轮政策事实。

只有当前检索链路通过有效期、冲突和 Token 门禁后返回的 `EVIDENCE` 可以支持事实。后续模型
调用仍必须校验引用集合，不能仅靠 Prompt 约束未知来源。

欢迎语直接读取受版本控制的 `identity.welcome_message`，不经过 Router、Retriever 或 LLM，
也不进入 History。

## Session 记忆生命周期

记忆键由服务端 Session 提供的 `tenantId + sessionId` 组成。浏览器文本不得覆盖这两个值。

```text
完整成功轮次
-> 检查双方敏感类别
-> 计算完整问答对 Token
-> 拒绝单轮超限
-> 写入副本
-> 按轮数和 Token 淘汰最旧整轮
-> Session close 时 clear(scope)
```

不记录欢迎语、流式 Delta、半轮次、失败轮次或取消轮次。敏感命中时双方一起排除，防止保留
AI 对敏感输入的复述或推断。快照和写入对象都复制，调用方不能修改内部状态。

`generation.history_length` 是 Voice Agent Provider 的原生配置，不代表应用已经执行租户
隔离、敏感排除或关闭清理；两套边界不能互相替代。

## 降级矩阵

| 输入 | 决策 | `retryable` | `recordInMemory` |
| --- | --- | --- | --- |
| `none` / `conflicting` / `stale` | 对应固定证据文案 | `false` | `true` |
| Timeout / Rate Limit / Unavailable | 固定服务不可用文案 | `true` | `false` |
| Auth / Rejected / Invalid / Unknown | 固定服务异常文案 | `false` | `false` |
| AbortSignal / `AI_TURN_ABORTED` | `silent` | `false` | `false` |

取消检查必须早于 Provider 错误映射。决策中不包含原始 `error.message`、Provider Body 或凭证。

## 隐私与可观测性

生产日志允许记录低基数字段，例如：

- 组合策略版本；
- 记忆写入结果和淘汰原因；
- 记忆轮数与估算 Token 数；
- 敏感类别，不记录命中值；
- 降级原因、重试性和取消状态。

默认不记录完整问题、回答、History、Prompt、Evidence 正文或异常正文。课程检测器需要在生产
环境替换为经过评审的 DLP Adapter；进程内记忆若扩展到多实例，也必须保留相同复合键、TTL、
整轮写入和删除语义。

## 下一课接入约束

第 02 节的 RAG Service 必须保持以下顺序：

1. 从可信 Session 得到 Tenant 与 Session ID。
2. 读取有界历史，构造 Grounded 上下文。
3. 执行 Router、Retriever 和 LLM，并传播同一个 AbortSignal。
4. 先完成输出与引用校验，再生成最终响应。
5. 仅当决策允许且轮次完整成功时写入记忆。
6. 取消保持静默；Session 关闭时清理记忆。

Mock、调试 API 和 RTC 必须复用同一个 RAG Service，避免三条入口产生不同的 Prompt、记忆或
降级行为。
