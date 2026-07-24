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
pnpm lesson:06 # 用二维向量观察 Chroma 最小 API
pnpm lesson:07 # 手算并核对三种向量距离
pnpm lesson:08 # 诊断“笔记本”歧义和否定表达
pnpm lesson:09 # 用固定评估集比较内容模板
pnpm lesson:11 # 练习 metadata 与正文查询操作符
pnpm lesson:12 # 在独立沙盒中查询和安全删除
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

## 06 ChromaDB 最简案例

本课不调用豆包，直接用三个二维方向向量观察 `getOrCreateCollection`、`upsert`
和 `query`：

```bash
pnpm lesson:06
```

二维向量保存在独立的 `course_lesson06_minimal_v1`，不会与商品的 2048 维向量
混合。Collection 使用稳定 ID，重复运行不会增加记录数。

## 07 向量数据库中的距离表示

本课手算 squared L2、cosine 和 inner product distance，并把 cosine 结果与
第 06 课沙盒 Collection 的真实查询结果逐项对照：

```bash
pnpm lesson:07
```

## 08 “笔记本屏幕不错”和“笔记本”相关吗

本课批量比较含义不完整、增加上下文、正反评价和纸质笔记本查询，观察短语向量
距离、商品 Top 2 以及排名间隔：

```bash
pnpm lesson:08
```

示例只查询现有商品 Collection，不写入数据。

## 09 如何提升向量数据库的检索精度

本课使用固定查询和期望 SKU，对“只索引商品名”与“名称、描述、用途、规格”
两个内容模板进行 A/B，计算 Recall@1、Recall@3 和 MRR：

```bash
pnpm lesson:09
```

评估在内存中使用同一批查询向量完成，不读写 Chroma。

## 11 ChromaDB 中的查询操作符

本课对商品 Collection 使用 `where`、`whereDocument`、`$and`、`$or`、范围和
集合操作符。最后组合向量检索与 `price = 6999` 精确过滤：

```bash
pnpm lesson:11
```

示例只读取 Chroma，并调用一次短文本 Embedding，不写入记录。

## 12 ChromaDB 查询、删除操作

本课对比 `get` 与 `query`，并在独立的 `course_lesson12_crud_v1` 二维沙盒中
演示删除：

```bash
pnpm lesson:12
```

命令会先预览删除目标，只有命中 ID 与预期完全一致时才删除。删除验证完成后会
恢复临时记录，重复运行不会影响商品 Collection。
