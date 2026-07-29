# ADR-001：实时语音传输与 AI 管线架构

| 字段 | 内容 |
| --- | --- |
| 状态 | Accepted |
| 日期 | 2026-07-28 |
| 决策范围 | Web MVP 的实时音频、控制面与 AI 管线 |
| 关联需求 | UJ-01～UJ-06、SLO-01～SLO-04 |

## 1. 背景

项目需要在浏览器中实现全双工实时语音客服，并满足：

- 用户判停到 AI 首包语音 P95 不高于 2 秒。
- 用户插话到 AI 停止播放 P95 不高于 500 毫秒。
- 弱网时可以恢复或明确失败。
- 长期密钥不能进入浏览器。
- 大部分开发与测试不产生云服务费用。
- 后续可以接入自定义 LLM、RAG、ASR 或 TTS。

实时语音不是一个普通“上传音频文件”的 HTTP 请求。系统必须持续处理音频帧、
网络抖动、对话轮次、并发收发、取消和播放时序。

## 2. 先区分四个概念

### 2.1 WebRTC

浏览器实时媒体 API 与协议集合，负责音频/视频轨道、媒体协商、传输、加密和
连接状态。实际服务通常还包含 ICE、STUN/TURN、SFU 或厂商 RTC 网络。

WebRTC 不等于某一台服务器，也不规定业务 API。信令、房间和鉴权仍由应用或
RTC Provider 设计。

### 2.2 WebSocket

在一条 TCP 连接上提供双向消息帧。它可以传二进制音频，但不会自动提供：

- 麦克风音频的实时编码策略。
- 面向语音的拥塞与弱网适配。
- 抖动缓冲和连续播放调度。
- 回声消除、自动增益和降噪。
- RTC 房间、媒体轨道和质量指标。

这些能力可以自建，但必须由团队自己开发、测试和运维。

### 2.3 控制面

低频、要求可靠和可审计的操作：

```text
创建 Session
签发短期 RTC Token
启动 / 停止 Agent
获取状态
更新配置
```

它们适合使用 HTTPS API，不需要为了“实时”全部改成 WebSocket。

### 2.4 数据面

持续、高频、延迟敏感的音频帧和 RTC 房间消息。数据面不应绕行业务 Control API
服务，否则 API 会承担音频转发、背压和扩缩容压力。

## 3. 候选方案

### 方案 A：WebSocket + 自建 ASR/LLM/TTS 管线

```text
Browser
  ⇅ WebSocket PCM/Opus
Voice Gateway
  -> Streaming ASR -> LLM -> Streaming TTS
```

优点：

- 对每个音频帧和 AI 组件拥有最大控制。
- 容易替换单独的 ASR、LLM 或 TTS。
- 可以设计完全自有的事件协议。

代价：

- 自己处理编码、背压、播放缓冲、取消和弱网。
- Voice Gateway 需要按长连接与带宽扩展。
- 浏览器、服务端和模型流之间的竞态明显增加。
- 第一版很容易“能说话，但不稳定”。

### 方案 B：WebRTC + 托管对话式 AI

```text
Browser ⇄ RTC Provider ⇄ Managed ASR / LLM / TTS Agent
```

优点：

- RTC SDK 负责实时媒体与弱网基础能力。
- 托管 Agent 已整合 ASR、LLM、TTS、字幕和打断。
- 业务 API 不转发音频，扩展压力更小。
- 最快建立可测量的生产形态 MVP。

代价：

- 存在 Provider API、事件格式和计费锁定。
- 底层音频与模型调度控制较少。
- 必须正确处理云端任务回调和资源回收。

### 方案 C：WebRTC + 自建媒体机器人与 AI 管线

```text
Browser ⇄ RTC / SFU ⇄ Custom Media Bot
                           -> ASR -> LLM -> TTS
```

优点：

- 保留 WebRTC 媒体能力，同时拥有 AI 管线控制权。
- 适合自研模型、特殊音频处理和多 Provider 路由。

代价：

- 需要媒体机器人、音频帧处理和大规模长连接运维。
- 故障域、容量规划和成本模型最复杂。
- 对当前学习 MVP 过度设计。

## 4. 决策矩阵

评分：5 表示更符合当前项目，1 表示较弱。

| 维度 | A WebSocket 自建 | B WebRTC 托管 | C WebRTC 自建 Bot |
| --- | ---: | ---: | ---: |
| 浏览器实时音频体验 | 2 | 5 | 5 |
| 弱网与媒体工程成熟度 | 2 | 5 | 4 |
| 插话和低延迟落地速度 | 2 | 5 | 3 |
| AI 管线控制力 | 5 | 2 | 5 |
| 首版运维复杂度 | 2 | 5 | 1 |
| 自动化测试隔离 | 3 | 4 | 3 |
| 供应商可替换性 | 5 | 2 | 4 |
| 当前课程适配度 | 3 | 5 | 2 |

矩阵不是永久结论。它依据当前 MVP 的目标、团队规模和交付阶段评分。

