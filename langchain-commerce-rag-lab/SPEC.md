# 多模态商品检索与 RAG 导购助手规格

| 项目 | 内容 |
| --- | --- |
| 项目名 | `langchain-commerce-rag-lab` |
| 规格版本 | `0.1.0` |
| 状态 | 初始化基线 |
| 技术栈 | TypeScript、LangChain、Chroma、火山方舟 |
| 交互方式 | CLI 优先，HTTP 与前端暂不实现 |

## 1. 背景

本项目是“LangChain 实战案例”章节的贯穿案例。课程不再使用互不相关的小程序，而是逐步构建同一个多模态商品检索与 RAG 导购助手。

系统最终需要支持：

```text
商品文本语义检索
商品说明书检索
基于检索上下文的商品问答
商品 metadata 过滤和数据维护
文搜图
图搜图
离线检索质量评估
```

示例领域采用电子产品商城，并特意加入“笔记本电脑”和“纸质笔记本”等困难负样本，用于观察中文语义检索中的错误召回。

## 2. 项目目标

### 2.1 教学目标

1. 观察文本和图片被转换为向量的实际过程。
2. 理解 Chroma 中 collection、record、distance、metadata 和 filter。
3. 掌握长文档切片、稳定 ID、幂等索引和删除更新。
4. 使用固定评估集比较距离策略、切片策略和召回参数。
5. 构建可追溯的 2-Step RAG，而不是只展示一次成功调用。
6. 使用同一多模态模型完成文搜图和图搜图。

### 2.2 产品目标

用户能够：

- 用自然语言描述需求并检索相关商品。
- 按品牌、类别、价格和库存过滤商品。
- 针对商品说明书提问，并看到答案来源。
- 用文字搜索视觉相符的商品图片。
- 上传或提供图片 URL，搜索相似商品图片。

### 2.3 成功标准

- 所有入库操作可重复执行，不产生重复记录。
- 检索结果始终包含 record ID、distance 和来源 metadata。
- RAG 回答只能基于召回内容，并返回 SKU 或说明书 chunk ID。
- 文搜图和图搜图使用同一个多模态向量空间。
- 固定评估集可以输出 `Recall@K` 和 MRR，便于比较优化前后结果。
- 每个课程示例都复用核心模块，不复制 Embedding 或 Chroma 客户端实现。

## 3. 非目标

初始化及本章不实现：

- 完整商城、购物车、订单和支付。
- 自动调用工具的 Agent。
- Web 前端、登录与用户权限系统。
- 大规模分布式索引和生产级高可用部署。
- Embedding 模型训练或微调。
- 使用 LLM 主观评价代替确定性的检索指标。

本项目中的“训练”只用于解释 Embedding 模型如何形成向量空间；Chroma 负责存储、索引和查询，不训练 Embedding 模型。

## 4. 核心用户场景

### UC-01 商品语义检索

输入：

```text
屏幕不错并且方便出差携带的笔记本
```

预期：轻薄笔记本排在纸质笔记本之前，并返回距离、SKU 和商品 metadata。

### UC-02 用途检索

输入：

```text
适合剪辑视频和做三维设计的电脑
```

预期：高性能创作本进入 TopK。

### UC-03 说明书问答

输入：

```text
Aurora Studio 16 剪视频时应该选择哪个性能模式？
```

预期：检索对应说明书片段，回答“创作模式”，并标注 chunk ID。

### UC-04 文搜图

输入：

```text
银色、轻薄、窄边框的办公笔记本
```

预期：将查询文本交给多模态 Embedding 模型，并检索商品图片 collection。

### UC-05 图搜图

输入：商品图片 URL。

预期：用同一个多模态模型生成查询向量，返回视觉相似商品。

## 5. 功能需求

| ID | 需求 | 验收条件 |
| --- | --- | --- |
| FR-01 | 加载商品数据 | `products.json` 必须通过 `ProductSchema` 校验 |
| FR-02 | 文本向量化 | 支持批量文档和单条查询，返回有限数值向量 |
| FR-03 | 商品文本索引 | 重复执行索引命令后 record 数量不增长 |
| FR-04 | 文本语义检索 | 返回 TopK、distance、SKU、类别和来源 |
| FR-05 | metadata 过滤 | 支持类别、品牌、库存和价格范围 |
| FR-06 | 数据维护 | 支持按稳定 ID 查询、更新和删除 |
| FR-07 | 说明书切片 | 每个 chunk 可定位到 SKU、源文件和序号 |
| FR-08 | RAG 问答 | 回答包含引用，不得使用未召回的商品事实 |
| FR-09 | 图片向量化 | 图片 URL 能转换为多模态向量并写入 Chroma |
| FR-10 | 文搜图 | 文本查询与图片向量在同一模型空间比较 |
| FR-11 | 图搜图 | 图片查询返回相似图片 URI 和 SKU |
| FR-12 | 检索评估 | 能从固定数据集计算 Recall@K 和 MRR |

