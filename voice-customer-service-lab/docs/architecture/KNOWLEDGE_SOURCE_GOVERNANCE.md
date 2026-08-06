# 知识源治理、租户隔离与文档生命周期

本节先建立知识库的控制面，不做切片、Embedding 或 Chroma 写入。控制面决定“哪些资料有权
进入索引”，后续数据面只能处理它批准的版本。

## 1. Source Manifest 是发布清单

[`knowledge-source-manifest.v1.json`](../../config/knowledge-source-manifest.v1.json) 为每个版本
记录：

- `tenant_id + source_id`：租户内唯一身份。
- `source_key + revision`：稳定业务名称和不可变版本。
- `owner_team`、`classification`：责任人和数据级别。
- 不可变 `content_uri` 与 `content_sha256`：内容位置和完整性校验。
- 生命周期状态和生效区间。

`source_id` 必须等于 `source_key@revision`。Manifest 拒绝可变 HTTP 地址、重复复合键、非法
状态字段和缺失校验和。真实系统通常把文件放在启用版本控制的 OSS/S3 路径中；课程里的
`fixture://` 只指向合成 Corpus。

## 2. 租户隔离必须进入每一次访问

知识源全局主键不是 `source_id`，而是：

```text
(tenant_id, source_id)
```

`KnowledgeSourceRegistry` 的读取、发布、撤回和删除都要求服务端可信的 `tenantId`。另一个
租户即使猜中相同 `source_id`，也只得到普通的 Not Found，不会知道该资料是否存在。

客服检索只接受同时满足以下条件的资料：

```text
tenant 匹配
AND classification = public
AND state = published
AND effective_from <= now < effective_to
```

后续 Chroma 查询还必须把 `tenant_id` 作为强制 Metadata Filter；仅使用不同 Collection 名称
或在 Prompt 中要求模型“不要越权”都不是可靠隔离。

## 3. 生命周期是状态机

```text
draft -> published -> superseded | withdrawn -> purge_pending -> purged
```

- `draft`：可以审核，不可检索。
- `published`：通过分类和时间检查后可以检索。
- `superseded`：同一租户发布新 Revision 时，旧版本自动退出当前结果。
- `withdrawn`：发现错误或合规风险时立即停止检索。
- `purge_pending`：等待保留期并驱动下游清理。
- `purged`：内容位置和校验和已移除，只保留最小 Tombstone 审计记录。

Revision 发布后不原地覆盖。修改正文必须创建新 Revision，这样引用、评测和回滚才可追踪。

## 4. 删除是跨存储工作流

“从来源列表删除一行”不代表已经删除。完整删除至少涉及：

```text
source_blob -> chunks -> vectors -> cache
```

本课采用两阶段删除：先 `withdraw` 让资料立即不可检索，再 `requestPurge` 设置保留期；只有
保留期结束且四个目标都确认清理后，才能 `completePurge`。`source.purge_requested` 等生命
周期事件将在生产中写入事务 Outbox，由幂等 Worker 重试。

当前 Registry 是进程内课程实现，不是生产数据库，也没有真的删除对象存储或 Chroma 数据。
它验证的是状态、不变量、租户边界和清理确认协议。

## 零费用验证

```bash
pnpm test:knowledge-governance
```

测试覆盖 Manifest 与合成 Corpus 校验、跨租户同名 Source、可检索门禁、新版本替换、立即
撤回、保留期以及 Blob、Chunk、Vector、Cache 全部确认后才能清除。全程不访问公网。
