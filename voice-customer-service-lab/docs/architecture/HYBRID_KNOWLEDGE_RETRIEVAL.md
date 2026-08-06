# Hybrid Knowledge Retrieval

## 目标与边界

本层只返回候选 Chunk，不判断证据是否足以回答，也不调用 LLM。在线链路为：

```text
server-bound tenant + user query
-> deterministic query plan
-> registry-approved source scope
-> dense + lexical retrieval
-> reciprocal-rank fusion
-> candidates (not evidence)
```

Rerank、上下文拼装、冲突识别、引用和拒答属于下一层。

## 查询理解

`KnowledgeQueryPlanner` 做有限、可测试的处理：Unicode/空白规范化、中文分词、领域信号识别
和受控同义词扩展。例如“东西坏了”扩展为“质量、故障、售后”。它不使用 LLM，不生成
Tenant、权限、订单事实或生命周期条件，也不会删除否定词后假装理解了完整语义。

查询路由与查询规划是两个问题：Router 决定公开知识、业务工具或转人工；Planner 只改善已经
获准进入知识检索的 Query。

## 强制检索范围

Tenant 来自服务端 Session。`KnowledgeSourceRegistry.listRetrievable(tenant, now)` 产生当前
公开、已发布且生效的 Source Allowlist。Dense 和 Lexical 两个分支必须复用同一个 Scope：

```text
tenant_id      = session tenant
classification = public
source_id      IN registry-approved IDs
index_version  = configured version
pipeline_version = configured version
```

Filter 由 Adapter 内部构造，浏览器只能提交问题，不能提交或覆盖 `where`。未知 Tenant 没有
Allowlist 时在调用 Embedding 前直接返回空候选。Chroma 的 `where` 支持 Metadata Filter 以及
`$and` / `$in` 组合，见
[Metadata Filtering](https://docs.trychroma.com/docs/querying-collections/metadata-filtering)。

课程 Allowlist 很小；大规模系统可按 Tenant 分区或物化 `retrievable=true`，但撤回操作与查询
Filter 必须共享一致的控制面，不能只依赖“旧向量应该已经删掉”。

## Dense、Lexical 与融合

Dense 分支用与 Collection 相同的 Embedding 模型生成 Query Vector，并传
`queryEmbeddings`；Collection 没有关联默认 Embedding Function 时，这是必需的，而且维度必须
一致。Chroma Query API 的语义见
[Query and Get](https://docs.trychroma.com/docs/querying-collections/query-and-get)。

Lexical 分支补回金额、产品名、政策术语等精确词。课程 Chroma Adapter 使用
`whereDocument` 的 `$contains`，然后在候选中做简单词项计分；Chroma 文档检索区分大小写，
能力边界见 [Full Text Search](https://docs.trychroma.com/docs/querying-collections/full-text-search)。
语料增长后，应把 Lexical Port 替换为具备中文分词与 BM25 的专用搜索引擎。

Dense 相似度与关键词分数没有共同量纲，不能直接相加。本项目使用 RRF，只使用各分支名次：

```text
fused_score = Σ branch_weight / (60 + rank)
```

精确词分支略微加权。最终分数只用于候选排序，不是答案置信度。

## 安全与运维约束

- Query 最长 500 字符，词项、候选数和最终 Limit 都有上限。
- 同一个 AbortSignal 贯穿 Embedding 和两个检索分支。
- 日志记录信号、分支候选数、名次和耗时；默认不记录原始 Query 与 Chunk 正文。
- 离线 `CommerceFixtureEmbeddingProvider` 只是语义模拟器，不可用于真实质量评估。
- “搜到”不等于“证据充分”；尤其否定词、冲突来源和近义规则必须进入下一层判断。
