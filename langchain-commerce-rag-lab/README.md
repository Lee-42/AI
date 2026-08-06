# LangChain Commerce RAG Lab

本项目用于逐步构建一个多模态商品检索与 RAG 导购助手，覆盖文本 Embedding、Chroma、长文档切片、检索评估、文搜图和图搜图。

完整范围、架构决策与验收标准见 [SPEC.md](./SPEC.md)。

## 初始化

环境要求：Node.js 20 或更高版本。

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
pnpm lesson:13 # 切分说明书并执行向量查询
pnpm lesson:14 # 诊断“原文查不到”的原因
pnpm lesson:15 # 对比默认与中文标点切片的召回
pnpm lesson:15:offline # 只比较本地切片，不调用外部服务
pnpm lesson:17 # 把检索结果组装成受控的 LLM messages
pnpm lesson:18 # 生成并审计稳定、可追溯的向量记录 ID
pnpm lesson:19 # 用豆包多模态向量和 Chroma 实现文搜图
pnpm lesson:20 # 离线观察张量的 shape、rank、axis 和 flatten
pnpm lesson:21 # 用查询图片在 Chroma 中检索相似图片
pnpm lesson:22 # 读取 Chroma 图片向量并分析逻辑存储大小
pnpm langsmith:02 # 用 LangSmith 追踪一次豆包 Embedding 调用
pnpm langsmith:04 # 离线演示 traceable 的 7 种 run_type
pnpm check   # TypeScript 类型检查
pnpm test    # 运行基础契约和样例数据测试
pnpm verify  # check + test
```

LangSmith 课程使用独立命令前缀，避免与前一章已有的 `lesson:02` 冲突。

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

## 13 长文本切片存储与向量查询

本课使用 `MarkdownTextSplitter` 将两份说明书按 `chunkSize=600`、
`chunkOverlap=100` 切成可追溯的 LangChain `Document`，生成豆包向量后写入
独立 Collection：

```bash
pnpm lesson:13
```

每个 chunk 都保存稳定 ID、SKU、源文件、序号和起始位置。查询 Studio 16
说明书时会先用 SKU 过滤，再对对应 chunk 进行 cosine 排序。

## 14 为什么我用 ChromaDB 查询原文都查不到？

本课对比按 ID 精确读取、`whereDocument` 全文包含和向量近邻查询，并观察完整
原文、chunk 内原句与跨 chunk 原文的不同结果：

```bash
pnpm lesson:14
```

商品说明书 Collection 没有内置 Embedding，因此不能直接传 `queryTexts`。
示例使用与入库相同的豆包模型生成 `queryEmbeddings`，全程不写入 Chroma。

## 15 解决 ChromaDB 查询中文不精准问题

本课保持说明书、`chunkSize`、`chunkOverlap`、Embedding、cosine 索引和查询
完全相同，对比两种切片策略。中文策略不仅加入中文标点边界，还把标点保留在
前一句末尾：

```text
default:             Markdown 标题/段落 -> 换行 -> 空格 -> 单字符
chinese-punctuation: Markdown 标题/段落 -> 。！？；，、 -> 换行 -> 空格 -> 单字符
```

示例先计算全语料句子覆盖率，再以“Top K 是否包含带完整答案的 chunk”计算
答案片段 Recall@1、Recall@3 和 MRR。两组 chunk 写入独立课程 Collection：

```bash
pnpm lesson:15:offline
pnpm lesson:15
```

第一条命令只做确定性切片检查，不调用 Embedding 或 Chroma；第二条才会使用
`.env` 中配置的外部服务。

## 17 ChromaDB 查询之后给到什么数据 LLM？

本课把数据边界拆成三层：

```text
Chroma QueryResult
  -> retrieval 层的 SearchHit[]
  -> 受控 context + SystemMessage + HumanMessage
  -> Chat Model
```

`distance`、`relevanceScore`、Embedding、Chroma 对象和内部 metadata 只留在应用
后端。发给模型的是用户问题、入选 chunk 正文，以及 `source / sku /
chunkIndex` 等可引用字段。上下文保持检索层的排序，按字符预算保留完整 source
block，并明确把召回正文当作不可信数据。

```bash
pnpm lesson:17
```

这个示例读取本地说明书并回放第 13 课已记录的三个命中，不连接 Chroma，也不
调用 Chat Model；它会打印真正可传给模型的两个 LangChain message。

## 18 向量存储的 ID 设计

本课把商品、说明书切片和未来图片记录的 ID 统一为：

```text
product:{sku}:profile
manual:{sku}:chunk:{四位补零序号}
image:{sku}:{imageRole}
```

```bash
pnpm lesson:18
```

示例会本地演示稳定 ID 与随机 UUID 的差别，并只读审计现有商品和说明书
Collection。它不调用豆包，也不写入 Chroma。

## 19 ChromaDB 实现文搜图

本课用同一个豆包多模态模型分别生成图片向量和文字查询向量，再在独立图片
Collection 中执行 cosine 查询：

```bash
pnpm lesson:19
pnpm lesson:19 -- "白色方格纸线圈记事本"
```

首次运行会向量化三张教学图片并写入 `commerce_product_images_v1`。Chroma
保存预计算向量、稳定 ID、metadata 和图片 URI，不保存图片二进制。

## 20 如何理解机器学习中的张量？

本课使用一个 `2 × 3` 的 RGB 微型图片，逐步观察标量、向量、矩阵、图片张量
和 batch：

```bash
pnpm lesson:20
```

示例完全离线，重点区分 `rank`、`shape`、元素数量和 Embedding dimension，并
说明图片像素直接 flatten 与模型生成语义向量不是同一件事。

## 21 ChromaDB 实现图搜图

本课复用第 19 课建立的图片 Collection。应用先下载查询图，使用同一个豆包
多模态模型生成查询向量，再把预计算向量交给 Chroma：

```bash
pnpm lesson:21
pnpm lesson:21 -- "https://example.com/query.jpg"
```

默认查询图就是索引中的第一张教学图片，因此第一名通常是它自己，distance
接近 `0`。本课只生成一条查询向量，不会重复向量化并写入三张教学图片。

## 22 观察图片处理后实际存储到向量数据库中的大小

本课使用 `get(include: ["embeddings", ...])` 读取第 19 课已经写入的图片记录，
观察向量维度、Float32 载荷下界、JSON 表示大小和其余可见字段：

```bash
pnpm lesson:22
```

课程只读取 Chroma，不下载原图、不调用豆包，也不写入 Collection。输出中的
逻辑载荷不是 Cloud 账单或真实磁盘占用，因为 SPANN/HNSW 索引、WAL、数据库页、
冗余和压缩无法从单条记录响应中精确推导。
