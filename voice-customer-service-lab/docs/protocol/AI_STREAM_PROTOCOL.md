# AI 文本流协议：RTC、SSE、取消与背压

本节只解决四个问题：不同协议负责什么、事件如何排序、取消如何传递、消费者变慢时怎么办。
调试链路使用 Mock 时不连接 RTC 或真实模型。

## 1. 协议职责

| 协议 | 本项目职责 | 不负责 |
| --- | --- | --- |
| HTTPS | 创建 Session、启动/停止 Agent、普通 JSON 调试 | 连续媒体传输 |
| SSE | 服务端向调试调用方单向推送 AI 文本事件 | 麦克风音频、双向 RTC 消息 |
| RTC | 实时音频、字幕和 Barge-in 事件 | 通用管理 API |

调试端点使用 `POST + fetch` 读取 SSE，而不是浏览器 `EventSource GET`，避免把用户问题放进
URL、访问日志和缓存键。SSE 不替代 WebRTC；未来 RTC Adapter 只消费同一套类型化事件。

## 2. 最小事件状态机

```text
stream.started
      -> answer.delta *
      -> answer.completed | stream.cancelled | stream.failed
```

每个事件都有 `schema_version`、`session_id`、`round_id` 和单调递增的 `sequence`。SSE Frame
同时设置 `id`、`event`，并在 `data` 中放一个完整的 `AiStreamEvent` JSON：

```text
id: round_xxx:2
event: answer.delta
data: {"schema_version":1,"sequence":2,"event_type":"answer.delta",...}

```

客户端按 `round_id + sequence` 去重排序，只接受一个终态。`answer.completed` 才能让 UI 把
回答标为完成；连接关闭不能被当成成功。

## 3. 取消传播

```text
浏览器 AbortController / 连接断开
  -> API AbortController
  -> AiTurnStreamService
  -> AiOrchestrator
  -> Retriever / LanguageModel fetch
```

取消用于尽快停止计算并阻止迟到结果继续生效，但不能保证撤销已经发送或已经计费的请求。
流已经发出 delta 后不自动重试；调用方需要创建新 Round。RTC 插话未来会触发同一取消链，
本节尚未把 RAG 接入真实 RTC Agent。

## 4. 背压与当前边界

`ServerResponse.write()` 返回 `false` 表示 Socket 缓冲已满。`SseEventWriter` 此时等待
`drain`，不会继续把 delta 堆进应用内存；等待期间断开连接会立即取消。响应还设置
`X-Accel-Buffering: no`，部署网关也必须关闭 SSE Buffering。

当前 `LanguageModel` 仍返回完整答案，`AiTurnStreamService` 再确定性切成 delta。这证明事件、
取消和背压协议，不证明模型首 Token 延迟。真正的 Provider Token Stream、跨节点限流和
断点续传留到第 16 章第 03 节。

## 零费用验证

```bash
pnpm test:ai-stream
```

专项测试覆盖事件顺序、delta 无损拼接、取消终态、SSE Frame、`drain` 背压和 HTTP 流。
所有 Provider 调用都是 Mock/Fake，不访问公网。