## 6. 总体架构

```text
                         ┌──────────────────────┐
商品 JSON ──────────────>│ product indexing     │
                         └──────────┬───────────┘
                                    │ text embedding
说明书 Markdown ──> splitter ───────┤
                                    ▼
                       products_text / manual_chunks
                                    │
用户问题 ──> text embedding ──> retrieval ──> context ──> chat model
                                                               │
                                                               ▼
                                                        带引用的回答

商品图片 URL ──> multimodal embedding ──> product_images
                                                ▲
文本或图片查询 ──> multimodal embedding ─────────┘
```

## 7. 模块边界

```text
src/config.ts
  解析环境变量，不创建网络客户端

src/domain/
  定义商品、检索结果和评估数据的领域结构

src/embeddings/
  调用模型并只返回 number[]；不读写 Chroma

src/vectorstores/
  封装 collection 和 CRUD；不调用 Chat Model

src/indexing/
  加载、校验、切片、生成 ID、调用 Embedding 并 upsert

src/retrieval/
  负责 query embedding、filter、TopK 和结果标准化

src/rag/
  组合检索内容、控制上下文预算、调用 Chat Model

src/evaluation/
  执行固定查询集并计算确定性指标

src/examples/
  每节课的薄入口，只编排上述模块
```

规则：`examples` 不得直接实现 HTTP 鉴权、Embedding 响应解析或 Chroma 客户端初始化。

## 8. 目标目录结构

```text
langchain-commerce-rag-lab/
├── data/
│   ├── products.json
│   ├── manuals/
│   ├── images.json
│   └── evaluation-queries.json
├── src/
│   ├── config.ts
│   ├── domain/
│   ├── embeddings/
│   ├── vectorstores/
│   ├── indexing/
│   ├── retrieval/
│   ├── rag/
│   ├── evaluation/
│   └── examples/
└── tests/
```

目录会在课程推进到对应能力时创建，不使用大量空目录占位。

## 9. 数据模型

### 9.1 Product

```ts
type Product = {
  sku: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  inStock: boolean;
  description: string;
  useCases: string[];
  specifications: Record<string, string | number | boolean>;
  imageUrl: string | null;
  manualPath: string | null;
};
```

### 9.2 Chroma metadata

Chroma metadata 保持扁平，只使用 string、number 和 boolean：

```ts
type ProductMetadata = {
  recordType: "product";
  sku: string;
  category: string;
  brand: string;
  price: number;
  inStock: boolean;
  embeddingModel: string;
  contentVersion: number;
};
```

复杂规格保留在原始商品 JSON 或编码进 `pageContent`，不直接作为嵌套 metadata 写入 Chroma。

### 9.3 标准检索结果

```ts
type SearchHit = {
  id: string;
  content: string;
  distance: number;
  relevanceScore?: number;
  metadata: Record<string, string | number | boolean>;
  uri?: string;
};
```

底层 Chroma 与 LangChain 返回值都必须在 retrieval 层转换成该结构。

## 10. Collection 设计

| Collection | 内容 | Embedding |
| --- | --- | --- |
| `commerce_products_text_v1` | 商品标题、卖点、规格和用途 | 豆包文本模型 |
| `commerce_manual_chunks_v1` | 说明书切片 | 豆包文本模型 |
| `commerce_product_images_v1` | 商品图片向量与 URI | 豆包多模态模型 |

初始距离策略统一使用 cosine，后续课程通过评估集与其他策略比较。

不同 collection 的 distance 不直接横向比较。需要融合多路结果时，应先分别归一化或 rerank。

## 11. ID 设计

```text
product:{sku}:profile
manual:{sku}:chunk:{chunkIndex四位补零}
image:{sku}:{imageRole}
```

示例：

```text
product:laptop-air-14:profile
manual:laptop-air-14:chunk:0001
image:laptop-air-14:front
```

要求：

