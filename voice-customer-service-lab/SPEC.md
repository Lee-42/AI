# AI 实时语音客服规格

| 项目 | 内容 |
| --- | --- |
| 项目名 | `voice-customer-service-lab` |
| 规格版本 | `0.1.0` |
| 状态 | MVP 基线 |
| 场景 | 电商售后 Web 普通话客服 |
| 客户端 | React + TypeScript |
| 控制面 | Fastify + Node.js + TypeScript |
| 首个语音 Provider | 火山引擎 veRTC 对话式 AI |

## 1. 问题与价值

文字客服需要用户持续阅读和输入，在移动、做家务或无障碍场景中体验较差。
本项目提供一个可以自然插话、显示字幕并在必要时转人工的实时语音客服。

产品价值不是“能够播放 AI 声音”，而是：

- 用户能快速完成一次客服任务。
- AI 的状态、回答依据和失败原因可以理解。
- 异常会话能够恢复或安全结束。
- 企业能够控制密钥、隐私、成本和服务质量。

## 2. 角色

### P-01 客户

希望用语音咨询商品、查询模拟订单，或者转人工，不需要理解 RTC、ASR、LLM
和 TTS。

### P-02 客服运营

维护欢迎语、客服边界和转人工规则；需要看到脱敏会话摘要，但默认不能访问原始
录音。

### P-03 平台运维

关注会话成功率、端到端延迟、错误、用量和孤儿 Agent；通过关联 ID 定位问题，
不读取用户密钥或未脱敏个人信息。

## 3. MVP 范围

### 3.1 包含

- Chrome Web 端一名客户与一名 AI 的实时语音会话。
- 麦克风授权、设备选择、加入、重连和退出。
- 用户和 AI 的实时字幕。
- `listening / thinking / speaking` 等明确状态。
- 用户发声打断 AI 播报。
- 虚构商品咨询、模拟订单查询和模拟转人工。
- Mock Provider 与火山引擎 Provider。
- 结构化日志、指标、自动化测试和部署基线。

### 3.2 不包含

- PSTN 电话、外呼、真实呼叫中心和真实人工坐席系统。
- 真实支付、退款、改地址或取消订单。
- 默认录制或长期保存原始音频。
- 多租户计费和企业级管理后台。
- 本章内完成复杂知识库 RAG。
- 用 Kubernetes 复杂度代替真实扩展需求。

## 4. 产品原则

1. 用户始终知道对面是 AI。
2. 用户可以随时结束会话或转人工。
3. 先保证正确结束，再追求更快响应。
4. 不确定时说明限制，不编造订单和售后政策。
5. 原始音频默认不落盘，Transcript 默认最小化。
6. 所有外部操作都可审计；有副作用的操作必须幂等。
7. Provider 故障不得让会话永久停留在“处理中”。

## 5. 核心用户旅程

### UJ-01 开始会话

主流程：

```text
客户阅读 AI 与麦克风提示
-> 点击开始
-> 浏览器授权麦克风
-> API 创建短期会话
-> 客户加入 RTC 房间
-> AI Agent 加入并播放欢迎语
```

验收：

- 未经点击不得自动请求麦克风。
- 客户端不接收 AppKey、AccessKey 或 SecretKey。
- 失败时显示可操作原因，而不是无限加载。
- 重复点击开始最多创建一个有效 Agent。

### UJ-02 普通商品咨询

主流程：

```text
客户说出问题
-> UI 显示用户字幕
-> UI 从 listening 切换到 thinking
-> AI 开始播报并显示字幕
-> UI 切换到 speaking
```

验收：

- 字幕明确区分客户与 AI。
- AI 首包语音延迟可以测量。
- 不支持的问题进入安全降级，不伪造事实。

### UJ-03 插话打断

主流程：

```text
AI 正在播报
-> 客户开始说话
-> 旧音频停止
-> 旧回复剩余内容失效
-> 新一轮识别和回答开始
```

验收：

- 不出现旧回复和新回复同时播放。
- 打断延迟可以测量。
- 迟到的旧事件不能覆盖新一轮状态。

### UJ-04 查询模拟订单

主流程：

```text
客户提供虚构订单号
-> 系统校验参数与调用权限
-> 查询课程内置订单
-> AI 只播报允许公开的字段
```

验收：

- 未验证的会话不能读取订单详情。
- 不返回完整手机号、地址或内部备注。
- 相同工具调用 ID 重放时不重复执行。

### UJ-05 网络中断与恢复

主流程：

```text
网络短暂断开
-> UI 显示 reconnecting
-> 在有限次数内退避重连
-> 成功后恢复会话，或明确结束
```

验收：

- 不进行无限重试。
- 多次回调不会创建多个 Agent。
- 超过恢复窗口后执行服务端清理。

