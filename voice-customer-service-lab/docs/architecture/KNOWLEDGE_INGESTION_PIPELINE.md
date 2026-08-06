# 知识解析、清洗、切片、元数据与稳定 ID

本节把上一课批准的 Source 变成可供下一课 Embedding 的 Chunk。完整顺序固定为：

```text
governed source -> load -> verify checksum -> clean -> parse sections -> chunk -> metadata + ID
```

## 1. 解析必须受 Source Manifest 约束

[`FixtureCorpusSourceLoader`](../../apps/api/src/knowledge/fixture-corpus-source-loader.ts) 只接受
课程的 `fixture://` URI，限制文件和正文大小、阻止路径逃逸，并要求 URI Fragment 与
`source_id` 一致。Pipeline 还会比较正文 SHA-256 与 Manifest，内容被替换时立即失败。

当前只实现合成 JSON Corpus 中的纯文本/Markdown 标题解析，不支持 PDF、Word、OCR 或远程
HTTP 下载。生产系统应为每种格式建立独立、沙箱化 Adapter，而不是把所有文件交给一个宽松
解析器。

## 2. 清洗只做确定性规范化

清洗步骤包括 Unicode NFC、换行、水平空白、零宽空格和不支持的控制字符规范化。它不做
摘要、不改写业务事实，也不会删除文档中的“系统指令”。检索文本始终是不可信数据，安全
边界由 Prompt、工具权限和输出验证负责，不能靠清洗器猜测哪些句子危险。

Markdown Heading 被提取为 `section_path`，正文仍保持可审计。相同输入和相同 Pipeline 版本
必须得到字节级相同结果。

## 3. 先按结构，再做有界重叠切片

本课先按 Heading 分 Section，再在每个 Section 内优先寻找句末边界；超长内容才按最大字符
数切分，相邻 Chunk 保留少量重叠。Chunk 不跨 Section，避免把不同规则标题下的语义混合。

课程 Fixture 使用字符数以保持零依赖和确定性；生产环境应使用与 Embedding/LLM 一致的
Tokenizer 校准 Token 上限。修改 Chunk 大小、Overlap、清洗或解析规则时必须提升
`pipeline_version`，并运行离线检索回归。

## 4. ID 与 Metadata 都必须可重放

```text
document_id = SHA256(tenant + source_id + source_sha256)
chunk_id    = SHA256(document_id + pipeline_fingerprint + position + chunk_sha256)
```

因此相同输入重跑不会产生重复记录；Tenant、内容、位置或 Pipeline 变化会产生新的安全 ID。
Chunk Metadata 只使用适合向量库过滤的标量，包含 Tenant、Source/Revision、Owner、分类、生效
时间、Section、位置、哈希和 Pipeline 版本。

稳定 ID 不是只用数组下标。只用 `chunk_0` 会在重切片、跨租户和版本升级时覆盖错误数据。
下一课可直接用 `chunk_id` Upsert，并按 Document/Source ID 删除旧版本。

## 零费用验证

```bash
# 查看真实 Chunk、ID 和 Metadata
pnpm inspect:knowledge-ingestion

# 验证重放、隔离、校验和、清洗、切片和版本化 ID
pnpm test:knowledge-ingestion
```

所有输入均来自合成 Corpus，不调用 Embedding、Chroma 或公网服务。
