# ADR-002：采用全 TypeScript 运行时

| 字段 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-28 |
| 决策范围 | Web、Control API、契约、配置与测试工具链 |
| 关联需求 | FR-01～FR-12、SLO-05～SLO-07 |

## 1. 背景

第 04 节最初建立了 React/TypeScript Web 与 FastAPI/Python Control API。此时
项目尚未实现 Session、RTC 或 Provider 业务，可以低成本重新评估语言边界。

本项目第一阶段使用托管对话式 AI。Control API 主要负责：

- 鉴权和短期 RTC Token。
- Session 与 Agent 生命周期。
- 火山 OpenAPI 签名调用。
- 业务工具、幂等、回调和审计。

这些职责不依赖 Python 独有的模型训练或推理库。火山 RTC OpenAPI 提供 Node.js
签名 SDK，也可以通过签名后的标准 HTTPS 请求调用。

## 2. 候选方案

### 方案 A：React TypeScript + FastAPI Python

优点：

- Python AI 生态成熟。
- FastAPI/Pydantic 可以快速生成 OpenAPI。

代价：

- pnpm 和 uv 两套工作区、锁文件和 CI 工具。
- 领域事件与状态机需要维护 Python/TypeScript 两套表示。
- 当前控制面没有实际使用 Python 独有能力。

### 方案 B：React TypeScript + Fastify TypeScript

优点：

- Web、API、领域事件和测试使用同一种语言。
- TypeBox Schema 同时提供运行时校验和静态类型。
- 一个 pnpm workspace 和 lockfile。
- Provider Adapter、Mock 与事件 fixture 可以跨工作区复用。

代价：

- 将来若需要 PyTorch 或 Python 专属音频/模型库，需要增加独立服务。
- 必须验证火山 Node.js SDK 对具体 RTC API 的覆盖，必要时在 Adapter 中使用通用
  签名客户端。

## 3. 决策

采用方案 B：

```text
apps/web             React + Vite + TypeScript
apps/api             Fastify + Node.js + TypeScript
packages/contracts   TypeBox + OpenAPI generated types
tests                Vitest + Playwright
tooling              pnpm + TypeScript + Biome
```

不引入 NestJS。当前 API 边界较小，Fastify 插件、Schema 和依赖显式传递足够；
当模块数量、团队规模或依赖注入需求显著增加时再评估。

## 4. 契约决定

```text
TypeBox Schema
-> Fastify request/response runtime validation
-> @fastify/swagger OpenAPI
-> openapi-typescript path types
-> Web
```

TypeScript 类型在运行时会消失，所以不能只声明 `interface`。所有外部输入仍必须
经过 Zod 或 TypeBox 运行时验证。

## 5. 密钥决定

- 根目录 `.env` 只由 Node API 加载。
- Vite 只读取 `apps/web` 内的公开环境文件。
- 长期密钥包装为 `SecretValue`，默认序列化为 `[REDACTED]`。
- `SecretValue.reveal()` 只能在 Provider/Telemetry Adapter 调用。
- API 启动日志使用 `safeConfigSummary()` 明确白名单。

## 6. 后果

已移除：

- FastAPI、Pydantic 与 Python 源码。
- uv workspace、`uv.lock` 和 `.python-version`。
- Pytest、Ruff、Mypy 与 Python 虚拟环境。

已替换为：

- Fastify、TypeBox、Zod。
- Vitest、Biome 和 TypeScript strict mode。
- 一个 pnpm workspace 与 `pnpm-lock.yaml`。

如果未来出现必须使用 Python 的能力，新增隔离的 AI Worker，通过版本化契约
调用；不把 Python 重新混入 Control API。

## 7. 参考

- [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
- [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)
- [火山 RTC OpenAPI 调用方式](https://www.volcengine.com/docs/5891/69859)
