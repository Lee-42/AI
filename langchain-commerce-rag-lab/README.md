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
pnpm lesson:02 # 使用内存 Store 做商品语义搜索
pnpm lesson:03 # 连接 Chroma 并创建课程 Collection
pnpm lesson:04 # 区分模型推理与向量索引
pnpm lesson:05 # 将商品向量写入 Chroma 并查询
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

## 02 利用豆包进行 Store 向量化模糊搜索

第 02 课把三个样例商品转换为 LangChain `Document`，使用
`MemoryVectorStore` 临时存储向量，再用 cosine similarity 返回 Top 3：

```bash
pnpm lesson:02
pnpm lesson:02 -- "适合剪视频和做三维设计的电脑"
```

内存 Store 会在进程退出后清空，只用于观察
`Document -> Embedding -> Store -> Similarity Search` 链路。

## 03 ChromaDB 向量数据库

第 03 课验证 Chroma 连接，并使用 `getOrCreate` 创建空的商品文本
Collection。Cloud 配置示例：

```dotenv
CHROMA_MODE=cloud
CHROMA_API_KEY=你的ChromaCloudKey
CHROMA_TENANT=你的Tenant
CHROMA_DATABASE=你的Database
```

```bash
pnpm lesson:03
```

本课只创建独立命名的 `commerce_products_text_v1`，不会写入商品记录，也不会
列出、修改或删除其他 Collection。

## 04 向量数据库的“训练”过程

向量数据库通常不训练 Embedding 模型。本课调用豆包把三个商品文档转换为
向量，并组装下一课要写入 Chroma 的记录，但故意不执行 `upsert`：

```bash
pnpm lesson:04
```

运行前后 Collection 记录数应保持不变。这个实验用于区分模型训练、Embedding
推理和向量索引构建。

## 05 向量数据库的存储和查询过程

本课使用稳定商品 ID 执行 `upsert`，再把用户问题转换为查询向量并返回 Top 3：

```bash
pnpm lesson:05
pnpm lesson:05 -- "适合剪视频和三维设计的电脑"
```

第一次运行会写入三个商品；以后重复运行只更新相同 ID，记录数不会继续增长。
