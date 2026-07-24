# 12 LangChain 实战案例

本章通过 `langchain-commerce-rag-lab`，逐步构建一个多模态商品检索与
RAG 导购助手。完整规格见
[SPEC.md](../langchain-commerce-rag-lab/SPEC.md)。

## 学习进度

- [x] 01 跑通豆包 Embedding 模型 API
- [x] 02 利用豆包进行 Store 向量化模糊搜索
- [x] 03 ChromaDB 向量数据库
- [x] 04 向量数据库的“训练”过程
- [x] 05 向量数据库的存储和查询过程
- [x] 06 ChromaDB 最简案例
- [x] 07 向量数据库中的距离表示
- [x] 08 “笔记本屏幕不错”和“笔记本”相关吗
- [x] 09 如何提升向量数据库的检索精度
- [ ] 10 改成 cosine 方式优化文本检索精度
- [x] 11 ChromaDB 中的查询操作符
- [x] 12 ChromaDB 查询、删除操作
- [x] 13 长文本切片存储与向量查询
- [x] 14 为什么用 ChromaDB 查询原文也可能查不到
- [ ] 15～18 中文检索、RAG 与 ID 设计
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

---

## 05 向量数据库的存储和查询过程

### 1. 本课目标

第 04 课只准备了待入库数据，本课真正完成：

```text
商品文档 -> 商品向量 -> Chroma upsert -> SPANN 索引
用户问题 -> 查询向量 -> Chroma query -> Top K
```

### 2. 存储过程

每条 Chroma Record 由同一位置的四列组成：

```text
ids[0]        = product:laptop-air-14:profile
embeddings[0] = 2048 维商品向量
documents[0]  = Aurora Air 14 的 pageContent
metadatas[0]  = sku、category、brand、price...
```

数组下标必须对齐，否则 ID、向量和商品内容会错配。

[index-products-in-chroma.ts](../langchain-commerce-rag-lab/src/indexing/index-products-in-chroma.ts)
执行：

```ts
const vectors = await embeddings.embedDocuments(pageContents);
const batch = prepareProductIndexBatch(documents, vectors);
await collection.upsert(batch.records);
```

这里使用 `upsert` 而不是 `add`：

```text
ID 不存在 -> 插入
ID 已存在 -> 更新
```

商品 ID 稳定，所以两次运行的记录数是：

```text
第一次：0 -> 3
第二次：3 -> 3
```

这说明重复索引没有生成副本。

### 3. 查询过程

Collection 没有内置 Embedding Function，因此必须先在应用层生成查询向量：

```ts
const queryVector = await embeddings.embedQuery(query);
const result = await collection.query({
  queryEmbeddings: [queryVector],
  nResults: 3,
  include: ["documents", "metadatas", "distances"]
});
```

流程如下：

```text
查询文本
  -> 豆包生成 2048 维查询向量
  -> SPANN 找到候选商品向量
  -> cosine distance 从小到大排序
  -> 返回 ID、document、metadata、distance
```

Chroma 支持一次提交多个查询向量，因此原始结果是二维数组。本项目使用
`result.rows()[0]` 取出第一个查询的结果，再转换成统一的 `SearchHit`。

查询代码见
[search-chroma-products.ts](../langchain-commerce-rag-lab/src/retrieval/search-chroma-products.ts)。

### 4. distance 与 relevance

当前 Collection 使用 cosine：

```text
distance 越小 -> 越相似
relevance = 1 - distance
relevance 越大 -> 越相似
```

`relevance` 是本项目为了方便阅读计算的字段，不是 Chroma 原始返回字段。

### 5. 运行与真实结果

```bash
cd langchain-commerce-rag-lab
pnpm lesson:05
pnpm lesson:05 -- "适合剪视频和三维设计的电脑"
```

默认查询：

```text
屏幕不错并且方便出差携带的笔记本
```

结果：

```text
Collection 记录数: 0 -> 3
1. Aurora Air 14       distance: 0.462823
2. Aurora Studio 16    distance: 0.492785
3. A5 方格笔记本        distance: 0.677971
```

创作型查询：

```text
适合剪视频和三维设计的电脑
```

结果：

```text
Collection 记录数: 3 -> 3
1. Aurora Studio 16    distance: 0.418444
2. Aurora Air 14       distance: 0.639108
3. A5 方格笔记本        distance: 0.787632
```

两个查询的第一名都符合预期，纸质笔记本均排在最后。

### 6. 本课验收

- [x] 三个商品及其 2048 维向量写入 Chroma Cloud。
- [x] 重复 `upsert` 后记录数保持为 3。
- [x] 查询传入豆包生成的预计算向量。
- [x] 返回稳定 ID、document、metadata 和 distance。
- [x] 两组查询的第一名符合预期。
- [x] 类型检查与 25 个测试通过。

### 7. 检查理解

1. 为什么 `ids`、`embeddings`、`documents`、`metadatas` 必须等长？
2. 为什么重复运行使用 `upsert` 不会增加记录数？
3. 为什么不能把用户的原始文本直接传给当前 Collection 查询？

答案：

1. 相同下标共同组成一条 Record。
2. 相同稳定 ID 会更新原记录。
3. Collection 设置了 `embeddingFunction: null`，应用必须提供查询向量。

### 8. 下一课

第 06 课会用最少量代码单独观察 Chroma 的 `upsert` 和 `query` API，去掉业务
封装后理解最简案例。

## 05 官方参考

