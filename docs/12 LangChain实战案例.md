# 12 LangChain 实战案例

本章通过 `langchain-commerce-rag-lab`，逐步构建一个多模态商品检索与
RAG 导购助手。完整规格见
[SPEC.md](../langchain-commerce-rag-lab/SPEC.md)。

## 学习进度

- [x] 01 跑通豆包 Embedding 模型 API
- [ ] 02 利用豆包进行 Store 向量化模糊搜索
- [ ] 03～08 Chroma 与向量检索基线
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

本次结果是 `2 段输入 -> 2 个 2048 维向量`，并通过了类型检查和 9 个测试。

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
- [x] 类型检查与 9 个测试通过。

### 12. 下一课

第 02 课会把向量用于模糊搜索：

```text
商品文本 -> Embedding -> Store
用户问题 -> Embedding -> 相似度比较 -> Top K 商品
```

## 官方参考

- [火山方舟图文向量化 API](https://api.volcengine.com/api-docs/view?action=EmbeddingsMultimodal&serviceCode=ark&version=2024-01-01)
- [火山方舟文本向量化 API](https://api.volcengine.com/api-docs/view?action=Embeddings&serviceCode=ark&version=2024-01-01)
