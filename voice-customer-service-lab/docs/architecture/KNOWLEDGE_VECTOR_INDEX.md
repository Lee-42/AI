# Knowledge Vector Index

## 目标

把确定性 Chunk 转成可重复构建的向量索引，同时保证：

- 测试默认不调用付费 Embedding，也不访问 Chroma Cloud。
- 同一 Collection 不混入不同模型、维度、距离空间或 Pipeline 版本。
- 重跑时只向量化新增或变化的 Chunk。
- 失败时保留上一版可用向量，生命周期删除仍由治理流程负责。

## Collection 契约

`voice_knowledge_dense_v1` 的契约包含：

```text
record_schema_version = 1
index_version         = voice-knowledge-dense@1
pipeline_version      = knowledge-ingestion@1
embedding_model       = <configured endpoint/model>
embedding_dimension   = <configured dimension>
distance_space        = cosine
index_engine          = spann (Cloud) / hnsw (self-hosted or offline)
```

代码把这些值写入 Collection Metadata，并在每次写入前验证。`getOrCreate` 不是迁移工具：
已存在但契约不一致时必须失败，并创建一个新版本 Collection。切换读流量、评测通过后再退役旧版。

应用自己生成 Embedding，Chroma 使用 `embeddingFunction: null`，避免 SDK 静默选择默认模型。
官方 TypeScript Client、Collection 配置和 `upsert` 示例分别见
[Client reference](https://docs.trychroma.com/reference/typescript/client)、
[Configure Collections](https://docs.trychroma.com/docs/collections/configure?lang=typescript) 与
[Getting Started](https://docs.trychroma.com/docs/overview/getting-started?lang=typescript)。

## 增量算法

每次只同步一个 `(tenant_id, source_id)`：

```text
desired stable IDs
-> 读取这些 ID 的现有 Metadata
-> chunk_sha256 + pipeline_fingerprint + model + index_version 相同：跳过
-> 变化项分批 Embedding 和 Upsert
-> 所有 Upsert 成功后，删除该 Source 不再需要的旧 ID
```

稳定 `chunk_id` 让 Upsert 和重试幂等。先 Upsert、后删除很重要：某个 Embedding Batch 失败时，
上一个版本仍可检索；已成功写入的稳定 ID 下次重跑也不会制造副本。整份 Source 撤回或 Purge
不通过空 Chunk 调用表达，而由 Knowledge Source 生命周期事件触发显式删除。

## Adapter 与安全开关

`TextEmbeddingProvider` 和 `KnowledgeVectorCollection` 是应用 Port：测试使用确定性 Hash 向量和
内存 Collection，真实实现才调用 Ark 与 Chroma。Hash 向量不具备语义，只用于验证数据流。

云写入必须同时满足：

```text
KNOWLEDGE_INDEX_PROVIDER=chroma
KNOWLEDGE_INDEX_WRITE_ENABLED=true
CHROMA_API_KEY / CHROMA_TENANT / CHROMA_DATABASE 已配置
```

真实 Embedding 还需要第二把独立费用锁：

```text
EMBEDDING_PROVIDER=volcengine
EMBEDDING_PAID_CALLS_ENABLED=true
EMBEDDING_MODEL=<Endpoint ID>
EMBEDDING_DIMENSION=<该 Endpoint 的输出维度>
VOLCENGINE_ARK_API_KEY=<server secret>
```

配置摘要只输出是否配置，不输出 API Key。Cloud 命令不会由测试或服务启动自动触发。

## 运维边界

- 批量大小有上限，避免突发费用和大请求；生产可在限流与吞吐测试后调整。
- 同一个 Tenant + Source 同一时刻只允许一个同步任务；多实例部署应使用任务分区或分布式锁。
- Collection 名称带大版本，Metadata 保存完整契约，部署记录保存构建摘要。
- 指标只记录 discovered/skipped/embedded/upserted/deleted、耗时和错误码，不记录正文。
- 当前只构建 Dense 索引；Metadata Filter、混合召回、Rerank 和在线读切换属于后续课程。
