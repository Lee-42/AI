# 12 LangChain 实战案例

本章通过 `langchain-commerce-rag-lab`，逐步构建一个多模态商品检索与
RAG 导购助手。完整规格见
[SPEC.md](../langchain-commerce-rag-lab/SPEC.md)。

## 学习进度

- [x] 01 跑通豆包 Embedding 模型 API
- [x] 02 利用豆包进行 Store 向量化模糊搜索
- [x] 03 ChromaDB 向量数据库
- [x] 04 向量数据库的“训练”过程
- [ ] 05～08 Chroma 与向量检索基线
- [ ] 09～12 检索精度与数据维护
- [ ] 13～18 长文本、RAG 与 ID 设计
- [ ] 19～22 多模态检索

---

## 01 跑通豆包 Embedding 模型 API

### 1. 本课目标

本课只跑通一条链路：

```text
中文文本 -> 豆包 Embedding API -> number[]
```

完成后应当能够：

1. 解释 Embedding 的输入和输出。
2. 区分 Model、Endpoint 和 API 路径。
3. 检查向量数量、维度和数值是否合法。
4. 理解为什么业务代码不应直接处理鉴权和远端响应。

本课暂不连接 Chroma，也不计算向量距离。

### 2. Embedding 是什么

Embedding 模型把文本映射到一个高维向量空间：

```text
"轻薄便携的办公笔记本电脑"
  -> [-0.008911, -0.033447, -0.002579, ...]
```

单个数字没有可以直接命名的业务含义。不能把第一维解释为“便携程度”，也不能
根据前几个数值判断两段文本是否相似。语义由完整向量在空间中的位置共同表达。

下一课会通过比较完整向量的距离，进行语义搜索。

### 3. 当前 API 与旧课程的差异

旧课程使用纯文本模型：

```text
POST /api/v3/embeddings
```

截至 2026 年 7 月，控制台中的旧版 `Doubao-embedding` 已进入下线流程。
本项目使用当前模型：

```text
Doubao-embedding-vision | 251215
```

它支持纯文本向量化，但必须调用：

```text
POST /api/v3/embeddings/multimodal
```

改变的是供应商的请求格式，Provider 对上层仍然只返回 `number[]`。

### 4. 环境配置

`.env` 配置如下：

```dotenv
ARK_API_KEY=你的方舟APIKey
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_TEXT_EMBEDDING_MODEL=ep-你的EmbeddingEndpoint
ARK_TEXT_EMBEDDING_API_MODE=multimodal
```

| 配置项 | 作用 |
| --- | --- |
| `ARK_API_KEY` | API 鉴权凭据 |
| `ARK_BASE_URL` | API 根地址 |
| `ARK_TEXT_EMBEDDING_MODEL` | 当前账号的推理接入点 ID |
| `ARK_TEXT_EMBEDDING_API_MODE` | 选择请求协议 |

`.env` 已被 Git 忽略。不要把 API Key 写进源码、测试或教学文档。

### 5. 请求与响应

纯文本也要使用多模态 input 结构：

```json
{
  "model": "ep-...",
  "input": [
    {
      "type": "text",
      "text": "轻薄便携的办公笔记本电脑"
    }
  ],
  "encoding_format": "float"
}
```

核心响应：

```json
{
  "model": "doubao-embedding-vision-251215",
  "data": {
    "embedding": [-0.008911, -0.033447, -0.002579]
  },
  "usage": {
    "total_tokens": 34
  }
}
```

请求中的 `ep-...` 是账号创建的 Endpoint；响应中的 `model` 是它实际调用的
基础模型。

### 6. 代码导读

#### 能力契约

[contracts.ts](../langchain-commerce-rag-lab/src/embeddings/contracts.ts)
定义了上层需要的能力：

```ts
interface TextEmbeddingProvider {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
```

- `embedDocuments`：向量化准备入库的文档。
- `embedQuery`：向量化用户的检索问题。

二者当前使用相同模型空间，但业务意图不同，也与后续 LangChain 接口保持一致。

#### 配置与 Provider

[config.ts](../langchain-commerce-rag-lab/src/config.ts)
只解析环境变量，不创建网络客户端。

[doubao-text-embeddings.ts](../langchain-commerce-rag-lab/src/embeddings/doubao-text-embeddings.ts)
负责：

