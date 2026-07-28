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
| 会话短期凭证 | RTC Token | API 运行时签发 | 仅绑定会话后返回 |

Vite 会把 `VITE_*` 写入浏览器产物，所以这个前缀应理解为 `PUBLIC_*`，不能理解
为“普通环境变量”。

## 5. 配置失败策略

- Mock 模式不要求任何云密钥。
- Volcengine 模式缺少必要密钥时，API 启动立即失败。
- 最大会话时长不能超过 Session/Token TTL。
- 配置通过 Zod 转为强类型，不在业务代码中到处读取 `process.env`。
- 密钥包装为 `SecretValue`，JSON 和字符串序列化默认显示 `[REDACTED]`。
- 启动日志只使用 `safeConfigSummary()` 白名单，不序列化整个 `ServerConfig`。

## 6. 本节不实现什么？

- 不创建真实 RTC Session 或 Token。
- 不启动 Mock 对话事件流。
- 不调用火山 Provider。
- 不把 OpenAPI 生成类型当作领域状态机。

这些分别属于第 05、07、09 和 10 节。
