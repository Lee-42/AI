# Rerank、上下文预算与引用边界

## 目标

混合召回只负责扩大候选覆盖面。本层把候选加工成允许 LLM 使用的证据：

```text
Hybrid candidates
-> CandidateReranker
-> relevance threshold
-> governed conflict gate
-> token budget
-> whole-chunk assembly
-> KnowledgeEvidence
```

`GroundedKnowledgeRetriever` 实现现有 `KnowledgeRetriever` Port。课程离线命令已经使用这条
生产形态流水线；真实 LLM Runtime 的依赖装配留到下一章。

## 可替换组件

### CandidateReranker

课程实现 `DeterministicCandidateReranker` 使用 RRF 先验、词项覆盖、标题命中和两路召回一致性
重排候选，并处理两个明确反例：

- 质量问题查询遇到“非质量原因”时降权；
- 夜间配送查询遇到没有“夜间/定时配送”信号的通用配送资料时降权。

它的优势是零费用、确定性和可解释，不能替代经过标注集评测的 Cross-Encoder。生产实现应保持
同一 Port，并通过 Recall、MRR、拒答准确率和延迟预算决定是否上线。

### TokenCounter

`TokenCounter` 只提供 `count(text)`。课程默认的 `ConservativeTokenCounter` 完全离线，对 CJK、
标点和 ASCII 采用偏保守估算。生产可注入与实际模型版本匹配的精确 tokenizer，组装逻辑无需
修改。

## 冲突治理

冲突不能通过“两个金额不同”之类的字符串规则猜测。知识源清单使用可空的
`conflict_group`，并沿着 Ingestion Metadata、Vector Metadata、Hybrid Candidate 一直传播。

同一冲突组中出现两个不同且相关的当前来源时，Retriever 返回 `conflicting`。Orchestrator 对
任何非 `sufficient` 状态直接拒答，因此不会调用 LLM 选择其中一份。

## Token 预算和上下文组装

可用证据预算为：

```text
模型上下文窗口
- System Prompt Token
- 用户问题 Token
- Provider/协议包装预留
- 最大输出 Token
- 安全余量
= 证据 Token 预算
```

`ContextAssembler` 按 Rerank 顺序计算带来源包装的完整证据块。只有完整块能够放入剩余预算时
才加入；否则记录 `budget_exceeded`。不截断 Chunk，避免句子含义、适用条件和来源边界被破坏。

## 引用闭环

最终 `KnowledgeEvidence` 保存：

- `sourceId`
- `chunkId`
- `version`
- `title`
- `content`
- `score`

只有 ContextAssembler 选中的证据会以 `sufficient` 结果返回。Orchestrator 只接受模型引用该
结果中的 `sourceId`；未知来源或预算外来源会触发 `AI_INVALID_MODEL_OUTPUT`。`chunkId` 保留在
服务端用于追踪具体证据片段，用户界面引用仍展示易理解的标题和版本。

## 可观测字段

离线诊断结果保留：

- Rerank 分数与原因码；
- 可用和已使用 Token；
- 最终证据；
- `below_threshold` 与 `budget_exceeded` 排除原因；
- `none`、`conflicting`、`sufficient` 证据状态。

这些字段适合调试和低基数指标聚合，不应把完整客服问题、文档正文或内部评分直接写入生产
日志。

## 生产替换清单

1. 用标注集评估 Cross-Encoder，再替换 `CandidateReranker`。
2. 使用与实际推理模型和版本匹配的精确 tokenizer，并继续保留安全余量。
3. 把阈值、预算与模型版本作为同一发布契约管理。
4. 在模型调用前记录入选 `sourceId/chunkId`，调用后校验引用集合。
5. 冲突应由知识治理流程解除，不允许 Prompt 或 Reranker 暗自选边。
