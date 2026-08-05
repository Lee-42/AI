# ADR-004：独立配置 LLM Provider，并限制调试 API

| 字段 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-08-04 |
| 决策范围 | 模型配置、密钥、Provider Adapter、文本调试入口 |
| 关联需求 | 可替换模型、零费用测试、费用保护、密钥隔离、契约化调试 |

## 1. 背景

托管 Voice Agent 内部已经可以组合 ASR、LLM 和 TTS，但独立 RAG 编排还需要一个由应用
控制的 `LanguageModel` Port。该 Port 同时服务本地调试、离线评测和后续实时语音接入。

需要解决四个问题：

1. Voice Provider 与独立 LLM Provider 是否使用同一开关和凭证。
2. 是否引入厂商 SDK，还是直接实现当前需要的 HTTP Adapter。
3. 如何防止仅填写 API Key 就意外产生付费调用。
4. 如何提供可重复调试入口，而不把内部 Prompt、密钥或 Tenant 选择权暴露给浏览器。

## 2. 决策

### 2.1 独立 Provider 配置

`VOICE_PROVIDER` 与 `LLM_PROVIDER` 是两条独立链路：

```text
VOICE_PROVIDER -> RTC / 托管 ASR-LLM-TTS Agent
LLM_PROVIDER   -> 应用控制的 AiOrchestrator / RAG LanguageModel Port
```

默认均可保持 Mock。切换独立 LLM 不会隐式切换 RTC 或托管 Voice Agent。

### 2.2 两把费用锁

真实方舟 Adapter 必须同时满足：

```text
LLM_PROVIDER=volcengine
LLM_PAID_CALLS_ENABLED=true
VOLCENGINE_ARK_MODEL=<受控模型或 Endpoint ID>
VOLCENGINE_ARK_API_KEY=<服务端 Secret>
```

只填写密钥、只选择 Provider 或只打开费用开关都会在启动配置校验阶段失败。

### 2.3 使用原生 Fetch Adapter

当前只需要方舟 Chat Completions 的一个非流式端点，因此使用 Node 22 原生 `fetch`，不增加
厂商 SDK 依赖。Adapter 固定调用：

```text
POST https://ark.cn-beijing.volces.com/api/v3/chat/completions
Authorization: Bearer <server-only API Key>
```

请求包含 `model`、`messages`、`max_tokens`、`temperature`、`top_p` 和 `stream=false`。
响应使用 Zod 运行时校验，再映射为内部 `GeneratedGroundedAnswer`；原始 Provider JSON 不会
离开 Adapter。

若后续 SDK 能显著改善流式协议、连接管理或官方兼容性，可以在同一 `LanguageModel` Port
后替换实现，不改变 Orchestrator。

### 2.4 Base URL 使用允许列表

配置只接受当前官方北京地域 API v3 URL，不能把携带 Bearer API Key 的请求改发到任意
Host。这同时降低配置错误、SSRF 和密钥外传风险。增加其他官方地域必须通过代码评审扩展
允许列表，不能临时填一个 URL 绕过。

### 2.5 调试 API 受限

文本调试入口：

```text
POST /api/v1/sessions/{session_id}/ai/debug-turns
```

具有以下约束：

- `LLM_DEBUG_API_ENABLED=false` 为默认值。
- 只允许 `APP_ENV=local|test` 打开；Staging/Production 启动时拒绝该配置。
- 必须先创建有效 Session。
- Tenant 由服务端 Session 绑定，Body 不接受 `tenant_id`。
- 必须提供 `Idempotency-Key`；同一个 Key 共享同一进行中或已完成调用。
- 相同 Key 改变文本返回 409。
- 响应 `Cache-Control: no-store`。
- 返回结构化答案、引用、策略版本、Provider Request ID 和 Token 用量，不返回 API Key、
  完整 Prompt 或原始 Provider JSON。

该端点是课程和开发诊断工具，不是生产聊天产品接口。

## 3. Provider 输出与引用

方舟返回自然语言文本。Grounded System Instruction 要求模型在事实后输出
`[source_id]`。Adapter：

1. 提取方括号内的来源 ID。
2. 从可播报文本中移除 ID。
3. 把候选 ID 交给 Orchestrator。
4. Orchestrator 再验证这些 ID 是否属于本轮检索结果。

Adapter 不自行把未知引用过滤成“看起来成功”；伪造 ID 必须让上层失败关闭。

## 4. 错误映射

| Provider 情况 | 内部错误 | Retryable | Debug HTTP |
| --- | --- | --- | --- |
| 401/403 | `LLM_PROVIDER_AUTHENTICATION_FAILED` | false | 503 |
| 429 | `LLM_PROVIDER_RATE_LIMITED` | true | 503 |
| 5xx/网络失败 | `LLM_PROVIDER_UNAVAILABLE` | true | 503 |
| 超时 | `LLM_PROVIDER_TIMEOUT` | true | 504 |
| 其他 4xx | `LLM_PROVIDER_REJECTED` | false | 502 |
| 响应结构错误 | `LLM_INVALID_RESPONSE` | false | 502 |

错误正文不会包含 Provider Response Body，避免上游错误中的敏感内容进入日志或客户端。
标记 `retryable` 不代表当前代码会自动重试付费调用；重试策略需要结合幂等、Deadline 和
费用预算单独设计。

## 5. 后果

正面影响：

- 默认开发和 CI 不需要云凭证，也不会调用付费模型。
- 密钥只在 Adapter 组装 Authorization Header 时 `reveal()`。
- Provider 请求/响应变化被限制在一个文件。
- 调试入口与实时语音共享 `AiOrchestrator`，但不共享媒体协议。
- Provider Request ID 与 Token 用量可以进入后续 Trace 和成本观测。

限制：

- 本节只实现非流式 Chat Completions；流式 SSE 在第 04 节定义。
- Debug Router 和 Synthetic Retriever 是课程 Fixture，不是生产查询理解与召回实现。
- Mock LLM 不能证明真实模型遵循引用格式。
- 当前没有对付费请求做自动重试。

## 6. 官方依据

- [火山方舟 Chat Completions API](https://api.volcengine.com/api-docs/view?action=ChatCompletions&serviceCode=ark&version=2024-01-01)
- [火山方舟 API 概览](https://api.volcengine.com/api-docs/view/overview?serviceCode=ark)