- [Chroma TypeScript Collection](https://docs.trychroma.com/reference/typescript/collection)
- [Chroma Upsert](https://docs.trychroma.com/reference/chroma-api/record/upsert-records)
- [Chroma Query](https://docs.trychroma.com/reference/chroma-api/record/query-collection)

---

## 06 ChromaDB 最简案例

### 1. 为什么还需要最简案例

第 05 课包含商品加载、豆包 Embedding、数据校验和结果转换。本课去掉这些业务
代码，只保留 Chroma 的三个核心 API：

```text
getOrCreateCollection -> upsert -> query
```

代码集中在
[06-chroma-minimal.ts](../langchain-commerce-rag-lab/src/examples/06-chroma-minimal.ts)。

### 2. 独立的二维 Collection

本课使用：

```text
course_lesson06_minimal_v1
```

其中只有三个手写二维向量：

| ID | 文档 | 向量 |
| --- | --- | --- |
| `east` | 正东方向 | `[1, 0]` |
| `northeast` | 东北方向 | `[1, 1]` |
| `north` | 正北方向 | `[0, 1]` |

它不能写入 `commerce_products_text_v1`，因为商品向量是 2048 维。一个 Collection
中的向量必须属于同一维度和同一向量空间。

### 3. 最小代码流程

创建或获取 Collection：

```ts
const collection = await client.getOrCreateCollection({
  name: "course_lesson06_minimal_v1",
  embeddingFunction: null,
  configuration: { spann: { space: "cosine" } }
});
```

写入预计算向量：

```ts
await collection.upsert({
  ids: ["east", "northeast", "north"],
  embeddings: [[1, 0], [1, 1], [0, 1]],
  documents: ["正东方向", "东北方向", "正北方向"]
});
```

用“正东”向量查询：

```ts
const result = await collection.query({
  queryEmbeddings: [[1, 0]],
  nResults: 3,
  include: ["documents", "distances"]
});
```

没有 Embedding Function 时，写入和查询都必须提供向量。

### 4. 如何理解查询结果

查询向量 `[1, 0]` 指向正东：

```text
正东      方向完全相同
东北      方向有一定夹角
正北      方向垂直
```

因此 cosine distance 从小到大应为：

```text
正东 < 东北 < 正北
```

本课先观察排序，第 07 课再计算 distance。

### 5. 运行与真实输出

```bash
cd langchain-commerce-rag-lab
pnpm lesson:06
```

第一次运行：

```text
记录数: 0 -> 3
1. 正东方向  distance=0.000000
2. 东北方向  distance=0.292893
3. 正北方向  distance=1.000000
```

第二次运行：

```text
记录数: 3 -> 3
```

这个案例不调用豆包，因此没有 Embedding token 用量。沙盒 Collection 会保留在
Chroma Cloud 中，方便在控制台查看。

### 6. 本课验收

- [x] 使用原生 Chroma TypeScript API。
- [x] 三个二维向量写入独立 Collection。
- [x] 查询返回顺序符合二维方向关系。
- [x] 重复运行记录数保持为 3。
- [x] 商品 Collection 未被修改。
- [x] 类型检查与 25 个测试通过。

### 7. 检查理解

1. 为什么二维向量不能写入商品 Collection？
2. 为什么本课不需要豆包 API？
3. 为什么 `[1, 0]` 查询首先返回 `[1, 0]`？

答案：

1. 商品 Collection 已使用 2048 维向量，维度和向量空间不兼容。
2. 本课直接提供了手写的预计算向量。
3. 两个向量方向完全相同，cosine distance 为 0。

### 8. 下一课

第 07 课将解释向量数据库中的距离表示，并手算本课三个结果为什么分别约为
`0`、`0.292893` 和 `1`。

## 06 官方参考

- [Chroma 添加预计算向量](https://docs.trychroma.com/docs/collections/add-data)
- [Chroma 查询 Collection](https://docs.trychroma.com/docs/querying-collections/query-and-get)
- [Chroma Collection 配置](https://docs.trychroma.com/docs/collections/configure)

---

## 07 向量数据库中的距离表示

### 1. 本课目标

Chroma 支持三种常见向量距离：

```text
l2      -> 坐标位置相差多少
cosine  -> 方向夹角相差多少
ip      -> 方向和向量长度的综合作用
```

Chroma 返回的是 distance，三种模式都是数值越小越相似。

### 2. 三种公式

设两个向量为 `A` 和 `B`。

Squared L2：

```text
distance = Σ(Aᵢ - Bᵢ)²
```

它关注坐标的绝对差异。Chroma 的 `l2` 没有再开平方。

Cosine：

```text
cosine similarity = (A · B) / (|A| × |B|)
cosine distance   = 1 - cosine similarity
```

它主要关注方向，忽略整体长度。零向量没有方向，不能计算 cosine。

Inner Product：

```text
dot product = Σ(Aᵢ × Bᵢ)
ip distance = 1 - dot product
```

它同时受方向和长度影响，distance 可以是负数。

实现见
[distances.ts](../langchain-commerce-rag-lab/src/vector-math/distances.ts)。

### 3. 手算东北方向

查询向量是正东：

```text
A = [1, 0]
B = [1, 1]  // 东北
```

Squared L2：

```text
(1 - 1)² + (0 - 1)² = 1
```

Cosine：

```text
A · B = 1
|A| = 1
|B| = √2
similarity = 1 / √2 = 0.707107
distance = 1 - 0.707107 = 0.292893
```

Inner Product：

```text
distance = 1 - (A · B) = 1 - 1 = 0
```

同一对向量得到三个不同数值，所以 distance 必须结合 metric 解释。

### 4. 为什么 cosine 忽略长度

比较：

```text
[1, 0]
[2, 0]
```

二者方向相同：

```text
cosine distance = 0
squared L2      = 1
ip distance     = -1
```

这也是文本 Embedding 常用 cosine 的直观原因：通常更关心语义方向，而不是向量
整体有多长。

### 5. 运行与真实对照

先确保第 06 课已运行，再执行：

```bash
cd langchain-commerce-rag-lab
pnpm lesson:07
```

真实结果：

```text
ID         squared-l2  cosine     inner-prod  Chroma
east       0.000000    0.000000   0.000000    0.000000
northeast  1.000000    0.292893   0.000000    0.292893
north      2.000000    1.000000   1.000000    1.000000
```

沙盒 Collection 配置为 cosine，因此 Chroma 列与手算 cosine 列完全一致。

入口见
[07-vector-distances.ts](../langchain-commerce-rag-lab/src/examples/07-vector-distances.ts)。

### 6. 不要把 distance 当概率

下面的理解是错误的：

```text
distance = 0.3，所以有 70% 相关
```

`1 - distance` 在 cosine 模式下可以还原 cosine similarity，但 similarity 也
不是业务正确率或概率。阈值必须结合 Embedding 模型、distance metric 和评估
数据选择，不能照搬其他项目的数值。

### 7. 本课验收

- [x] 实现 squared L2、cosine 和 inner product distance。
- [x] 校验空向量、维度不一致、非有限数值和 cosine 零向量。
- [x] 本地手算 cosine 与 Chroma Cloud 返回值一致。
- [x] 没有写入 Cloud，也没有调用豆包。
- [x] 类型检查与 28 个测试通过。

### 8. 检查理解

1. 为什么 Chroma 的 cosine similarity 越大越好，但 distance 越小越好？
2. 为什么 `[1, 0]` 和 `[2, 0]` 的 cosine distance 为 0？
3. `distance = 0.2` 能否解释为“80% 相关”？

答案：

1. Chroma 返回 `1 - cosine similarity`。
2. 两个向量长度不同，但方向完全相同。
3. 不能；distance 和 similarity 都不是业务概率。

### 9. 下一课

第 08 课会分析“笔记本屏幕不错”和“笔记本毫不相关”这类反直觉结果，理解
Embedding 语义、文本内容和困难负样本如何共同影响检索。

## 07 官方参考

- [Chroma Collection 距离配置](https://docs.trychroma.com/docs/collections/configure)
- [Chroma Ranking 与 distance](https://docs.trychroma.com/cloud/search-api/ranking)
- [Chroma Index Configuration](https://docs.trychroma.com/cloud/schema/index-reference)

---

## 08 为什么“笔记本屏幕不错”和“笔记本”毫不相关？

### 1. 先修正问题

使用当前豆包模型实测：

```text
“笔记本” ↔ “笔记本屏幕不错”
cosine distance ≈ 0.334
```

所以不能说它们“毫不相关”。但它们也不会因为共享“笔记本”三个字就得到接近
0 的 distance。

原因是 Embedding 表示整段文本的上下文，不是关键词计数：

```text
“笔记本”             -> 电脑或纸质本，含义不完整
“笔记本屏幕不错”      -> 屏幕把语义推向笔记本电脑
```

增加上下文会移动向量的位置，这是正常现象。

### 2. 本课诊断方法

本课一次向量化五个查询，再用一次 Chroma 批量查询进行对照：

```text
笔记本
笔记本屏幕不错
这台笔记本屏幕很好
这台笔记本屏幕很差
A5纸质笔记本适合手写记录
```

[query-diagnostics.ts](../langchain-commerce-rag-lab/src/evaluation/query-diagnostics.ts)
返回：

```text
Top 1 distance
Top 2 distance
Top gap = Top 2 distance - Top 1 distance
```

`Top gap` 越小，说明前两名越难区分。它只是诊断信号，不是置信概率。

### 3. 真实商品检索

本次结果：

| 查询 | Top 1 | Top 1 distance | Top 2 | Top gap |
| --- | --- | ---: | --- | ---: |
| 笔记本 | Studio 16 | 0.532084 | Air 14 | 0.021598 |
| 笔记本屏幕不错 | Air 14 | 约 0.556 | Studio 16 | 约 0.009 |
| 这台笔记本屏幕很好 | Studio 16 | 0.550685 | Air 14 | 0.000719 |
| 这台笔记本屏幕很差 | Studio 16 | 0.598410 | Air 14 | 0.015171 |
| A5纸质笔记本适合手写记录 | 纸质笔记本 | 约 0.392 | Air 14 | 约 0.24 |

可以得到三个结论：

1. 单独的“笔记本”有歧义，两款电脑的差距很小。
2. “屏幕不错”能指向电脑，但没有足够信息区分两款电脑。
3. 明确加入“A5、纸质、手写”后，纸质笔记本以较大间隔排在第一。

### 4. Embedding 不等于逻辑判断

当前模型实测：

```text
“这台笔记本屏幕很好”
“这台笔记本屏幕很差”
cosine distance ≈ 0.146
```

两个句子立场相反，却共享相同对象和主题，因此向量仍然很接近。

这说明 Embedding 适合做候选召回，但不能独自承担：

- 判断好评还是差评。
- 判断事实是否矛盾。
- 判断一句话是否蕴含另一句话。

这些任务需要 metadata、规则、分类模型、reranker 或 LLM 进一步判断。

### 5. 不要用单个 distance 判死刑

下面的判断没有依据：

```text
distance > 0.3，所以毫不相关
```

Distance 会受到这些因素影响：

```text
Embedding 模型
文本长度与内容
距离策略
数据分布
查询任务
```

更可靠的做法是：

```text
固定评估查询
  -> 观察正确结果是否进入 Top K
  -> 比较正例和困难负样本的排名
  -> 再选择阈值或优化策略
```

### 6. 运行

```bash
cd langchain-commerce-rag-lab
pnpm lesson:08
```

入口见
[08-notebook-relevance.ts](../langchain-commerce-rag-lab/src/examples/08-notebook-relevance.ts)。

一次运行使用 5 个短文本 Embedding，本次观察用量为 `116 tokens`。示例只查询
已有商品，不写入 Chroma。

### 7. 本课验收

- [x] 使用当前模型实测，而不是照搬旧课程 distance。
- [x] 对比歧义、上下文、否定表达和纸质笔记本。
- [x] 一次 Chroma 请求完成五组查询。
- [x] 输出 Top 1、Top 2 和 Top gap。
- [x] Chroma 写入数为 0。
- [x] 类型检查与 30 个测试通过。

### 8. 检查理解

1. 为什么共享“笔记本”不代表 distance 一定接近 0？
2. 为什么“屏幕很好”和“屏幕很差”的向量仍然接近？
3. Top gap 很小意味着什么？

答案：

1. Embedding 编码整段上下文，不是计算关键词重合率。
2. 两句话的对象和主题高度一致，否定或评价方向只是部分语义。
3. 前两名难以区分，第一名的领先优势很弱。

### 9. 下一课

第 09 课开始系统提升检索精度：建立固定评估集，分别调整查询表达、商品内容
模板和检索策略，并用 Recall@K、MRR 和困难负样本结果验证。

## 08 官方参考

- [Chroma Query](https://docs.trychroma.com/docs/querying-collections/query-and-get)
- [Chroma Ranking 与 distance](https://docs.trychroma.com/cloud/search-api/ranking)
- [Chroma Collection 距离配置](https://docs.trychroma.com/docs/collections/configure)

---

## 09 如何提升向量数据库的检索精度

### 1. 先建立可重复的评估

优化检索不能只试一句查询，再凭感觉判断。先固定：

```text
用户查询 + 期望命中的 SKU
```

本课把 8 条查询写入
[evaluation-queries.json](../langchain-commerce-rag-lab/data/evaluation-queries.json)，
其中包含：

- 商品用途：“轻度图片处理”“移动办公”。
- 明确规格：“3.2K 120Hz”。
- 困难负样本：电脑“笔记本”与纸质“笔记本”。
- 暂未解决的查询：“在线会议”和精确价格。

以后改变内容模板、模型或检索策略时，都应复用这组查询，才能判断改动是提升还是
退步。

### 2. 三个简单指标

假设一共有 `N` 条评估查询：

```text
Recall@1 = 正确商品排第 1 的查询数 / N
Recall@K = 正确商品进入前 K 名的查询数 / N
MRR      = 每条查询的 1 / 正确商品首次出现名次，再求平均
```

例如两条查询的正确商品分别排第 1、第 2：

```text
Recall@1 = 1 / 2 = 0.5
Recall@2 = 2 / 2 = 1.0
MRR      = (1 + 1/2) / 2 = 0.75
```

Recall@K 只关心是否进入前 K，MRR 还会奖励更靠前的排名。指标实现在
[retrieval-metrics.ts](../langchain-commerce-rag-lab/src/evaluation/retrieval-metrics.ts)。

### 3. A/B：向量化什么内容

本课只改变商品文档内容，模型、查询和 cosine 排序都保持一致：

```text
A：只索引商品名

B：商品名
   + 类别与品牌
   + 描述
   + 适用场景
   + 关键规格
```

所有 A 文档、B 文档和查询在同一次 API 调用中生成向量。两个版本共用相同的
查询向量，避免把模型调用差异误认为模板效果。

### 4. 真实评估结果

运行：

```bash
cd langchain-commerce-rag-lab
pnpm lesson:09
```

本次豆包 Embedding 结果：

| 内容模板 | Recall@1 | Recall@3 | MRR |
| --- | ---: | ---: | ---: |
| 只索引商品名 | 0.250 | 1.000 | 0.563 |
| 丰富商品内容 | 0.750 | 1.000 | 0.875 |

丰富内容修复了四类查询：

```text
方便出差携带
轻度图片处理
移动办公
3.2K 120Hz
```

结论不是“文本越长越好”，而是查询中出现的用途、属性和规格也应出现在被索引
内容中。无关字段和重复文字反而可能制造噪声。

这里的 Recall@3 没有区分度，因为当前一共只有 3 个商品。数据增多后，应继续
观察 Recall@3、Recall@5 等更有意义的候选召回指标。

### 5. 丰富内容也不能解决一切

本次仍有两条查询没有排到 Top 1：

```text
“用于在线会议的设备”
“售价6999元的笔记本电脑”
```

它们需要不同策略：

| 问题 | 更合适的后续方案 |
| --- | --- |
| 商品内容没有覆盖“在线会议”的表达 | 补充真实业务描述、查询改写或 reranker |
| 精确价格、库存、品牌等结构化条件 | 使用 metadata filter，再做向量排序 |

Embedding 擅长语义相似，但不适合可靠地执行 `price = 6999` 这样的精确判断。
因此价格仍只保存在 metadata 中，没有为了通过测试而塞进向量文本。

### 6. 为什么本课不访问 Chroma

这次实验只比较内容模板，所以将生成的文档向量保存在内存中并手算 cosine
排名。这样可以隔离变量，也不会污染 Cloud Collection。

```text
本次用量：591 tokens
Chroma 读写：0
```

入口见
[09-improve-retrieval-accuracy.ts](../langchain-commerce-rag-lab/src/examples/09-improve-retrieval-accuracy.ts)，
指标测试见
[retrieval-metrics.test.ts](../langchain-commerce-rag-lab/tests/retrieval-metrics.test.ts)。

### 7. 一个可重复的优化循环

```text
收集失败查询
  -> 写入固定评估集
  -> 判断是语义问题还是结构化条件
  -> 每次只修改一个变量
  -> 比较 Recall@K 与 MRR
  -> 检查是否产生回归
```

不要先调一个看似漂亮的 distance 阈值。阈值、TopK 和内容模板都应由真实查询
上的评估结果决定。

### 8. 本课验收

- [x] 将评估集扩充为 8 条固定查询。
- [x] 实现 Recall@1、Recall@K 和 MRR。
- [x] 公平比较两种商品内容模板。
- [x] Recall@1 从 0.250 提升到 0.750。
- [x] 识别语义优化与 metadata filter 的职责边界。
- [x] Chroma 读写数为 0。
- [x] 类型检查与 33 个测试通过。

### 9. 检查理解

1. 为什么不能只用一条查询判断优化是否有效？
2. Recall@3 都是 1.0，是否说明两个模板一样好？
3. 为什么“售价 6999 元”更适合 metadata filter？

答案：

1. 单个例子可能偶然变好，同时让其他查询退步；固定评估集可以发现回归。
2. 不是；当前只有 3 个商品，进入前三没有区分度，Recall@1 和 MRR 已显示差异。
3. 价格是精确结构化条件，而向量相似度只能近似表达语义关系。

### 10. 下一课

第 10 课会在同一评估集上比较距离策略，理解为什么改变 cosine、L2 或 inner
product 也可能改变排名，以及为什么距离策略必须和索引配置保持一致。

## 09 官方参考

- [LangSmith Evaluation](https://docs.langchain.com/langsmith/evaluation)
- [LangSmith Evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts)
- [LangSmith RAG evaluation tutorial](https://docs.langchain.com/langsmith/evaluate-rag-tutorial)

---

## 11 ChromaDB 中的查询操作符

### 1. `where` 与 `whereDocument`

Chroma 有两类常用过滤条件：

| 参数 | 检查对象 | 例子 |
| --- | --- | --- |
| `where` | metadata | 价格、品牌、类别、库存 |
| `whereDocument` | document 正文 | 是否包含“移动办公” |

```ts
// metadata 精确匹配
where: { category: "laptop" }

// document 正文包含指定文字
whereDocument: { $contains: "移动办公" }
```

`whereDocument` 是全文包含或正则过滤，不是向量语义搜索。全文匹配区分大小写。

### 2. metadata 操作符

| 操作符 | 含义 | 示例 |
| --- | --- | --- |
| `$eq` | 等于 | `{ price: { $eq: 6999 } }` |
| `$ne` | 不等于 | `{ category: { $ne: "stationery" } }` |
| `$gt` / `$gte` | 大于 / 大于等于 | `{ price: { $gte: 6000 } }` |
| `$lt` / `$lte` | 小于 / 小于等于 | `{ price: { $lte: 8000 } }` |
| `$in` | 在给定列表中 | `{ brand: { $in: ["Northstar"] } }` |
| `$nin` | 不在给定列表中 | `{ brand: { $nin: ["Paperwork"] } }` |
| `$and` | 所有条件都成立 | 价格区间并且有库存 |
| `$or` | 任一条件成立 | 低于 100 或高于 9000 |

直接写 `{ category: "laptop" }` 是 `$eq` 的简写。

一个过滤对象只放一个字段或一个逻辑操作符。价格区间不能把 `$gte` 和 `$lte`
并排塞进同一个字段，应使用 `$and`：

```ts
where: {
  $and: [
    { price: { $gte: 6000 } },
    { price: { $lte: 8000 } },
    { inStock: true }
  ]
}
```

### 3. 过滤与向量查询可以组合

第 09 课中，这条查询没有得到正确的 Top 1：

```text
售价 6999 元的笔记本电脑
```

原因是 Embedding 不擅长精确数字比较。正确流程是：

```text
where: price = 6999
  -> 得到满足价格条件的候选集
  -> 在候选集中按向量 distance 排名
```

对应代码：

```ts
await searchChromaProducts(
  collection,
  embeddings,
  "售价 6999 元的笔记本电脑",
  3,
  { where: { price: { $eq: 6999 } } }
);
```

### 4. 真实 Cloud 结果

运行：

```bash
cd langchain-commerce-rag-lab
pnpm lesson:11
```

结果：

```text
category = laptop:
  laptop-air-14, laptop-studio-16

6000 <= price <= 8000 且有货:
  laptop-air-14

price < 100 或 price > 9000:
  laptop-studio-16, notebook-paper-a5

document contains 移动办公:
  laptop-air-14

向量查询 + price = 6999:
  laptop-air-14, distance=0.587460
```

Distance 并没有因为精确价格而变小；过滤器只是排除了不满足条件的记录。这再次
说明 distance 代表向量关系，不代表价格条件的正确率。

入口见
[11-chroma-query-operators.ts](../langchain-commerce-rag-lab/src/examples/11-chroma-query-operators.ts)。
本次使用 `30 tokens`，Chroma 写入数为 0。

### 5. 本课验收

- [x] 使用 metadata 等值、范围和列表过滤。
- [x] 使用 `$and` 与 `$or` 组合条件。
- [x] 使用 `whereDocument` 过滤正文。
- [x] 组合向量检索与精确价格过滤。
- [x] 修复第 09 课的 `6999 元`查询。
- [x] 没有修改 Cloud 中的商品记录。

### 6. 检查理解

1. `whereDocument: { $contains: "移动办公" }` 是语义搜索吗？
2. 为什么精确价格应该放在 metadata 中？
3. `where` 和向量查询组合时各自负责什么？

答案：

1. 不是，它检查正文是否包含指定文字。
2. 价格需要精确比较，而 Embedding 只提供近似语义关系。
3. `where` 筛选合法候选，向量 distance 再对候选进行语义排序。

## 11 官方参考

- [Chroma Metadata Filtering](https://docs.trychroma.com/docs/querying-collections/metadata-filtering)
- [Chroma Full Text Search](https://docs.trychroma.com/docs/querying-collections/full-text-search)
- [Chroma Query and Get](https://docs.trychroma.com/docs/querying-collections/query-and-get)

---

## 12 ChromaDB 查询、删除操作

### 1. `get` 和 `query` 不是一回事

| 方法 | 是否需要查询向量 | 是否返回 distance | 适用场景 |
| --- | --- | --- | --- |
| `get` | 否 | 否 | 按 ID、metadata、正文精确取记录 |
| `query` | 是 | 是 | 按向量相似度排序 |

```ts
// 精确获取，不计算相似度
await collection.get({
  ids: ["lesson12:product:air"]
});

// 向量查询，返回按 distance 排序的结果
await collection.query({
  queryEmbeddings: [[1, 0]],
  nResults: 2
});
```

`get` 还可以使用 `limit`、`offset` 做分页；`query` 可以和第 11 课的过滤器组合。

### 2. 删除记录与删除 Collection

```ts
// 按稳定 ID 删除记录
await collection.delete({ ids: ["record-id"] });

// 按 metadata 删除匹配的记录
await collection.delete({
  where: { status: "temporary" }
});

// 删除整个 Collection：影响范围完全不同
await client.deleteCollection({ name: "collection-name" });
```

本课只删除一条教学记录，不执行 `deleteCollection`。记录删除会同时移除对应的
向量、document 和 metadata，而且不可撤销。

### 3. 安全删除流程

不能把未经检查的用户条件直接交给 `delete`。本课实现：

```text
准备稳定 ID 与明确的 where
  -> 用相同 where 执行 get
  -> 实际命中 ID 必须与预期完全一致
  -> 执行 delete
  -> 再按 ID 查询，确认已经不存在
```

如果预览多命中或少命中任何记录，程序都会停止，不发送删除请求。实现见
[delete-records-safely.ts](../langchain-commerce-rag-lab/src/maintenance/delete-records-safely.ts)。

### 4. 为什么使用独立沙盒

第 12 课使用：

```text
course_lesson12_crud_v1
```

其中只有三个二维教学向量，不会操作 `commerce_products_text_v1`。删除目标还
必须同时满足：

```text
lesson = 12
status = temporary
```

实验结束前会用稳定 ID 恢复临时记录，使课程命令可以重复运行。

### 5. 真实 Cloud 结果

运行：

```bash
cd langchain-commerce-rag-lab
pnpm lesson:12
```

首次结果：

```text
初始化记录数: 0 -> 3
get(ids): lesson12:product:air

query([1, 0]):
1. lesson12:product:air     distance=0.000000
2. lesson12:product:studio  distance=0.029858

服务端报告删除数: 1
删除后记录数: 2
恢复后记录数: 3
恢复验证: true
```

本课使用预先定义的二维向量，因此豆包调用和 token 消耗均为 0。入口见
[12-chroma-query-delete.ts](../langchain-commerce-rag-lab/src/examples/12-chroma-query-delete.ts)。

### 6. 本课验收

- [x] 区分 `get` 与 `query`。
- [x] 按稳定 ID 获取记录。
- [x] 向量查询返回 distance 排名。
- [x] 删除前预览，并校验精确 ID 集合。
- [x] 真实删除一条沙盒记录并验证。
- [x] 恢复教学记录，最终记录数仍为 3。
- [x] 商品 Collection 未被修改。
- [x] 完整类型检查与 38 个测试通过。

### 7. 检查理解

1. 已知 record ID 时，为什么优先使用 `get` 而不是 `query`？
2. 为什么删除前不仅要看数量，还要比较具体 ID？
3. `delete` 与 `deleteCollection` 的影响范围有什么区别？

答案：

1. `get` 是精确读取，不需要生成向量，也不会产生无意义的 distance。
2. 数量相同也可能命中了错误记录；只有 ID 集合一致才能确认目标。
3. `delete` 删除匹配记录；`deleteCollection` 删除整个 Collection 及其中全部数据。

### 8. 下一课

第 13 课开始处理长文本：把商品说明书切成可追溯的 chunk，生成向量后写入独立
Collection，再观察切片大小和 overlap 如何影响召回。

## 12 官方参考

- [Chroma Delete Data](https://docs.trychroma.com/docs/collections/delete-data?lang=typescript)
- [Chroma TypeScript Collection API](https://docs.trychroma.com/reference/typescript/collection)
- [Chroma Query and Get](https://docs.trychroma.com/docs/querying-collections/query-and-get)

---

## 13 长文本切片存储与向量查询

### 1. 为什么要切片

如果把整份说明书只生成一个向量：

```text
安装 + 屏幕 + 性能模式 + 存储 + 散热 + 故障处理
                         -> 一个向量
```

用户只问“剪视频用什么模式”时，具体答案可能被大量无关内容稀释。切片后可以让
每个片段独立参与召回：

```text
说明书
  -> chunk 1：启动与创作模式
  -> chunk 2：屏幕与存储
  -> chunk 3：散热与故障
```

### 2. 本课切片策略

本课把两份教学说明书扩充为带 Markdown 标题的长文本，使用：

```ts
new MarkdownTextSplitter({
  chunkSize: 600,
  chunkOverlap: 100,
  keepSeparator: true
});
```

- `chunkSize`：chunk 的最大字符数，不是 token 数。
- `chunkOverlap`：希望相邻 chunk 重复保留的字符数。
- `keepSeparator`：保留 Markdown 标题，使 chunk 自带章节语境。

切片器优先保留标题和段落，只有内容仍然过长时才继续向更小的分隔符递归。

`chunkOverlap=100` 是目标值，不保证每两个 chunk 都恰好重复 100 字。本次段落
边界较完整，重复整个段落又会超过目标，因此实际结果没有强行复制一段文字。这
比为了凑 overlap 而切碎语义完整的段落更合理。

### 3. 每个 chunk 必须可追溯

本次生成的 ID：

```text
manual:laptop-air-14:chunk:0001
manual:laptop-air-14:chunk:0002
manual:laptop-studio-16:chunk:0001
manual:laptop-studio-16:chunk:0002
manual:laptop-studio-16:chunk:0003
```

每条 metadata 包含：

```text
recordType
sku
source
chunkIndex
startIndex
embeddingModel
contentVersion
```

例如 `startIndex=532` 表示该 chunk 从源文件第 532 个字符开始。代码可以利用
`source + startIndex` 回到原始说明书，而不是只保存一段失去出处的文本。

实现见
[manual-chunks.ts](../langchain-commerce-rag-lab/src/indexing/manual-chunks.ts)。

### 4. 切片、存储与查询链路

```text
products.json
  -> 找到 manualPath
  -> 读取 Markdown
  -> 切成 LangChain Document[]
  -> 批量生成 2048 维向量
  -> 用稳定 ID upsert 到 Chroma
  -> 生成问题向量
  -> SKU filter
  -> cosine Top K
```

说明书存入独立的：

```text
commerce_manual_chunks_v1
```

商品简介和说明书 chunk 粒度不同，因此不混入
`commerce_products_text_v1`。Collection 继续使用 SPANN/cosine，并接收豆包
生成的预计算向量。

### 5. 为什么查询时先过滤 SKU

本课问题已经明确包含 `Aurora Studio 16`：

```text
Aurora Studio 16 剪视频时应该选择哪个性能模式？
```

因此查询使用：

```ts
where: {
  $and: [
    { recordType: "manual-chunk" },
    { sku: "laptop-studio-16" }
  ]
}
```

先确定商品，再搜索该商品说明书，可以避免其他商品中相似的“性能、模式、视频”
文字干扰。实际系统中，SKU 可以来自用户选择、URL、上一步商品检索或实体解析。

### 6. 真实 Cloud 结果

运行：

```bash
cd langchain-commerce-rag-lab
pnpm lesson:13
```

索引结果：

```text
索引: spann/cosine
说明书数量: 2
chunk 数量: 5
chunk 长度: 428, 594, 530, 468, 202
向量维度: 2048
Collection 记录数: 0 -> 5
```

查询 Top 3：

| 排名 | Chunk | Distance | 关键内容 |
| ---: | --- | ---: | --- |
| 1 | `manual:laptop-studio-16:chunk:0001` | 0.350250 | 视频剪辑和三维渲染建议使用创作模式 |
| 2 | `manual:laptop-studio-16:chunk:0002` | 0.601221 | 3.2K 屏幕、外接显示器和项目存储 |
| 3 | `manual:laptop-studio-16:chunk:0003` | 0.745098 | 散热、清洁和故障处理 |

正确答案所在 chunk 排在第一，并且结果同时返回：

```text
source=data/manuals/laptop-studio-16.md
chunkIndex=1
startIndex=0
```

本次 5 个文档 chunk 加 1 个查询共使用 `1455 tokens`。

入口见
[13-long-text-chunk-storage-query.ts](../langchain-commerce-rag-lab/src/examples/13-long-text-chunk-storage-query.ts)，
索引实现见
[index-manual-chunks-in-chroma.ts](../langchain-commerce-rag-lab/src/indexing/index-manual-chunks-in-chroma.ts)。

### 7. 稳定 ID 与重复运行

Chunk ID 由 `SKU + 1-based chunkIndex` 生成，不使用随机 UUID。重复运行使用
`upsert` 更新相同 ID，因此不会不断增加重复记录。

如果以后更换 Embedding 模型、向量维度或不兼容的切片策略，应升级 Collection
或 `contentVersion` 并完整重建，不能把不同向量空间混在一起。

### 8. 本课验收

- [x] 两份 Markdown 说明书被切成 5 个 chunk。
- [x] 所有 chunk 长度不超过 600 个字符。
- [x] ID、SKU、source、chunkIndex 和 startIndex 可追溯。
- [x] 5 个 2048 维向量写入独立 Chroma Collection。
- [x] 使用稳定 ID 与 `upsert`，重复索引不增长。
- [x] 查询使用 SKU metadata filter。
- [x] “剪视频用什么模式”正确召回创作模式片段。
- [x] 类型检查与 48 个测试通过。

### 9. 检查理解

1. 为什么说明书不直接和商品简介放进同一个 Collection？
2. `chunkOverlap=100` 是否保证每两个 chunk 一定重复 100 字？
3. 为什么 chunk 需要保存 `source` 和 `startIndex`？

答案：

1. 两类文档粒度和检索目的不同，混合后容易让结果相互竞争。
2. 不保证；它是切片器在尊重分隔符和大小限制时尽量达到的目标。
3. 为了从检索结果定位回原文，支持引用、调试和数据更新。

### 10. 下一课

第 14 课会分析“用 ChromaDB 查询原文为什么也可能查不到”，区分精确文本匹配、
Embedding 相似度、TopK 和 chunk 边界。

## 13 官方参考

- [LangChain Recursive text splitter](https://docs.langchain.com/oss/javascript/integrations/splitters/recursive_text_splitter)
- [LangChain Semantic search tutorial](https://docs.langchain.com/oss/javascript/langchain/knowledge-base)
- [Chroma Update and Upsert Data](https://docs.trychroma.com/docs/collections/update-data)

---

## 14 为什么我用 ChromaDB 查询原文都查不到？

### 1. 先问清楚“查询”是哪一种

Chroma 中常见的三个动作并不等价：

| 目标 | 方法 | 是否计算向量 |
| --- | --- | --- |
| 已知 ID，取出记录 | `get({ ids })` | 否 |
| 判断 document 是否包含短字符串 | `get({ whereDocument })` | 否 |
| 查找语义最接近的记录 | `query({ queryEmbeddings })` | 是 |

`query` 是向量近邻搜索，不是 SQL 的字符串等值查询。因此“原文查不到”之前，
必须先确认自己想做精确查找还是语义查找。

### 2. 完整原文没有被存进任何一条记录

第 13 课存储的是：

```text
完整 Studio 说明书
  -> chunk:0001
  -> chunk:0002
  -> chunk:0003
```

Chroma 中没有一条 document 等于整份说明书。真实检查：

```text
get(id=manual:laptop-studio-16:chunk:0001): 找到
完整说明书被某个 chunk 包含: 0
```

完整源文件应通过 metadata 中的
`source=data/manuals/laptop-studio-16.md` 回到文件系统读取，不能假设一个
chunk 保存了全文。

当前 Chroma Cloud 还限制 `whereDocument` 值的长度，整份说明书超过了本环境的
130 配额。示例捕获该错误后，改为读取该 SKU 的 chunks 并逐条精确检查，不输出
错误中的租户信息。

### 3. 原文句子存在，但 distance 不会是 0

测试句子：

```text
视频剪辑和三维渲染时建议使用创作模式。
```

精确包含结果：

```text
manual:laptop-studio-16:chunk:0001
```

语义查询也把它排在第一，但真实 distance 是：

```text
0.439688
```

原因是比较的两边并不相同：

```text
查询向量 = 一句话的向量
存储向量 = 530 字完整 chunk 的向量
```

一句话虽然原样出现在 chunk 中，但两段文本的整体向量不会完全相同。

### 4. 什么时候 distance 才接近 0

本课重新读取 `chunk:0001` 的完整 document，用相同豆包模型再次生成向量后查询：

```text
1. chunk:0001  distance=-0.000003
2. chunk:0002  distance= 0.425225
3. chunk:0003  distance= 0.463225
```

`-0.000003` 是浮点计算和近似索引带来的微小误差，可以视为 0。它说明只有在
查询内容与已存 chunk 完全相同、模型也相同时，distance 才应该非常接近 0。

不要编写下面这种脆弱判断：

```ts
distance === 0
```

需要比较数值时应允许很小的误差，但业务相关性仍然要通过评估集判断。

### 5. 原文可能跨越 chunk 边界

本课从 `chunk:0001` 末尾和 `chunk:0002` 开头各取一小段，组成真正存在于源文件
中的连续原文：

```text
chunk:0001 末尾 + Markdown 间隔 + chunk:0002 开头
```

因为没有任何单个 Chroma record 保存整段跨界文字：

```text
whereDocument 精确命中数: 0
```

它的语义查询排名是：

```text
1. chunk:0002  distance=0.472101
2. chunk:0003  distance=0.515923
3. chunk:0001  distance=0.545940
```

边界两侧的相关内容分别位于第 1 和第 3。如果只设置 `TopK=1`，就拿不到完整
上下文。后续可以评估：

- 增加合适的 overlap。
- 提高 TopK。
- 命中后按 `chunkIndex` 扩展相邻 chunk。
- 使用 reranker 再排序。

### 6. 为什么直接 `queryTexts` 报错

本项目创建 Collection 时明确设置：

```ts
embeddingFunction: null
```

因此下面的调用会失败：

```ts
collection.query({
  queryTexts: ["视频剪辑时使用什么模式？"]
});
```

真实错误的核心是：

```text
No embedding function found for collection
```

这是有意设计，不是去安装一个默认模型就能正确解决。入库向量由豆包生成，查询
也必须使用同一豆包模型：

```text
query text
  -> 豆包 Embedding
  -> queryEmbeddings
  -> Chroma cosine query
```

如果换成 Chroma 默认模型，查询向量和存储向量不在同一空间，即使维度碰巧相同
也没有比较意义。

### 7. 推荐排错顺序

```text
1. collection.count()：Collection 中是否有数据
2. get(ids)：目标 record 是否存在
3. 检查 document：入库的是全文还是 chunk
4. 检查 source/startIndex：原句是否跨边界
5. 检查 embeddingModel 和维度是否一致
6. 使用 queryEmbeddings，而不是误用 queryTexts
7. 增大 TopK，观察目标的真实排名
```

### 8. 运行与真实用量

```bash
cd langchain-commerce-rag-lab
pnpm lesson:14
```

示例批量向量化：

```text
完整已存 chunk
chunk 内原文句子
跨 chunk 原文
```

本次使用 `402 tokens`，Chroma 写入数为 0。入口见
[14-why-original-text-not-found.ts](../langchain-commerce-rag-lab/src/examples/14-why-original-text-not-found.ts)，
诊断逻辑见
[manual-original-text-diagnostics.ts](../langchain-commerce-rag-lab/src/evaluation/manual-original-text-diagnostics.ts)。

### 9. 本课验收

- [x] 使用 `get(ids)` 证明目标记录存在。
- [x] 使用 `whereDocument` 找到 chunk 内原句。
- [x] 证明完整说明书没有存入单个 chunk。
- [x] 复现跨 chunk 原文精确命中为 0。
- [x] 复现预计算向量 Collection 的 `queryTexts` 错误。
- [x] 使用同一豆包模型的 `queryEmbeddings` 完成三组查询。
- [x] 对 Embedding 模型不一致进行提前拦截。
- [x] 类型检查与 51 个测试通过。

### 10. 检查理解

1. 原句出现在 chunk 中，为什么 cosine distance 仍可能是 0.4？
2. 为什么整份源文件不适合直接作为 `whereDocument` 条件？
3. 跨边界原文精确命中为 0，能否说明原文没有入库？

答案：

1. 查询是一句话，存储向量对应整个 chunk，两段文本并不完全相同。
2. 数据库只保存 chunks，而且 Cloud 对过滤值长度有配额；应通过 source 读取全文。
3. 不能；原文可能分别位于相邻 chunks 中，需要检查切片边界。

### 11. 下一课

第 15 课会继续解决中文检索不精准问题，对比默认分隔符与加入中文标点后的切片
效果，并使用固定查询验证召回变化。

## 14 官方参考

- [Chroma Query and Get](https://docs.trychroma.com/docs/querying-collections/query-and-get)
- [Chroma Full Text Search](https://docs.trychroma.com/docs/querying-collections/full-text-search?lang=typescript)
- [LangChain Semantic search tutorial](https://docs.langchain.com/oss/javascript/langchain/knowledge-base)
