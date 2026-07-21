# LangChain Commerce RAG Lab

本项目用于逐步构建一个多模态商品检索与 RAG 导购助手，覆盖文本 Embedding、Chroma、长文档切片、检索评估、文搜图和图搜图。

完整范围、架构决策与验收标准见 [SPEC.md](./SPEC.md)。

## 初始化

```bash
pnpm install
cp .env.example .env
pnpm verify
pnpm dev
```

初始化阶段不要求 API Key，也不会连接 Chroma。真实模型和数据库将在对应课程阶段接入。

## 当前命令

```bash
pnpm dev     # 查看项目与环境配置状态
pnpm check   # TypeScript 类型检查
pnpm test    # 运行基础契约和样例数据测试
pnpm verify  # check + test
```
