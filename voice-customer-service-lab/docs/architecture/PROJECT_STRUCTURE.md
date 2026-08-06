# Monorepo、配置与契约基线

## 1. 为什么这里使用 Monorepo？

Web、API 和契约属于同一个可独立部署的产品，并且需要原子修改：

```text
TypeBox response schema
-> OpenAPI
-> TypeScript 类型
-> Web 调用
```

放在同一仓库可以让一次 Pull Request 同时更新实现、契约和测试。当前只有三个
工作区，不引入 Nx/Turborepo；等构建缓存或任务编排成为真实瓶颈再评估。

## 2. 目录与所有权

| 路径 | 责任 | 不允许出现 |
| --- | --- | --- |
| `apps/web` | 浏览器 UI、设备和 RTC Client Adapter | 长期密钥、Provider OpenAPI |
| `apps/api` | Fastify 鉴权、Session、Token Broker、Agent 生命周期 | React UI、浏览器媒体状态 |
| `packages/contracts` | TypeBox Schema 与生成的 HTTP 类型 | 业务实现、手改生成文件 |
| `docs/protocol` | 领域事件与状态机设计 | 厂商密钥和真实用户数据 |

pnpm 管理三个 TypeScript 工作区，整个项目只维护一份 `pnpm-lock.yaml`。

## 3. HTTP 契约流水线

```text
TypeBox schema
-> Fastify runtime validation
-> @fastify/swagger
-> packages/contracts/openapi/voice-api.v1.json
-> openapi-typescript
-> packages/contracts/src/api.generated.ts
-> React
```

`operationId` 必须稳定，因为生成的客户端名称依赖它。CI 运行
`pnpm contract:check`，如果重新生成后存在 Git 差异，说明契约没有同步提交。

事件协议和 HTTP API 使用独立版本：

```text
HTTP path          /api/v1/...
Event envelope     schema_version: 1
```

二者的破坏性变更不一定同时发生，不能共用一个模糊的“项目版本”。

## 4. 配置分层

| 类型 | 示例 | 来源 | 可进入浏览器 |
| --- | --- | --- | --- |
| 构建时公开配置 | `VITE_API_BASE_URL` | `apps/web/.env.local` | 是 |
| 服务端普通配置 | `VOICE_PROVIDER`、超时 | 根目录 `.env` / 平台环境变量 | 否 |
| 服务端长期密钥 | AppKey、AccessKey、SecretKey | Secret Store / 本地 `.env` | 否 |
| Voice Provider 配置 | ASR/LLM/TTS `Config` | Secret Store / 忽略的本地 JSON | 否 |
| 会话短期凭证 | RTC Token | API 运行时签发 | 仅绑定会话后返回 |

Vite 会把 `VITE_*` 写入浏览器产物，所以这个前缀应理解为 `PUBLIC_*`，不能理解
为“普通环境变量”。

## 5. 配置失败策略

- Mock 模式不要求任何云密钥。
- Volcengine 模式缺少必要密钥时，API 启动立即失败。
- Volcengine 模式还要求显式开启 `VOLCENGINE_PAID_CALLS_ENABLED`。
- VoiceChat OpenAPI 固定为 `2025-06-01`，不自动追随最新版。
- 最大会话时长不能超过 Session/Token TTL。
- 配置通过 Zod 转为强类型，不在业务代码中到处读取 `process.env`。
- 密钥包装为 `SecretValue`，JSON 和字符串序列化默认显示 `[REDACTED]`。
- 启动日志只使用 `safeConfigSummary()` 白名单，不序列化整个 `ServerConfig`。

## 6. 第 09 节后的实现状态

- 已实现 Web、API 与 Mock Provider 纵向切片。
- 已实现 Session 创建、模拟轮次和幂等结束契约。
- 已实现服务端 RTC Token Broker 与 Room/User 身份绑定。
- 已实现浏览器麦克风授权、设备选择、RTC 入房与幂等清理。
- 已实现 AI Agent 显式启动、停止、硬截止时间和孤儿任务重试。
- 已实现标准事件批次和 Web reducer。
- 可选择签发真实格式 Token；真实 Agent 仍受 Provider、费用开关和本地 Config
  三重约束。
- OpenAPI 生成类型仍只描述 HTTP，不代替领域状态机。

Mock 切片详见
[`MOCK_VERTICAL_SLICE.md`](MOCK_VERTICAL_SLICE.md)。
Token 边界详见
[`RTC_TOKEN_BROKER.md`](../security/RTC_TOKEN_BROKER.md)。
浏览器 RTC 边界详见
[`BROWSER_RTC_CLIENT.md`](BROWSER_RTC_CLIENT.md)。
Agent 生命周期详见
[`AI_AGENT_LIFECYCLE.md`](AI_AGENT_LIFECYCLE.md)。

这些分别属于第 05、07、08 和 09 节。