### UJ-06 转人工或结束

主流程：

```text
客户请求转人工或点击结束
-> 停止采集和播放
-> 停止 AI Agent
-> 退出 RTC 房间
-> 生成脱敏摘要
-> 显示最终状态
```

验收：

- Stop 操作可以安全重复。
- 页面关闭或异常断开也会触发回收。
- MVP 的转人工返回明确工单号，不伪装真人已接入。

## 6. 功能需求

| ID | 需求 | 验收条件 |
| --- | --- | --- |
| FR-01 | 展示 AI 与麦克风提示 | 用户确认后才请求权限 |
| FR-02 | 创建短期语音会话 | 返回无长期密钥的客户端配置 |
| FR-03 | 加入和退出 RTC 房间 | 重复操作不产生重复资源 |
| FR-04 | 管理 AI Agent 生命周期 | Start/Stop 幂等且状态可查询 |
| FR-05 | 展示实时字幕 | 区分角色、轮次、临时与最终文本 |
| FR-06 | 展示对话状态 | UI 状态来自统一状态机 |
| FR-07 | 支持插话打断 | 旧音频和旧回复及时失效 |
| FR-08 | 支持弱网恢复 | 有限重试、退避和最终失败状态 |
| FR-09 | 查询模拟订单 | 校验身份、参数和结果字段 |
| FR-10 | 模拟转人工 | 生成工单号并明确当前仍未接入真人 |
| FR-11 | 生成脱敏会话摘要 | 不包含原始音频和敏感字段 |
| FR-12 | 提供诊断信息 | 通过 correlation/session/round ID 定位 |

## 7. 非功能需求与 SLO

这些是课程最终目标，不是云厂商 SLA。样本少于 100 次时同时显示原始成功数，
不只报告百分比。

| ID | 指标 | 测量边界 | MVP 目标 |
| --- | --- | --- | --- |
| SLO-01 | 进房成功率 | 点击开始至客户和 Agent 都在房间 | ≥ 99% |
| SLO-02 | 首包语音延迟 P95 | 用户最终判停至收到 AI 首个音频帧 | ≤ 2 秒 |
| SLO-03 | 打断停止延迟 P95 | AI 播报时检测到用户发声至停止播放 | ≤ 500 ms |
| SLO-04 | Agent 回收时间 P95 | Stop/异常断开至 Provider 终态 | ≤ 60 秒 |
| SLO-05 | 重复副作用 | 相同幂等键重复请求造成的重复任务 | 0 |
| SLO-06 | 密钥暴露 | 客户端包、响应、日志中的长期密钥 | 0 |
| SLO-07 | 默认音频留存 | 未主动开启录音时保存的原始音频 | 0 |

延迟必须使用单调时钟测量。前端、API 和 Provider 时间线通过关联 ID 对齐，不用
客户端本地时间直接计算跨系统耗时。

## 8. 安全、隐私与成本

### 8.1 安全

- AppKey、AccessKey、SecretKey 只保存在服务端 Secret Store。
- RTC Token 绑定 AppID、RoomID、UserID 和较短有效期。
- Session、Start、Stop 和 Tool API 都要鉴权、限流和校验。
- 日志记录事件和标识符，不记录 Token、Cookie、Authorization 或完整密钥。
- 有副作用的接口使用幂等键。

### 8.2 隐私

- 麦克风采集前明确告知用途。
- 默认不录制原始音频。
- MVP Transcript 只保存在内存；后续持久化必须定义目的、访问权限和 TTL。
- 订单数据全部虚构，敏感字段仍按生产规则遮罩。
- 用户退出后停止所有采集和播放。

### 8.3 成本

- 开发和自动化测试默认使用 Mock Provider。
- 每个真实会话设置最大时长和空闲超时。
- 页面异常退出后由服务端兜底清理 Agent。
- 记录 RTC、ASR、LLM、TTS 用量并配置预算告警。
- 不对非幂等失败执行盲目自动重试。

## 9. 可观测性要求

每次会话至少关联：

```text
correlation_id  一次 API 请求链
session_id      一次客服会话
room_id         RTC 房间
agent_task_id   Provider Agent
round_id        一轮用户问题与 AI 回答
tool_call_id    一次业务工具调用
```

不得使用手机号、订单号或 Transcript 作为日志关联键。

核心事件：

```text
session.created
rtc.join.succeeded
agent.start.succeeded
session.ready
turn.user.transcript.final
turn.ai.audio.started
turn.interrupted
connection.lost / restored
session.end.requested
session.ended
```

领域事件负责驱动状态，观测时间点负责计算性能，二者不能混为一谈：

```text
turn.user.speech.ended
turn.asr.final
turn.llm.first_token
turn.tts.first_audio
turn.ai.audio.started
```