- 相同源数据每次索引生成相同 ID。
- 索引使用 `upsert`，不得用随机 UUID 制造重复数据。
- 删除商品时能够通过 SKU 推导或 metadata filter 删除关联记录。
- chunk 策略发生不兼容变化时，提升 collection 或 content version 并重建索引。

## 12. Embedding 约束

### 12.1 文本 Embedding

`TextEmbeddingProvider` 提供：

```ts
embedDocuments(texts: string[]): Promise<number[][]>
embedQuery(text: string): Promise<number[]>
```

实现需要支持批处理、超时、有限重试和响应向量校验。

> 2026-07 兼容性说明：火山方舟控制台中的旧版
> `Doubao-embedding` 纯文本模型已进入下线流程。Phase 1 改用当前
> `Doubao-embedding-vision`，以纯文本 input 调用
> `/embeddings/multimodal`。该适配仍实现 `TextEmbeddingProvider`
> 契约，并只向上层返回 `number[]`；旧 `/embeddings` 协议保留为可选模式。

### 12.2 多模态 Embedding

`MultimodalEmbeddingProvider` 提供：

```ts
embedText(text: string): Promise<number[]>
embedImage(imageUrl: string): Promise<number[]>
```

图片入库、文搜图查询和图搜图查询必须使用同一个多模态模型版本。

### 12.3 向量空间不变量

同一个 collection 内必须保持：

```text
相同模型系列
相同模型版本
相同向量维度
相同归一化规则
相同距离策略
```

禁止使用文本专用模型生成查询向量，再搜索多模态模型生成的图片向量。

Embedding 模型或维度变化时创建新 collection，并完整重建索引，不在原 collection 中混写。

## 13. 索引流程

### 13.1 商品文本

```text
读取 products.json
-> ProductSchema 校验
-> 构造稳定 pageContent
-> 批量 text embedding
-> 使用稳定 ID upsert
```

商品 `pageContent` 的字段顺序固定，避免对象序列化顺序导致无意义的向量变化：

```text
商品名
类别与品牌
描述
适用场景
关键规格
```

### 13.2 说明书

初始切片参数：

```text
chunkSize: 600 characters
chunkOverlap: 100 characters
```

这些值是可评估的基线，不是永久最佳值。每个 chunk 记录：

```text
sku
source
chunkIndex
startIndex（可获得时）
embeddingModel
```

### 13.3 商品图片

```text
读取 image URL
-> 调用火山方舟图文向量化 API
-> 校验维度和有限数值
-> Chroma JS 使用 embeddings 参数 upsert
-> uri 保存原图地址
```

Chroma 不负责下载、理解或永久保存原始图片，原图由稳定 URL 或对象存储管理。

## 14. 检索流程

### 14.1 文本商品检索

```text
query
-> embedQuery
-> cosine TopK
-> metadata filter
-> SearchHit[]
```

默认 `k = 5`。是否使用 distance threshold 必须由评估集确定，不在没有数据时拍脑袋设置。

### 14.2 说明书检索

优先从用户问题或上游商品检索结果确定 SKU，再检索对应说明书，避免无关商品说明书污染上下文。

### 14.3 图片检索

```text
文搜图：text -> multimodal embedding -> product_images
图搜图：image -> multimodal embedding -> product_images
```

图片检索直接使用 `chromadb` TypeScript 客户端的预计算 `embeddings` 和 `queryEmbeddings`，不依赖 Chroma 内置 OpenCLIP。

## 15. RAG 设计

本章采用 2-Step RAG：

```text
retrieve -> build context -> generate
```

不让 LLM 自主决定是否检索，以便稳定观察检索质量、调用次数和上下文。

上下文格式：

```text
[source=product:laptop-air-14:profile]
...

[source=manual:laptop-air-14:chunk:0001]
...
```

Prompt 必须要求：

- 只根据提供的上下文回答。
- 信息不足时明确说明没有足够资料。
- 每个商品事实标注对应 source ID。
- 不将 distance 当作自然语言置信度直接展示给普通用户。

## 16. 检索评估

评估集记录：

```ts
type EvaluationQuery = {
  id: string;
  query: string;
  expectedSkus: string[];
  tags: string[];
};
```

第一阶段指标：

| 指标 | 含义 |
| --- | --- |
| Recall@K | 期望商品是否进入前 K 个结果 |
| MRR | 第一个正确结果排名的倒数均值 |
| Hard-negative pass rate | 困难负样本是否被排在正确商品之后 |

每次修改以下配置后都应重新评估：

```text
Embedding 模型
pageContent 模板
distance 策略
TopK
切片大小与 overlap
filter
query rewrite 或 rerank
```

