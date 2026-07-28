# 对话轮次、事件协议与会话状态机

| 字段 | 内容 |
| --- | --- |
| 协议版本 | `1` |
| 状态 | Design baseline |
| 日期 | 2026-07-28 |
| 关联需求 | FR-03～FR-08、FR-12 |
| 关联旅程 | UJ-01～UJ-03、UJ-05～UJ-06 |

## 1. 设计目标

浏览器、Control API、RTC SDK 和 Voice Provider 都会产生异步回调。同一事件可能
重复、迟到，来自不同通道的事件还可能乱序。本协议用于保证：

- UI 只通过状态机更新，不直接依赖某个厂商的回调名称。
- 一轮旧回答的迟到字幕或音频不能覆盖当前轮次。
- 重复事件不会造成重复播放、重复工具调用或重复资源操作。
- 断线恢复后可以通过快照重新对齐，而不是猜测当前状态。
- Provider 事件先在 Adapter 中标准化，再进入领域层。

本节只确定领域协议。第 10 节才会实现 RTC 消息编码、运行时校验、缓存和排序。

## 2. 先区分四个概念

### 2.1 Command：请求系统做某事

Command 使用祈使语义，可能成功或失败，例如：

```text
CreateSession
StartAgent
InterruptResponse
EndSession
RecoverSession
```

会产生外部副作用的 Command 必须携带幂等键。Command 不是已经发生的事实，
不能直接追加到 Transcript 当作成功记录。

### 2.2 Event：已经发生的事实

Event 使用过去式语义，创建后不可修改，例如：

```text
session.created
rtc.join.succeeded
turn.user.transcript.final
turn.ai.audio.started
turn.interrupted
session.ended
```

状态机消费 Event。Provider 的原始回调不是领域 Event，必须先由 Adapter
完成字段映射、校验和错误归一化。

### 2.3 Round：一轮对话

一轮对话通常从用户开始说话，到 AI 回答完成、被打断或失败为止：

```text
用户开始说话
-> ASR 临时/最终字幕
-> AI 思考
-> AI 字幕与音频
-> completed / interrupted / failed
```

`round_id` 标识这一整轮。欢迎语等非用户触发内容使用
`round_origin = system`，普通问题使用 `round_origin = user`。

### 2.4 Response：一次回答尝试

同一轮可能因为超时或恢复产生新的回答尝试。`response_id` 标识一次具体 AI
回答流。字幕增量、音频开始和完成事件必须属于同一个 `response_id`。

```text
round_id = rnd_01
  response_id = rsp_01  -> 超时，废弃
  response_id = rsp_02  -> 成功
```

这样 `rsp_01` 的迟到音频不会污染 `rsp_02`。

## 3. 为什么使用两个状态机？

“是否连接”和“谁正在说话”是两个独立维度：

```text
会话状态：active / reconnecting / ending ...
轮次状态：capturing / thinking / speaking ...
```

如果合成一个枚举，就会出现
`reconnecting_while_speaking`、`ending_while_thinking` 等组合爆炸。因此项目使用：

1. Session Machine：资源和连接生命周期。
2. Round Machine：当前对话轮次生命周期。

UI 的“正在听 / 正在想 / 正在说”是两个状态机的派生视图，不是第三套真相。

## 4. Session Machine

### 4.1 状态图

```text
new
  │ START
  ▼
creating ── session.created ──> connecting
                                  │ rtc.join.succeeded
                                  │ agent.start.succeeded
                                  ▼
                              active ◀──────────────┐
                                  │ connection.lost │ connection.restored
                                  ▼                 │
                             reconnecting ──────────┘
                                  │ recovery.exhausted
                                  ▼
                                ending ── cleanup.finished ──> ended

任一非终态 ── unrecoverable_error ──> ending ── cleanup.finished ──> failed
```

`ended` 和 `failed` 是终态。失败也必须先尝试清理已创建的 RTC 和 Agent 资源。

### 4.2 状态定义

| 状态 | 含义 | 允许的主要动作 |
| --- | --- | --- |
| `new` | 尚未创建会话 | Start |
| `creating` | API 正在创建短期会话 | Cancel |
| `connecting` | Session 已创建，RTC/Agent 尚未全部就绪 | End、Retry |
| `active` | RTC 与 Agent 均可用 | Talk、Interrupt、End |
| `reconnecting` | 连接丢失，正在有限恢复 | End、Retry |
| `ending` | 禁止新轮次，正在停止与回收资源 | 重复 End |
| `ended` | 正常终态 | 无 |
| `failed` | 异常终态，已完成或尽力完成清理 | 无 |

### 4.3 Session 转换表

