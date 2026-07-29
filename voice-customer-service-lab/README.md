# AI 实时语音客服实验项目

这是课程第 14 章的 Monorepo。当前已经完成 Web、API、Mock Voice Provider、
服务端 RTC Token Broker，以及显式授权后加入 RTC 房间的浏览器 Client Adapter。

## 目录

```text
apps/api             Fastify TypeScript 控制面
apps/web             React 浏览器客户端
packages/contracts   TypeBox Schema 与生成的 HTTP 契约
docs                 SPEC、ADR、协议和安全设计
```

## 本地准备

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm contract:generate
```

默认使用 `VOICE_PROVIDER=mock`，可以练习 Session、RTC Token 和 AI Agent 生命周期，
但不会启动真实云 Agent。真实模式还受独立费用开关和本地 Voice Config 文件保护。
即使填入火山凭证，付费路径也默认关闭；资源与费用检查清单见
[`VOLCENGINE_RESOURCE_GUARDRAILS.md`](docs/security/VOLCENGINE_RESOURCE_GUARDRAILS.md)。

第 07 节可把 `RTC_TOKEN_PROVIDER` 单独改为 `volcengine`，用服务端 AppKey
在本地生成真实格式的短期 Token；这不会加入 RTC 房间或启动 AI Agent。安全边界
见 [`RTC_TOKEN_BROKER.md`](docs/security/RTC_TOKEN_BROKER.md)。

第 08 节只有点击“加入 RTC 房间”才会连接云端。浏览器设备和清理流程见
[`BROWSER_RTC_CLIENT.md`](docs/architecture/BROWSER_RTC_CLIENT.md)。

第 09 节只有入房后明确点击才启动 Agent。默认返回 Mock 生命周期；真实
`StartVoiceChat` 配置与回收策略见
[`AI_AGENT_LIFECYCLE.md`](docs/architecture/AI_AGENT_LIFECYCLE.md)。

## 本地学习流程

分别启动：

```bash
pnpm dev:api
pnpm dev:web
```

打开 `http://localhost:5173`：

1. 点击“创建会话”。
2. 点击“检查麦克风”，允许权限并选择输入设备。
3. 点击“加入 RTC 房间”，短暂验证后点击“退出 RTC”。
4. 入房后点击“启动 AI Agent（可能计费）”，确认 Provider 为 `mock`。
5. 点击“停止并回收 Agent”。
6. 仍可输入一句模拟用户话语，观察 Mock 事件回放。
7. 点击“结束会话”，观察资源清理事件。

加入 RTC 会使用真实云房间，但当前没有 AI 对端。文本框和事件延迟仍只是
Mock Adapter，不代表真实语音链路。设计说明见
[`MOCK_VERTICAL_SLICE.md`](docs/architecture/MOCK_VERTICAL_SLICE.md)。

## 常用命令

```bash
# API
pnpm dev:api

# Web
pnpm dev:web

# 重新生成 OpenAPI 和 TypeScript 类型
pnpm contract:generate

# 契约、类型、测试与静态检查
pnpm check

# 三个工作区的生产构建
pnpm build
```

不要把 `VOLCENGINE_*`、Token 或可识别用户的信息写入 Web 环境变量、源码、
OpenAPI 示例或日志。页面只显示凭证已签发，不显示 Token 内容。
