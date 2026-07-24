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
pnpm lesson:01 # 调用豆包文本 Embedding API
pnpm check   # TypeScript 类型检查
pnpm test    # 运行基础契约和样例数据测试
pnpm verify  # check + test
```

## 01 跑通豆包 Embedding 模型 API

先在 `.env` 中配置：

```dotenv
ARK_API_KEY=你的方舟 API Key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_TEXT_EMBEDDING_MODEL=文本向量模型的 Model ID 或 Endpoint ID
ARK_TEXT_EMBEDDING_API_MODE=multimodal
```

显式执行下面的命令才会连接外部 API 并产生相应用量：

```bash
pnpm lesson:01
```

当前方舟控制台推荐使用 `Doubao-embedding-vision`。它支持纯文本向量化，
但需要调用 `/embeddings/multimodal`，所以 API 模式使用 `multimodal`。命令会
向量化“电脑笔记本”和“纸质笔记本”两段文本，并输出实际模型、向量数量、
维度、前 8 个数值和本次 token 用量。完整向量不会写入日志。