| 当前状态 | Event | 下一状态 | 守卫或副作用 |
| --- | --- | --- | --- |
| `new` | `session.create.started` | `creating` | 冻结重复 Start |
| `creating` | `session.created` | `connecting` | 保存短期 Session 配置 |
| `connecting` | `rtc.join.succeeded` | `connecting` | 设置 `rtc_ready=true` |
| `connecting` | `agent.start.succeeded` | `connecting` | 设置 `agent_ready=true` |
| `connecting` | 两个 ready 均为 true | `active` | 派生 `session.ready` |
| `active` | `connection.lost` | `reconnecting` | 暂停新轮次，启动有限重试 |
| `reconnecting` | `connection.restored` | `active` | 先应用服务端快照 |
| `reconnecting` | `recovery.exhausted` | `ending` | 记录 `connection_lost` |
| 任一非终态 | `session.end.requested` | `ending` | Stop 必须幂等 |
| 任一非终态 | `session.fatal_error` | `ending` | 保存标准错误码并清理 |
| `ending` | `cleanup.finished` | `ended` 或 `failed` | 是否有 fatal error 决定终态 |

## 5. Round Machine

### 5.1 状态图

```text
无当前轮次
   │ turn.user.speech.started
   ▼
capturing ── turn.user.speech.ended ──> recognizing
                                             │ transcript.final
                                             ▼
                                          thinking
                                             │ ai.audio.started
                                             ▼
                                          speaking
                                             │ response.completed
                                             ▼
                                          completed

capturing / recognizing / thinking / speaking
   ├── turn.interrupted ──> interrupted
   └── turn.failed ───────> failed

completed / interrupted / failed ──> 无当前轮次
```

临时字幕、AI 字幕增量和 LLM 首 Token 只更新数据或指标，不单独改变 Round
状态。

### 5.2 UI 状态映射

| Session | Round | UI |
| --- | --- | --- |
| 非 `active` | 任意 | 使用 Session 状态，如连接中、重连中、结束中 |
| `active` | 无当前轮次 | `listening` |
| `active` | `capturing` / `recognizing` | `listening` |
| `active` | `thinking` | `thinking` |
| `active` | `speaking` | `speaking` |
| `active` | Round 终态 | 清除当前轮次并回到 `listening` |

## 6. 领域事件信封

所有标准化事件都使用同一个信封：

```json
{
  "schema_version": 1,
  "event_id": "evt_01JABC...",
  "event_type": "turn.user.transcript.final",
  "session_id": "ses_01JABC...",
  "round_id": "rnd_01JABC...",
  "response_id": null,
  "producer": "web_rtc_adapter",
  "stream_id": "stream_web_01JABC...",
  "sequence": 18,
  "occurred_at": "2026-07-28T08:30:00.123Z",
  "correlation_id": "corr_01JABC...",
  "payload": {
    "text": "我的模拟订单什么时候发货？",
    "language": "zh-CN"
  }
}
```

字段规则：

| 字段 | 规则 |
| --- | --- |
| `schema_version` | 主版本号；不兼容变更才递增 |
| `event_id` | 全局唯一，用于幂等去重，不携带业务含义 |
| `event_type` | 领域事件名，决定 `payload` 类型 |
| `session_id` | 所有事件必填 |
| `round_id` | `turn.*` 事件必填，Session 事件为空 |
| `response_id` | AI 回答流事件必填，用户事件为空 |
| `producer` | 标准化事件的生产者类型 |
| `stream_id` | 某个生产者实例的有序流 |
| `sequence` | 在同一个 `stream_id` 内严格递增 |
| `occurred_at` | UTC RFC 3339；只用于审计和观测 |
| `correlation_id` | 可选；关联触发该事件的 API/Command |
| `payload` | 由 `event_type` 区分的类型化内容 |

Transcript 可能包含个人信息。可以在内存中消费，但不得把整个信封无差别写入
日志；日志只记录标识符、类型、长度、耗时和脱敏后的错误。

## 7. MVP 领域事件表

### 7.1 Session 与连接事件

| Event | 必要 payload | 用途 |
| --- | --- | --- |
| `session.create.started` | 无 | 锁定重复创建 |
| `session.created` | `expires_at` | 进入连接阶段 |
| `rtc.join.succeeded` | 无 | 标记 RTC 就绪 |
| `agent.start.succeeded` | 无 | 标记 Agent 就绪 |
| `session.ready` | `ready_components[]` | 表示会话可对话；由状态机派生 |
| `connection.lost` | `reason` | 进入恢复流程 |
| `connection.restored` | `attempt` | 应用快照后恢复 |
| `recovery.exhausted` | `attempts` | 停止重试并清理 |
| `session.end.requested` | `reason` | 禁止创建新轮次 |
| `session.fatal_error` | `code`, `retryable` | 保存错误并进入清理 |
| `cleanup.finished` | `resource_results[]` | 决定 `ended` 或 `failed` |
| `session.ended` | `reason` | 对外发布最终结果 |
| `session.failed` | `code` | 对外发布异常终态，资源已清理或已尽力清理 |

### 7.2 Round、字幕与回答事件

