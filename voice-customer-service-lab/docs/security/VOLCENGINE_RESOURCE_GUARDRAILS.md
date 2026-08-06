# 火山资源、最小权限与费用保护

本项目使用当前的 **AI 音视频互动方案**，VoiceChat OpenAPI 固定为
`2025-06-01`。旧教程中的实时对话式 AI 和 `2024-06-01` 不是同一套商品与
集成路径。

## 1. 学习环境资源清单

| 资源 | 用途 | 本地保存 |
| --- | --- | --- |
| AI 音视频互动方案默认应用 | RTC 房间与 AI 对话归属 | AppId；AppKey 仅服务端 |
| 控制台智能体配置模板 | 生成 ASR、LLM、TTS 的配置片段 | 后续保存脱敏模板 |
| IAM 专用子账号 | 服务端签名调用 VoiceChat OpenAPI | AK/SK 仅在 `.env` |
| Tokens 资源包 | 抵扣 AI 交互 Tokens | 不保存，只监控余量 |
| 账单与资源包预警 | 提醒异常消费和余量不足 | 控制台配置 |

学习阶段优先使用系统首次开通时创建的默认应用。官方说明赠送 Tokens 只对该
默认应用生效；新建应用不能使用这份赠送额度。生产环境则应按
`dev / staging / prod` 拆分应用和密钥。

AppId 必须来自 **AI 音视频互动方案-应用管理**，并与生成 RTC Token 时使用的
AppId 完全一致，不能混用旧商品的 AppId。

## 2. 最小权限不是“给主账号一个 AK”

当前官方集成指引要求子账号具备 `RTCFullAccess`。它是较宽的系统策略，因此
这里用身份和资源范围继续收窄风险：

1. 主账号只负责开通服务、账单和 IAM，不进入应用运行时。
2. 创建项目专用 IAM 子账号，例如 `svc-voice-lab-dev`。
3. 只授予官方当前集成所需的 RTC 策略，不附加 IAM、财务或其他产品权限。
4. 将学习应用放入独立项目，并只把该子账号授权到这个项目。
5. AK/SK 只注入 API 服务；浏览器、仓库、日志和 OpenAPI 示例都不能出现。
6. 学习结束或疑似泄露后立即禁用并轮换，不长期复用个人管理员凭证。

以后若火山提供并验证了更细的 VoiceChat Action 策略，再将运行时权限缩小到
启动、停止、更新和查询任务。不要根据接口名称猜 IAM Action 并投入生产。

## 3. 费用到底从哪里来？

当前 AI 音视频互动方案主要按交互 Tokens 计费，官方当前标价是
`12 元 / 百万 Tokens`。声音复刻、第三方模型、记忆库、MCP 和视觉截图 TOS
等能力可能另外计费。

需要特别记住：

- 免费额度不是“账号永远免费”，它有应用范围和有效期。
- 免费 Tokens 用完后会转为按量后付费，不会天然停止服务。
- `StartVoiceChat` 返回成功只表示任务已下发，不表示 AI 已正常入房。
- 真人离开后，AI 任务默认还可能等待 180 秒，等待期仍会计费。
- `StopVoiceChat` 只让 AI 离房；真人还要 `leaveRoom`，客户端还要销毁 RTC
  引擎，通话才完整结束。

## 4. 三层费用保护

```text
第一层：控制台
  资源包余量预警 + 日账单消费预警

第二层：应用启动门
  Mock 默认 + 固定 API 版本 + 付费调用显式开关

第三层：运行时回收（后续课程实现）
  并发限制 + 最大时长 + IdleTimeout + Stop/leave/destroy + 对账回收
```

账单消费预警基于当日账单，通常次日上午通知，所以它不是实时熔断器。学习阶段
应同时配置资源包余量预警，并在应用内实施硬限制。

建议的学习策略：

| 项目 | 建议 |
| --- | --- |
| 云会话 | 人在场时逐次开启，不做无人值守循环测试 |
| 并发 | 先限制为 1 |
| 单次时长 | 第一次只测试 1～2 分钟 |
| 高费用能力 | 暂不开声音复刻、视觉、记忆库和付费 MCP |
| 结束 | 始终执行 Stop、leaveRoom、destroyRTCEngine |
| 复盘 | 每次测试后检查任务状态、资源包余量和账单 |

## 5. 代码中的付费开关

`.env.example` 默认：

```dotenv
VOICE_PROVIDER=mock
VOLCENGINE_VOICE_API_VERSION=2025-06-01
VOLCENGINE_PAID_CALLS_ENABLED=false
```

即使密钥已经配置，切换到 `VOICE_PROVIDER=volcengine` 时仍必须单独设置：

```dotenv
VOLCENGINE_PAID_CALLS_ENABLED=true
```

否则 API 在启动阶段失败。这个开关防止误操作，但不是预算系统；真正的并发、
次数和时长硬限制会在 Session 与 Agent 生命周期课程中接入持久化计数和资源
回收。

当前 Volcengine Provider 还未实现，因此本节不会向云端发起请求。不要在 API
Explorer 点击“发起调试”，该操作等同真实调用，可能产生费用。

## 6. 控制台验收清单

- [x] 已开通 RTC 和 AI 音视频互动方案。
- [x] 已确认默认应用 AppId，并确认赠送 Tokens 的额度、余量和到期日。
- [x] 已创建控制台智能体，暂不启用额外收费能力。
- [x] 已创建专用 IAM 子账号，而不是使用主账号 AK/SK。
- [x] 已将应用和子账号限制到学习项目。
- [x] 已配置 Tokens 资源包余量预警。
- [x] 已配置日账单消费预警，并确认通知联系人和渠道。
- [x] `.env` 只在本机，付费调用使用安全默认值 `false`。

只记录“已完成/未完成”和资源 ID 的脱敏尾号，不要在文档、截图或聊天中发送
AppKey、AK、SK、Token。

## 7. 官方依据

- [集成 AI 音视频互动方案](https://www.volcengine.com/docs/6348/2137641)
- [StartVoiceChat 2025-06-01](https://www.volcengine.com/docs/6348/2123348)
- [StopVoiceChat 2025-06-01](https://www.volcengine.com/docs/6348/2123349)
- [AI 音视频互动方案计费](https://www.volcengine.com/docs/6348/2123214)
- [RTC 应用权限管理](https://www.volcengine.com/docs/6348/70064)
- [设置账单消费预警](https://www.volcengine.com/docs/6269/942364)