事件信封、Round/Response 语义、状态转换与去重规则见
[对话事件协议](docs/protocol/CONVERSATION_PROTOCOL.md)。

## 10. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 网络、ASR、LLM、TTS 延迟叠加 | 分段指标、流式处理、超时预算 |
| 背景噪声触发错误插话 | VAD 参数、降噪、状态与事件去抖 |
| 页面关闭留下计费 Agent | Beacon 尝试通知、服务端租约和回收任务 |
| Provider 回调乱序或重复 | event ID、round ID、幂等消费 |
| 迟到事件覆盖新状态 | 单调序号和状态机守卫 |
| 密钥进入前端或日志 | 服务端 Token Broker、脱敏测试、Secret 扫描 |
| AI 编造订单与售后政策 | Tool 结果约束、Prompt 边界、转人工 |
| 自动化测试产生云费用 | Mock 默认、真实测试显式开关和预算上限 |

## 11. 发布门禁

进入真实 Provider 集成前：

- Mock 纵向切片可运行。
- 状态机和 API 契约测试通过。
- `.env.example` 不含密钥。
- Session API 不返回服务端长期密钥。

进入公开测试前：

- 六条用户旅程全部通过。
- SLO 指标可以采集且定义一致。
- Agent 异常回收演练通过。
- 权限、限流、幂等和日志脱敏测试通过。
- 隐私提示、最大会话时长和预算告警已启用。
- 故障 Runbook 有明确负责人和处理步骤。

## 12. 需求追踪

| 用户旅程 | 主要需求 | 主要指标 |
| --- | --- | --- |
| UJ-01 开始会话 | FR-01～FR-04 | SLO-01、SLO-06 |
| UJ-02 普通咨询 | FR-05、FR-06 | SLO-02 |
| UJ-03 插话打断 | FR-06、FR-07 | SLO-03 |
| UJ-04 模拟订单 | FR-09、FR-12 | SLO-05、SLO-06 |
| UJ-05 网络恢复 | FR-04、FR-08 | SLO-01、SLO-04 |
| UJ-06 转人工/结束 | FR-03、FR-04、FR-10、FR-11 | SLO-04、SLO-07 |

## 13. 待后续确认但不阻塞开发

- 生产环境部署地域。
- 正式 TTS 音色和品牌话术。
- 真实客服系统的转人工协议。
- Transcript 是否需要持久化及其保留时间。
- 企业身份系统和真实订单服务接入方式。

这些决策通过后续 ADR 更新，不直接改写历史规格。

## 14. 架构决策索引

| ADR | 状态 | 决策 |
| --- | --- | --- |
| [ADR-001](docs/adr/ADR-001-real-time-voice-architecture.md) | Accepted | WebRTC 数据面、HTTPS 控制面、托管对话式 AI |
| [ADR-002](docs/adr/ADR-002-all-typescript-runtime.md) | Accepted | React、Fastify、TypeBox 与 pnpm 的全 TypeScript 运行时 |
| [ADR-003](docs/adr/ADR-003-ai-orchestrator-hexagonal-boundary.md) | Accepted | 六边形 AiOrchestrator 边界，当前保持同进程部署 |
| [ADR-004](docs/adr/ADR-004-llm-provider-and-debug-api.md) | Accepted | 独立 LLM 配置、两把费用锁、方舟 Adapter 与受限调试 API |

## 15. 领域协议索引

| 协议 | 状态 | 内容 |
| --- | --- | --- |
| [对话事件协议 v1](docs/protocol/CONVERSATION_PROTOCOL.md) | Design baseline | Session/Round 状态机、事件信封、顺序与不变量 |

## 16. 工程基线索引

| 文档 | 状态 | 内容 |
| --- | --- | --- |
| [Monorepo 与契约基线](docs/architecture/PROJECT_STRUCTURE.md) | Implemented | 工作区、配置分层、OpenAPI 生成链 |
| [密钥边界](docs/security/SECRET_BOUNDARIES.md) | Implemented | Public、Session Secret、Server Secret 边界 |
| [RAG 产品与评测基线](docs/architecture/RAG_PRODUCT_SCOPE_AND_EVALUATION.md) | Design baseline | 公开知识范围、答案路由、证据门禁与合成评测集 |
| [AiOrchestrator 边界](docs/architecture/AI_ORCHESTRATOR_BOUNDARY.md) | Implemented | 输入/输出 Port、Mock LLM、失败关闭与部署边界 |
| [模型配置与 Provider](docs/architecture/MODEL_CONFIGURATION_AND_PROVIDER_ADAPTER.md) | Implemented | 密钥、费用保护、方舟 Adapter 与调试契约 |