- 校验输入和远端响应。
- 构造鉴权、URL 和请求体。
- 设置超时和有限重试。
- 控制多模态请求并发。
- 保证向量元素有限、维度一致。
- 最终只返回 `number[]`。

旧文本 API 支持单次提交多段文本；当前多模态 API 一次只提交一段文本，因此
这里使用小批量并发。

#### 示例入口

[01-doubao-embedding-api.ts](../langchain-commerce-rag-lab/src/examples/01-doubao-embedding-api.ts)
只负责：

```text
读取配置 -> 创建 Provider -> 准备文本 -> 生成向量 -> 展示摘要
```

示例使用两种“笔记本”：

```text
Aurora Air 14 是一款轻薄便携的办公笔记本电脑。
晨光 A5 是一本适合手写记录的纸质笔记本。
```

它们共享同一个词，但语义类别不同。后续会用它们观察中文检索的错误召回。

### 7. 运行结果

先执行不消耗 API 额度的离线验证：

```bash
cd langchain-commerce-rag-lab
pnpm verify
```

再显式调用真实 API：

```bash
pnpm lesson:01
```

本次真实结果：

```text
API 模式: multimodal
实际模型: doubao-embedding-vision-251215
输入数量: 2
向量数量: 2
向量维度: 2048
本次用量: 68 tokens
```

`68 tokens` 只是本次观察值，会随输入、模型和计费规则变化。

示例只展示每个向量的前 8 维。完整打印 2048 个数既不利于阅读，也不能帮助
人直接理解向量语义。

### 8. 成功标准

不能只检查 HTTP 200，还要满足：

```text
向量数量 === 输入文本数量
向量长度 > 0
所有元素都是有限 number
同一模型的向量维度一致
```

本次结果是 `2 段输入 -> 2 个 2048 维向量`，并通过了类型检查和自动化测试。

### 9. 常见错误

| 错误 | 原因与处理 |
| --- | --- |
| HTTP 400，模型不支持 API | Vision Endpoint 误用了旧 `/embeddings`，改用多模态路径 |
| HTTP 401/403 | 检查 API Key、账号权限和区域 |
| HTTP 404 | 使用控制台为当前账号生成的 `ep-...` |
| HTTP 429 | 降低并发，进行有限重试 |
| 向量维度变化 | 停止混写，新模型使用新的 Collection |

### 10. 检查理解

1. 为什么不能根据向量前 8 维判断两段文本是否相似？
2. 为什么 `embedDocuments` 和 `embedQuery` 要保留两个接口？
3. 为什么不同模型生成的向量不能混入同一个 Collection？

答案：

1. 语义由完整高维向量共同表达。
2. 二者业务意图不同，并对应后续 LangChain 的文档和查询流程。
3. 不同模型对应不同向量空间，距离不再具有可比性。

### 11. 本课验收

- [x] API Key 未进入源码和日志。
- [x] 当前 Endpoint 可以真实调用。
- [x] 两段中文文本得到两个 2048 维向量。
- [x] 只展示向量摘要。
- [x] 已实现超时、有限重试和响应校验。
- [x] 类型检查与自动化测试通过。

### 12. 下一课

第 02 课会把向量用于模糊搜索：

```text
商品文本 -> Embedding -> Store
用户问题 -> Embedding -> 相似度比较 -> Top K 商品
```

## 官方参考