## 5. 决策

MVP 选择方案 B：

```text
WebRTC + 火山引擎托管对话式 AI
```

具体通信边界：

```text
Browser -- HTTPS --> Control API
  创建 Session、获取短期 RTC Token、结束 Session

Control API -- HTTPS OpenAPI --> Volcengine
  StartVoiceChat、StopVoiceChat、Update/Query

Browser == WebRTC ==> veRTC
  上行麦克风、下行 AI 音频、RTC 房间消息

Volcengine -- HTTPS Callback --> Control API
  Agent 状态、错误、字幕/用量等服务端事件
```

第一阶段不建立 Browser 与 Control API 之间的自有 WebSocket：

- 音频已经走 RTC。
- 低频控制操作使用 HTTPS。
- 实时字幕和 AI 状态优先使用 RTC 消息。
- 服务端状态由 Provider Callback 接收并用于审计和回收。

如果以后需要从业务 API 向浏览器单向推送非 RTC 状态，先评估 SSE；只有确实
需要双向、长生命周期业务消息时才增加 WebSocket。

## 6. Provider 隔离

托管方案不能让业务代码直接依赖火山参数。边界分为：

```text
WebRtcClientAdapter
  浏览器设备、加入房间、发布/订阅和 RTC 消息

VoiceAgentProvider
  服务端启动、停止、更新和查询 Agent

MockVoiceAgentProvider
  本地测试的确定性实现

VolcengineVoiceAgentProvider
  火山 OpenAPI 的唯一适配层
```

Prompt、订单工具、会话策略和 UI 不直接构造 `StartVoiceChat` 请求。

## 7. 安全决定

- AppID 可以出现在客户端配置中，AppKey 不可以。
- AppKey 和云 AccessKey/SecretKey 只存在于服务端 Secret Store。
- Control API 为指定 RoomID/UserID 生成短期 RTC Token。
- Browser 不直接调用需要长期云密钥的 Start/Stop OpenAPI。
- WebRTC 媒体在传输链路上加密，但托管 AI 必须处理音频，因此不得宣称为
  “只有用户才能解密”的端到端加密。
- API、WebSocket（未来若增加）和 Provider Callback 都必须单独鉴权。

## 8. 延迟分解

`SLO-02` 的 2 秒不是某一个接口的超时：

```text
用户判停
-> RTC 上行
-> ASR / VAD 完成
-> LLM 首 Token
-> TTS 首音频
-> RTC 下行
-> 浏览器开始播放
```

每一段都记录时间点。只记录“整个请求 1.8 秒”无法判断应该优化 VAD、模型、
TTS 还是网络。

音频播放使用收到的 RTC 音频帧，不等待整段回答生成完毕。

## 9. 结果与代价

正面结果：

- 可以更早验证真实语音体验和业务闭环。
- Control API 保持控制面服务，不承担媒体转发。
- RTC Provider 负责大量媒体和弱网复杂度。
- 第 01～05 节仍可完全使用 Mock 开发。

需要接受：

- 首版依赖火山 RTC 可用性和产品权限。
- 需要持续跟踪 API 版本、费用和回调变更。
- 自定义模型接入受 Provider 支持方式约束。
- 迁移 Provider 时 Web SDK 与服务端适配器都可能需要实现。

缓解方式：

- 核心领域事件使用自有类型。
- Provider 请求和响应只存在于 adapter。
- 契约测试同时约束 Mock 和真实 adapter。
- 录制真实但脱敏的事件样例作为回归 fixture。
- API 版本固定，不在生产自动追随“最新版本”。

## 10. 何时重新评估？

满足任一条件时创建新 ADR：

- 托管方案长期无法满足 `SLO-02` 或 `SLO-03`。
- 必须使用 Provider 不支持的自研 ASR/TTS/端到端模型。
- 单位会话成本在目标流量下不可接受。
- 数据驻留或合规要求不允许托管处理。
- 需要电话网关、多个 RTC 厂商或主动跨区域容灾。
- 团队已经具备媒体服务器和 7×24 运维能力。

## 11. 不做的决定

- 本 ADR 不选择正式 TTS 音色和 LLM 型号。
- 不决定 RAG 架构。
- 不决定生产部署地域。
- 不将 WebSocket 永久排除；只是不为当前 MVP 提前引入。

## 12. 参考

- [W3C WebRTC 规范](https://www.w3.org/TR/webrtc/)
- [IETF RFC 6455：WebSocket](https://www.rfc-editor.org/rfc/rfc6455)
- [火山引擎 Web RTC 接入](https://www.volcengine.com/docs/6348/106914)
- [火山引擎 AI 音视频互动方案集成](https://www.volcengine.com/docs/6348/2137641)
- [火山引擎 StartVoiceChat 2025-06-01](https://www.volcengine.com/docs/6348/2123348)
- [火山引擎 StopVoiceChat 2025-06-01](https://www.volcengine.com/docs/6348/2123349)
