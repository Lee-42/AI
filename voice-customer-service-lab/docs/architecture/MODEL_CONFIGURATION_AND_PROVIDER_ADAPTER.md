# 模型配置、密钥、调试 API 与 Provider Adapter

本节把 `LanguageModel` Port 装配为 Mock 或火山方舟 Adapter，并提供一个默认关闭的本地
文本调试入口。架构决策见
[`ADR-004`](../adr/ADR-004-llm-provider-and-debug-api.md)。

## 1. 配置矩阵

| 配置 | 默认值 | 作用 | 是否可公开 |
| --- | --- | --- | --- |
| `LLM_PROVIDER` | `mock` | 选择独立模型 Adapter | 否 |
| `LLM_DEBUG_API_ENABLED` | `false` | 打开 local/test 调试路由 | 否 |
| `LLM_PAID_CALLS_ENABLED` | `false` | 第二把真实模型费用锁 | 否 |
| `LLM_REQUEST_TIMEOUT_MS` | `15000` | 单次 Provider Deadline | 否 |
| `RAG_ANSWER_POLICY_PATH` | 版本化策略文件 | Prompt、固定回复、生成预算 | 否 |
| `VOLCENGINE_ARK_BASE_URL` | 官方北京 API v3 | Provider 根地址，受允许列表保护 | 否 |
| `VOLCENGINE_ARK_MODEL` | 空 | 模型或推理接入点 ID | 否 |
| `VOLCENGINE_ARK_API_KEY` | 空 | Bearer API Key | 绝不 |

`VOICE_PROVIDER` 继续控制托管实时语音 Agent，不等于 `LLM_PROVIDER`。本地可以使用：

```dotenv
VOICE_PROVIDER=mock
LLM_PROVIDER=mock
LLM_DEBUG_API_ENABLED=true
```

这条路径不需要云凭证和费用开关。

## 2. 真实 Adapter 的失败关闭

只有下面的完整组合有效：

```dotenv
LLM_PROVIDER=volcengine
LLM_PAID_CALLS_ENABLED=true
VOLCENGINE_ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_ARK_MODEL=填写当前账号可用的模型或Endpoint ID
VOLCENGINE_ARK_API_KEY=填写到本地.env或Secret Store
```

不要把真实值写入 `.env.example`、Git、测试 Fixture、截图或课程文档。`ServerConfig.ai` 中的
Key 使用 `SecretValue` 包装；JSON 和字符串序列化只能得到 `[REDACTED]`。

安全摘要只暴露：

```text
llmProvider
llmDebugApiEnabled
llmPaidCallsEnabled
llmModelConfigured
```

不会输出 Base URL 之外的凭证、Model ID 或 API Key。

## 3. Provider Adapter

[`volcengine-ark-language-model.ts`](../../apps/api/src/ai/volcengine-ark-language-model.ts)
只负责供应商协议：

```text
GenerateGroundedAnswerRequest
-> Ark Chat Completions JSON
-> fetch + Bearer API Key + Deadline
-> Zod validate provider JSON
-> extract [source_id]
-> GeneratedGroundedAnswer
```

它不负责：

- 决定问题是否应该走 RAG。
- 判断证据是否有效或冲突。
- 认证 Session/Tenant。
- 接受模型生成的工具授权。
- 把 Provider Response Body 写入日志。

API Key 只在构造 Authorization Header 的最外层时解包。请求 Body 不包含 Key、Tenant、
Session 或 Round ID。

## 4. 版本化答案策略

[`rag-answer-policy.v1.json`](../../config/rag-answer-policy.v1.json) 新增：

- 四类直接回复。
- 最大输出 Token。
- Temperature 与 Top P。
- Grounded System Instruction。

[`rag-answer-policy.ts`](../../apps/api/src/ai/rag-answer-policy.ts) 在启动装配时执行运行时校验、
凭证文本扫描和版本读取。策略错误时不会回退到未审核 Prompt。

生成参数属于产品策略；Provider、Base URL、Model ID、Timeout 和 API Key 属于部署配置。
两者分开可以避免运营修改话术时接触密钥，也避免运维切换模型时悄悄改变答案边界。

## 5. 调试链路

```text
POST /api/v1/sessions/{session_id}/ai/debug-turns
  -> HTTP runtime validation
  -> active Session lookup
  -> server-bound demo Tenant
  -> AiDebugService idempotency
  -> AiOrchestrator
       -> DebugTurnRouter
       -> SyntheticKnowledgeRetriever
       -> Mock / Volcengine LanguageModel
  -> allow-listed debug response
```

请求：

```http
POST /api/v1/sessions/ses_xxx/ai/debug-turns
Idempotency-Key: local-debug-0001
Content-Type: application/json

{"text":"普通商品签收后几天可以申请退货？"}
```

响应只包含答案模式、证据状态、可播报文本、结构化引用和安全执行元数据。第一次为 201，
相同 Key 与相同文本重放为 200 且 `command_replayed=true`。

Body 没有 `tenant_id`、`model`、`system_prompt` 或生成参数。调用者不能通过调试 API 改变
权限边界、选择高成本模型或覆盖系统策略。

## 6. 调试 Fixture 的边界

`DebugTurnRouter` 和 `SyntheticKnowledgeRetriever` 只为了在第 03 节跑通完整端到端文本链路：

- 使用少量显式规则覆盖答案通道。
- 只读取课程合成知识集。
- 只允许 `tenant_demo_store`。
- 可以稳定产生 sufficient、none、conflicting 和 stale 场景。

它们不代表真实检索质量，不能用于生产。知识源治理、解析切片、Chroma 与查询理解在第
05～08 节实现。

## 7. 零费用练习

在根目录 `.env` 使用：

```dotenv
APP_ENV=local
VOICE_PROVIDER=mock
LLM_PROVIDER=mock
LLM_DEBUG_API_ENABLED=true
LLM_PAID_CALLS_ENABLED=false
```

启动：

```bash
nvm use 22
pnpm dev:api
```

先创建 Session，再使用返回的 `session_id` 调试。不要把 Mock 输出当作真实模型质量证明。

专项测试：

```bash
pnpm test:ai-provider
```

测试使用 Fake Fetch 验证方舟请求和响应映射，不访问公网模型 API。

## 8. 自动化证据

- Debug API 默认返回 404，且生产环境不能启用。
- 请求缺少幂等键或试图提交 `tenant_id` 时返回 400。
- 相同幂等键共享同一结果，改变文本返回 409。
- API Key 不进入 JSON、启动摘要、请求 Body 或错误正文。
- 任意 Ark Base URL 被拒绝，防止 Bearer Key 发往非允许 Host。
- 401/403、429、5xx、超时和非法 JSON 映射为稳定内部错误。
- OpenAPI 契约不包含 API Key、Authorization 或 Secret 字段。
- Mock、Provider 和 HTTP 测试不产生云费用。

## 9. 官方依据

- [火山方舟 Chat Completions API](https://api.volcengine.com/api-docs/view?action=ChatCompletions&serviceCode=ark&version=2024-01-01)
- [火山方舟 API 概览](https://api.volcengine.com/api-docs/view/overview?serviceCode=ark)