| Event | 必要 payload | 状态影响 |
| --- | --- | --- |
| `turn.user.speech.started` | `round_origin` | 创建 Round，进入 `capturing` |
| `turn.user.speech.ended` | 无 | 进入 `recognizing` |
| `turn.user.transcript.partial` | `text`, `revision` | 只更新临时字幕 |
| `turn.user.transcript.final` | `text`, `language` | 冻结用户文本，进入 `thinking` |
| `turn.ai.response.started` | `model_route` | 绑定 `response_id` |
| `turn.ai.transcript.delta` | `text_delta`, `index` | 追加 AI 字幕 |
| `turn.ai.audio.started` | 无 | 进入 `speaking`，记录首音频时间点 |
| `turn.ai.response.completed` | `finish_reason` | 进入 `completed` |
| `turn.interrupted` | `interrupted_response_id`, `by` | 停止旧播放，进入 `interrupted` |
| `turn.failed` | `code`, `retryable` | 进入 `failed` 并给出安全提示 |

Provider 若没有某个事件，Adapter 可以依据受支持的回调派生，但必须记录事件来源，
不得伪造无法确定的时间点。

## 8. 排序、去重与恢复规则

分布式系统不存在免费且可靠的全局顺序。协议采用以下规则：

1. `event_id` 已处理过：直接忽略。
2. 同一 `stream_id` 内，`sequence <= last_sequence`：视为重复或迟到，忽略。
3. 同一流出现序号缺口：记录 `protocol.sequence_gap` 指标，并请求 Session 快照。
4. 不同 `stream_id` 之间：不使用 `occurred_at` 强行排序。
5. 旧 `round_id` 可以补充历史记录，但不能改变当前 Round 或 UI。
6. 非当前 `response_id` 的字幕和音频事件必须丢弃。
7. Reconnect 成功后先应用权威 Session 快照，再接收后续增量事件。

快照至少包含：

```json
{
  "session_id": "ses_01JABC...",
  "revision": 9,
  "session_state": "active",
  "active_round_id": "rnd_01JABC...",
  "round_state": "thinking",
  "active_response_id": "rsp_01JABC..."
}
```

`revision` 只描述控制面快照版本，不与各事件流的 `sequence` 混用。

## 9. 插话的标准处理

当 AI 正在播放 `rsp_01`，用户开始新一轮 `rnd_02`：

```text
turn.user.speech.started(rnd_02)
-> turn.interrupted(rnd_01, rsp_01)
-> 立即停止 rsp_01 的本地播放
-> rnd_01 进入 interrupted
-> rnd_02 进入 capturing
```

之后即使收到：

```text
turn.ai.transcript.delta(rnd_01, rsp_01)
turn.ai.response.completed(rnd_01, rsp_01)
```

也只能作为迟到事件计数，不能继续播放、追加可见字幕或把 UI 改回 `speaking`。

## 10. 错误协议

Provider 错误先映射为稳定的领域错误码：

| 错误码 | 用户提示方向 | retryable |
| --- | --- | --- |
| `MIC_PERMISSION_DENIED` | 引导浏览器开启麦克风 | `false` |
| `RTC_JOIN_TIMEOUT` | 提示检查网络并允许有限重试 | `true` |
| `AGENT_START_FAILED` | 当前客服暂不可用 | 视 Provider 错误而定 |
| `SESSION_EXPIRED` | 创建新会话 | `false` |
| `CONNECTION_LOST` | 正在恢复，失败后明确结束 | `true` |
| `PROTOCOL_VIOLATION` | 安全结束并记录诊断信息 | `false` |
| `INTERNAL_ERROR` | 使用通用提示，不暴露内部细节 | `false` |

原始 Provider 错误码可以写入受控诊断字段，但不能作为前端业务分支的稳定契约。

## 11. 状态机不变量

后续单元测试和属性测试必须覆盖：

1. 一个 Session 同时最多有一个当前 Round。
2. 一个 Round 同时最多有一个有效 `response_id`。
3. `ended` / `failed` 不可重新进入非终态。
4. `ending` 后不得创建新 Round 或执行新工具调用。
5. Round 终态不可重新进入 `thinking` 或 `speaking`。
6. 非当前 Round/Response 的事件不得改变 UI 或开始播放。
7. 相同 `event_id` 消费多次，结果与消费一次相同。
8. 同一副作用 Command 的幂等键重放，不创建第二个资源。
9. `occurred_at` 回拨或漂移不得改变状态转换结果。
10. Transcript 内容和 Token 不进入普通结构化日志。
11. 会话失败时仍必须执行一次可重复的资源清理流程。
12. 所有非法转换都被忽略并计数，不能让进程崩溃。

## 12. 与后续课程的边界

- 第 04 节：把事件、状态与错误码放入契约和 Monorepo。
- 第 05 节：Mock Provider 按本协议产生确定性事件。
- 第 10 节：实现 RTC 消息校验、去重、排序和快照同步。
- 第 12 节：用 VAD 决定 speech started/ended。
- 第 13 节：实现插话取消和迟到事件测试。
- 第 14 节：实现重连、超时、退避和幂等恢复。
- 第 19 节：把领域事件转换为不含 Transcript 的指标与 Trace。