- [火山方舟图文向量化 API](https://api.volcengine.com/api-docs/view?action=EmbeddingsMultimodal&serviceCode=ark&version=2024-01-01)
- [火山方舟文本向量化 API](https://api.volcengine.com/api-docs/view?action=Embeddings&serviceCode=ark&version=2024-01-01)

---

## 02 利用豆包进行 Store 向量化模糊搜索

### 1. 本课目标

第 01 课只得到向量，本课把向量用于语义搜索：

```text
商品 JSON
  -> LangChain Document
  -> 豆包 Embedding
  -> MemoryVectorStore
  -> cosine similarity
  -> Top K 商品
```

“模糊”不是字符串包含，而是文本整体语义接近。

### 2. Document 与 Store

LangChain `Document` 包含三类信息：

```ts
{
  id: "product:laptop-air-14:profile",
  pageContent: "用于生成向量和检索的商品文本",
  metadata: { sku, category, brand, price, inStock }
}
```

- `pageContent`：参与 Embedding，决定语义召回效果。
- `metadata`：不参与本课的向量计算，用于展示和后续过滤。
- `id`：稳定标识同一条商品记录。

商品文本按固定顺序构造：

```text
商品名
类别与品牌
描述
适用场景
关键规格
```

实现见
[product-documents.ts](../langchain-commerce-rag-lab/src/indexing/product-documents.ts)。

本课使用
[`MemoryVectorStore`](../langchain-commerce-rag-lab/src/vectorstores/product-memory-store.ts)。
它把向量保存在当前 Node.js 进程中，使用精确线性扫描，进程退出后数据消失。
它适合演示，不代替后续的 Chroma。

### 3. 搜索如何发生

入库时：

```text
3 个 pageContent
  -> embedDocuments
  -> 3 个 2048 维向量
  -> Store
```

查询时：

```text
用户问题
  -> embedQuery
  -> 1 个 2048 维向量
  -> 与 Store 中 3 个向量逐一比较
  -> 按相似度排序
```

`MemoryVectorStore` 默认返回 cosine similarity：

```text
similarity 越大，语义越相似
distance = 1 - similarity
distance 越小，语义越相似
```

本课同时输出二者，是为了避免后续切换 Chroma 时混淆“分数越大越好”和
“距离越小越好”。现在不设置阈值，阈值必须由评估数据决定。

结果转换为统一 `SearchHit` 的代码见
[search-memory-products.ts](../langchain-commerce-rag-lab/src/retrieval/search-memory-products.ts)。

### 4. 为什么要分层

示例入口
[02-doubao-memory-store-search.ts](../langchain-commerce-rag-lab/src/examples/02-doubao-memory-store-search.ts)
只编排下面四步：

```text
加载 Document -> 创建 Store -> 执行搜索 -> 打印结果
```

具体职责分别放在：

| 模块 | 职责 |
| --- | --- |
| `embeddings/` | 调用豆包并返回向量 |
| `indexing/` | 校验商品、构造 Document 和稳定 ID |
| `vectorstores/` | 创建 Store、写入文档 |
| `retrieval/` | 查询并标准化结果 |
| `examples/` | 组合流程，不实现底层细节 |

因此，后续把内存 Store 换成 Chroma 时，不需要复制 Embedding 客户端。

### 5. 运行

默认查询：

```bash
cd langchain-commerce-rag-lab
pnpm lesson:02
```

自定义查询：

```bash
pnpm lesson:02 -- "适合剪视频和做三维设计的电脑"
```

每次运行都会重新向量化 3 个商品和 1 个查询，因为内存 Store 不持久化。

### 6. 真实结果

查询：

```text
屏幕不错并且方便出差携带的笔记本
```

| 排名 | 商品 | Similarity | Distance |
| --- | --- | ---: | ---: |
| 1 | Aurora Air 14 | 0.536659 | 0.463341 |
| 2 | Aurora Studio 16 | 0.508449 | 0.491551 |
| 3 | A5 方格笔记本 | 0.321644 | 0.678356 |

轻薄本排在纸质笔记本之前，说明模型不只匹配了“笔记本”，还理解了“屏幕、
出差、携带”。表中数值是一次真实调用的观察值，再次运行时可能略有变化。

换成查询：

```text
适合剪视频和做三维设计的电脑
```

Studio 16 排到第一，说明查询意图改变后，排序也会改变。分数只能在同一模型、
同一距离策略下比较，不能直接解释为“正确概率”。

### 7. 本课验收

- [x] 三个商品通过 Schema 校验并转换为 `Document`。
- [x] 文档 ID 稳定，`pageContent` 字段顺序固定。
- [x] 商品向量与查询向量来自同一个模型空间。
- [x] 查询返回 ID、similarity、distance 和 metadata。
- [x] 两组真实查询的第一名符合预期。
- [x] 类型检查与 13 个测试通过。

### 8. 检查理解

1. 为什么 metadata 没有参与本课的向量相似度计算？
2. 为什么 similarity 越大越好，而 distance 越小越好？
3. 为什么每次运行都要重新生成商品向量？

答案：

1. 本课只对 `pageContent` 做 Embedding；metadata 留给过滤和结果展示。
2. 本课定义 `distance = 1 - cosine similarity`。
3. `MemoryVectorStore` 只存在于当前进程，没有持久化。

### 9. 下一课

第 03 课开始补充 ChromaDB。它会解决内存 Store 无法持久化、无法跨进程复用
向量的问题。

## 02 官方参考

- [LangChain MemoryVectorStore](https://docs.langchain.com/oss/javascript/integrations/vectorstores/memory)
- [LangChain Vector Store 接口](https://docs.langchain.com/oss/javascript/integrations/vectorstores/index)

---

## 03 ChromaDB 向量数据库

### 1. 本课目标

第 02 课的 `MemoryVectorStore` 随进程退出而消失。本课改用 Chroma Cloud，
先建立数据库连接和空 Collection：

```text
TypeScript CloudClient
  -> Chroma Database
  -> commerce_products_text_v1
  -> Record（本课暂不写入）
```

本课重点是理解 Database、Collection 和 Record 的层级，不做商品查询。

### 2. Database、Collection 与 Record

```text
Database
└── Collection: commerce_products_text_v1
    ├── Record: product:laptop-air-14:profile
    ├── Record: product:laptop-studio-16:profile
    └── Record: product:notebook-paper-a5:profile
```

- `Database`：一组 Collection 的逻辑容器。
- `Collection`：使用相同向量空间和距离策略的一组记录。
- `Record`：一条 ID、向量、文档和 metadata。

本课只创建 Collection，所以它的记录数仍是 0。

### 3. Cloud 配置

```dotenv
CHROMA_MODE=cloud
CHROMA_API_KEY=你的CloudKey
CHROMA_TENANT=你的Tenant
CHROMA_DATABASE=你的Database
```

如果 Connect 面板提供 `CHROMA_HOST`，也应原样配置。Cloud Key 只保存在
`.env`，不写进源码或日志。

[chroma-client.ts](../langchain-commerce-rag-lab/src/vectorstores/chroma-client.ts)
根据 `CHROMA_MODE` 创建客户端：

- `cloud`：使用 `CloudClient`。
- `local`：使用连接本地 HTTP 服务的 `ChromaClient`。

只有真正创建客户端时才要求 Cloud 凭据，普通单元测试不需要外部服务。

### 4. Collection 配置

商品文本 Collection：

```text
名称：commerce_products_text_v1
索引：SPANN（Cloud）
距离：cosine
Embedding：外部预计算
```

Cloud 使用 SPANN，本地单节点使用 HNSW。它们是不同的向量索引实现，但本项目
都固定使用 cosine 空间。

代码显式设置：

```ts
embeddingFunction: null
```

原因是向量由豆包生成，Chroma 只负责存储和检索，不能再调用自己的默认
Embedding 模型。

配置见
[product-text-collection.ts](../langchain-commerce-rag-lab/src/vectorstores/product-text-collection.ts)。

### 5. 为什么使用 getOrCreate

示例使用 `getOrCreateCollection`：

```text
不存在 -> 创建
已存在 -> 获取
```

真实运行结果：

```text
第一次：Collection 数量 1 -> 2
第二次：Collection 数量 2 -> 2
```

第二次没有创建重复 Collection，这就是本课的幂等性。

### 6. 运行

```bash
cd langchain-commerce-rag-lab
pnpm lesson:03
```

真实输出：

```text
连接模式: cloud
服务版本: 1.0.0
Heartbeat: ok
Collection: commerce_products_text_v1
索引类型: spann
距离策略: cosine
当前记录数: 0
Collection 数量: 2 -> 2
```

入口见
[03-chroma-collection.ts](../langchain-commerce-rag-lab/src/examples/03-chroma-collection.ts)。

### 7. 本课验收

- [x] Chroma Cloud heartbeat 成功。
- [x] Cloud Key、Tenant 和 Database 不进入日志。
- [x] 只操作独立命名的课程 Collection。
- [x] Collection 使用 cosine 和外部 Embedding。
- [x] 读取并校验 Cloud 实际返回的 SPANN 配置。
- [x] 重复运行不会创建重复 Collection。
- [x] Collection 当前记录数为 0。
- [x] 类型检查与 18 个测试通过。

### 8. 检查理解

1. 为什么图片向量不能直接写入商品文本 Collection？
2. 为什么必须设置 `embeddingFunction: null`？
3. `getOrCreate` 的幂等性是否等于“重复写入不计费”？

答案：

1. 不同模型或维度可能属于不同向量空间。
2. 本项目由豆包生成向量，避免 Chroma 再次向量化。
3. 不是；它只避免重复创建 Collection，后续重复 upsert 仍是写请求。

### 9. 下一课

第 04 课讨论“向量数据库的训练过程”：Embedding 模型负责形成向量空间，
Chroma 负责建立索引，不会训练 Embedding 模型。

## 03 官方参考

- [Chroma Cloud Client](https://docs.trychroma.com/docs/run-chroma/clients)
- [Chroma TypeScript Client](https://docs.trychroma.com/reference/js/client)

---

## 04 向量数据库的“训练”过程

### 1. 本课目标

“训练向量数据库”是容易引起误解的口语。本项目实际执行的是：

```text
已经训练好的豆包模型进行推理
  -> 生成商品向量
  -> 把向量写入 Chroma
  -> Chroma 建立或更新检索索引
```

豆包模型的参数没有在这个过程中被修改，Chroma 也不会训练豆包模型。

### 2. 三个过程不要混淆

| 过程 | 输入 | 结果 | 是否更新模型权重 |
| --- | --- | --- | --- |
| 模型训练 | 训练数据、损失函数 | 新的模型参数 | 是 |
| Embedding 推理 | 商品文本 | 2048 维向量 | 否 |
| Chroma 索引构建 | 向量、ID、metadata | SPANN/HNSW 索引 | 否 |

Embedding 模型决定语义如何映射到向量空间；Chroma 索引决定如何快速找到附近
向量。SPANN、HNSW 都是检索数据结构，不是机器学习模型。

### 3. 本课实验

本课执行到“准备待入库记录”为止：

```text
products.json
  -> 3 个 LangChain Document
  -> 豆包 Embedding API
  -> 3 个 2048 维向量
  -> 对齐 ID、document、metadata、embedding
  -> 不执行 Chroma upsert
```

[prepare-product-index-batch.ts](../langchain-commerce-rag-lab/src/indexing/prepare-product-index-batch.ts)
负责保证：

- 文档数与向量数相同。
- 每个文档都有稳定且唯一的 ID。
- 所有向量维度一致。
- 向量中不存在 `NaN` 或无限值。

完成这些检查后，得到下一课可以直接写入 Chroma 的列式数据：

```ts
{
  ids,
  embeddings,
  documents,
  metadatas
}
```

### 4. 为什么本课不写入

示例故意没有下面这行：

```ts
await collection.upsert(batch.records);
```

因此可以验证两件事：

```text
调用 Embedding API != 训练模型
准备索引数据 != 已经写入数据库
```

真正执行 `upsert` 后，Chroma 才会保存记录并维护向量索引。官方文档说明，传入
预计算 `embeddings` 时，Chroma 会按原样保存，不会再次对文档做 Embedding。

### 5. 运行与真实结果

```bash
cd langchain-commerce-rag-lab
pnpm lesson:04
```

本次真实输出：

```text
文档数量: 3
实际模型: doubao-embedding-vision-251215
API 请求数: 3
向量数量: 3
向量维度: 2048
本次用量: 307 tokens
模型权重更新: 否
Chroma upsert: 未执行
Collection 记录数: 0 -> 0
```

`307 tokens` 是本次运行的观察值，后续可能随文本和供应商计量方式变化。

入口见
[04-vector-index-training-process.ts](../langchain-commerce-rag-lab/src/examples/04-vector-index-training-process.ts)。

### 6. 本课验收

- [x] 真实调用豆包生成 3 个向量。
- [x] 向量数量、维度和有限数值通过校验。
- [x] 没有执行 Chroma `add` 或 `upsert`。
- [x] Collection 记录数保持 `0 -> 0`。
- [x] 类型检查与 22 个测试通过。

### 7. 检查理解

1. 调用 Embedding API 为什么不是训练？
2. Chroma 建立 SPANN 索引时，是否会改变豆包模型？
3. 为什么必须保证同一个 Collection 中的向量维度一致？

答案：

1. API 只使用固定模型参数完成前向推理，没有反向传播和参数更新。
2. 不会；Chroma 只组织已经生成的向量。
3. 只有同一维度、同一向量空间中的向量才能计算有意义的距离。

### 8. 下一课

第 05 课将真正执行：

```text
待入库记录 -> Chroma upsert -> 索引更新 -> 查询向量 -> 相似度检索
```

## 04 官方参考

- [Chroma 添加数据](https://docs.trychroma.com/docs/collections/add-data)
- [Chroma Embedding Functions](https://docs.trychroma.com/docs/embeddings/embedding-functions)
- [Chroma 索引配置](https://docs.trychroma.com/docs/collections/configure)