## 17. CLI 规格

计划提供：

```text
pnpm index:products
pnpm index:manuals
pnpm index:images
pnpm search:text -- "查询内容"
pnpm search:image:text -- "图片描述"
pnpm search:image:url -- "https://..."
pnpm ask -- "商品问题"
pnpm evaluate
```

所有命令失败时必须返回非零退出码；日志不得输出 API Key 或完整 Authorization header。

## 18. 课程实施阶段

### Phase 0：项目初始化

范围：项目骨架、配置 Schema、领域 Schema、样例数据、基础测试和本规格。

完成标准：

```text
pnpm install 成功
pnpm check 通过
pnpm test 通过
pnpm dev 无 API Key 也能运行
```

### Phase 1：Embedding 与检索基线（01～08）

范围：跑通豆包文本 Embedding、LangChain Document/Retriever 契约、Chroma 最小用例、distance 观察和困难负样本。

完成标准：

- 能索引三个以上商品并进行文本查询。
- 原始 Embedding 维度和前几个数值可观察，但不打印完整向量。
- 查询输出包含 ID、distance 和 metadata。
- 能复现“笔记本”歧义召回问题。

### Phase 2：精度与数据维护（09～12）

范围：cosine、内容模板、metadata operators、查询、更新和删除。

完成标准：

- 困难负样本查询中电脑商品排在纸质笔记本之前。
- filter 和 CRUD 有自动化测试。
- 重复索引不会增加 record 数量。

### Phase 3：长文本与 RAG（13～18）

范围：说明书切片、中文检索优化、distance 解释、LLM 上下文和 ID 设计。

完成标准：

- 说明书 chunk 可通过 ID 追溯到源文件。
- RAG 能回答样例说明书问题并给出引用。
- 无相关资料时不会编造答案。
- 能比较至少两组切片参数的 Recall@K。

### Phase 4：多模态检索（19～22）

范围：文搜图、张量概念、图搜图和向量大小观察。

完成标准：

- 图片和文本查询使用同一多模态模型。
- Chroma 中只存向量、URI 和 metadata，不复制大图片二进制。
- 文搜图与图搜图均返回 SKU、URI 和 distance。
- 模型或维度不匹配时快速失败并给出清晰错误。

## 19. 测试策略

### 单元测试

- 环境变量和配置校验。
- Product、metadata 和评估查询 Schema。
- ID 生成函数。
- pageContent 构造顺序。
- distance 到可选 relevance score 的转换。
- RAG context 格式和预算裁剪。

### 集成测试

- Chroma collection 创建与清理。
- upsert、query、filter、update、delete。
- 固定向量下的距离排序。

### 外部 API 测试

- 默认不在普通 `pnpm test` 中运行。
- 使用显式命令和环境开关执行，避免意外计费。
- 只断言响应结构、维度和有限数值，不断言浮点向量完全相等。

## 20. 配置与安全

环境变量：

```text
CHROMA_MODE
CHROMA_URL
CHROMA_API_KEY
CHROMA_TENANT
CHROMA_DATABASE
CHROMA_HOST
ARK_API_KEY
ARK_BASE_URL
ARK_TEXT_EMBEDDING_MODEL
ARK_MULTIMODAL_EMBEDDING_MODEL
CHAT_API_KEY
CHAT_BASE_URL
CHAT_MODEL
```

要求：

- `.env` 永不提交。
- `.env.example` 不包含真实密钥。
- 初始化、类型检查和单元测试不要求 API Key。
- 只有真正调用某项能力时才校验对应凭据。
- 日志对远端错误进行摘要，不输出请求 Authorization。

## 21. 架构决策

### ADR-001 独立项目

本案例不放入 `langchain-system-lab`，避免概念课程与完整实战相互污染。

### ADR-002 CLI 优先

先验证检索与评估，再考虑 HTTP 和前端。UI 不参与本章验收。

### ADR-003 三个 collection

商品文本、说明书切片和商品图片分开，避免不同模型和粒度的数据混入同一向量空间。

### ADR-004 外部生成多模态向量

TypeScript 调用火山方舟图文向量化 API，Chroma 只接收预计算向量。项目不依赖 Chroma Python 内置 OpenCLIP。

### ADR-005 Chroma 统一使用官方 TypeScript 客户端

文本和图片 collection 都使用原生 `chromadb` 客户端，避免依赖已经 sunset 的 `@langchain/community`。retrieval 层负责将结果统一转换为 `SearchHit`，并在进入 LangChain 编排时转换为 `Document` 或 Runnable 输出。

