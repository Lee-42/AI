# AI 实时语音客服实验项目

这是课程第 14 章的 Monorepo。当前只建立工程、配置和契约边界，完整 Mock
对话将在第 05 节实现。

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

默认使用 `VOICE_PROVIDER=mock`，不需要云资源或真实密钥。

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
OpenAPI 示例或日志。
