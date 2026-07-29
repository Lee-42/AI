# Mock Voice Provider 纵向切片

| 字段 | 内容 |
| --- | --- |
| 状态 | Implemented |
| 课程 | 第 05 节 |
| 云资源 | 不需要 |
| 音频 | 不采集、不播放 |

## 1. 目标

本切片先验证一条最小但完整的产品路径：

```text
React 操作
-> HTTPS API
-> VoiceAgentProvider
-> MockVoiceAgentProvider
-> 标准领域事件
-> React reducer
-> 状态与字幕
```

它验证模块能协作，不假装已经实现 WebRTC、ASR、LLM 或 TTS。

## 2. HTTP API

| 方法 | Path | 作用 |
| --- | --- | --- |
| `POST` | `/api/v1/sessions` | 幂等创建 Mock Session |
| `POST` | `/api/v1/sessions/:session_id/mock-turns` | 触发一轮本地模拟事件 |
| `DELETE` | `/api/v1/sessions/:session_id` | 幂等结束并模拟资源清理 |

`mock-turns` 明确带有 `mock`，避免被误认为真实语音输入接口。真实用户音频会在
第 08 节通过 RTC 上行，不会把 Transcript 作为普通生产 HTTP 请求发送。

## 3. Provider 边界

路由只依赖 `VoiceAgentProvider`：

```text
createSession()
endSession()

MockTurnCapability
  submitMockTurn()
```

Mock 实现负责：

- 保存内存 Session。
- 为同一创建幂等键返回同一个 Session。
- 按固定顺序生成领域事件。
- 使用本地规则生成回复，不调用模型。
- 重复结束时不重复释放资源。

火山实现以后负责调用 Provider OpenAPI，但仍要输出相同的领域结果。页面不应读取
火山原始字段。

## 4. 为什么本节返回事件批次？

当前 HTTP Command 的 Response 包含 `events[]`，Web 为教学展示逐条回放：

```text
POST mock-turn
-> 一次返回完整事件批次
-> Web 按 sequence 交给 reducer
```

这样做的原因：

- 本节完全离线、确定、容易测试。
- 不为临时 Mock 新建 WebSocket。
- 真实音频和实时消息最终走 RTC。
- reducer 消费的是标准事件，后续事件来源变化不影响 UI 规则。

批次中的等待时间只用于观察状态，不代表真实延迟。第 10 节接入实时 RTC 消息时，
Adapter 会在事件到达时逐条分发，并增加完整的乱序、缺口和快照处理。

## 5. 状态所有权

```text
API SessionSnapshot
  负责资源生命周期：active / ended

Web conversationReducer
  消费领域事件，派生 listening / thinking / speaking
```

页面不能根据按钮点击直接宣称“AI 正在说话”。只有收到
`turn.ai.audio.started` 才进入 `speaking`。

## 6. 安全与失败策略

- 浏览器只有 API 地址，没有长期云密钥。
- 创建 Session 时只返回会话级 RTC 凭证，AppKey 始终留在 API。
- Transcript 只存在内存与 HTTP Response，API 不记录请求 Body。
- Fastify 校验 Header、Params、Body 和 Response。
- Provider 错误映射为稳定错误码，不把内部异常直接发给浏览器。
- `correlation_id` 可用于定位请求，但不包含用户文本。
- `VOICE_PROVIDER=volcengine` 当前明确拒绝启动，避免错误地回退到 Mock。

## 7. 当前限制

- 页面文本框只用于触发 Mock，不是正式客服输入方式。
- 已签发会话凭证，但还没有麦克风权限、RTC 入房、音频轨道和真实播放。
- Mock 规则不能评估模型回答质量。
- 内存 Session 会随 API 重启丢失。
- 只实现单一 Provider 事件流的基础重复序号防护。

这些限制分别在第 07～10、12～14、16、18 节处理。