### ADR-006 采用 2-Step RAG

本章不使用 Agentic RAG。确定性 retrieve-then-generate 更适合观察召回问题、成本和延迟。

### ADR-007 评估优先于阈值

不预设“distance 小于某值就一定相关”。阈值、TopK 和切片参数必须通过固定评估集选择。

### ADR-008 Chroma Cloud 作为主学习环境

Phase 1 使用 Chroma Cloud 和官方 `CloudClient`，避免本地容器依赖。项目保留
`CHROMA_MODE=local` 与 `CHROMA_URL` 作为本地兼容路径。课程 Collection 使用
独立、带版本的名称，不读取、修改或删除同一 Database 中的其他 Collection。

### ADR-009 区分模型训练、Embedding 推理与索引构建

本项目调用已经训练好的豆包模型生成向量，不更新模型权重。Chroma 接收预计算
向量并维护 SPANN 或 HNSW 检索索引；课程中口语化的“训练向量数据库”统一表述
为“生成向量并构建索引”。

### ADR-010 最简案例使用独立沙盒 Collection

第 06 课的二维教学向量写入 `course_lesson06_minimal_v1`，不与三个业务
Collection 混用。沙盒使用稳定 ID 和 `upsert`，可重复运行并保留在 Cloud
控制台中供观察。

### ADR-011 检索优化必须先通过固定评估集

内容模板、Embedding 模型、distance、TopK 或查询策略变更，必须复用相同查询
及期望 SKU，至少比较 Recall@1、Recall@K 和 MRR。精确价格等结构化条件不依赖
Embedding 猜测，留给 metadata filter。

### ADR-012 删除操作必须先预览并验证

按 metadata 删除记录前，先使用相同 `where` 读取目标，并要求实际 ID 集合与
预期完全一致；删除后再次按稳定 ID 验证。教学中的真实删除只允许发生在独立
沙盒 Collection，不删除商品 Collection 或整个 Collection。

### ADR-013 说明书切片必须可追溯

说明书使用 Markdown 递归字符切片，基线为 `chunkSize=600`、
`chunkOverlap=100`。每个 chunk 使用可重复生成的序号 ID，并保存 SKU、源文件、
起始字符位置、Embedding 模型和内容版本。商品与说明书使用不同 Collection，
避免文档粒度混合。

### ADR-014 精确读取与语义查询分开

已知 ID 时使用 `get`，精确短文本包含使用 `whereDocument`，语义检索使用
`queryEmbeddings`。预计算向量 Collection 不混用 Chroma 默认 Embedding；
查询必须复用入库模型。完整源文件由 source 定位，不假设任一 chunk 保存全文。

## 22. 待决定事项

以下内容在对应阶段开始前确认：

| 项目 | 最晚决定阶段 |
| --- | --- |
| 当前可用的豆包文本模型或 Endpoint ID | Phase 1 |
| Chroma 运行环境 | 已决定：Phase 1 使用 Chroma Cloud |
| Chat Model 供应商 | Phase 3 |
| 商品图片的稳定公网 URL 或对象存储 | Phase 4 |
| 多模态模型版本及向量维度 | Phase 4 |

## 23. 初始化完成定义

Phase 0 只有在以下条件全部满足时完成：

```text
[x] package.json、tsconfig 和 .env.example 已建立
[x] 配置可以在无密钥环境加载
[x] 样例商品同时包含正例和困难负样本
[x] ProductSchema 能校验全部样例数据
[x] Collection 名称唯一且带版本
[x] pnpm check 通过
[x] pnpm test 通过
[x] pnpm dev 输出项目状态且不连接外部服务
```

## 24. 官方参考

- [LangChain Retrieval](https://docs.langchain.com/oss/javascript/langchain/retrieval)
- [LangChain Vector Store integrations](https://docs.langchain.com/oss/javascript/integrations/vectorstores/index)
- [Chroma TypeScript Collection](https://docs.trychroma.com/reference/typescript/collection)
- [Chroma Query and Get](https://docs.trychroma.com/docs/querying-collections/query-and-get)
- [火山方舟图文向量化 API](https://api.volcengine.com/api-docs/view?action=EmbeddingsMultimodal&serviceCode=ark&version=2024-01-01)
- [LangChain.js — Sunsetting `@langchain/community`](https://github.com/langchain-ai/langchainjs-community/issues/61)
