# 会话数据、隐私与转人工

第 18 节实现两个产品承诺：结束会话时只生成最小结构化摘要；请求转人工时生成一张可
审计的演示工单，同时明确当前没有真人坐席接入。

这是一份工程设计，不是针对具体业务的法律意见。正式上线仍需根据业务目的、部署地域、
用户群体和供应商协议完成隐私评估。

## 1. 数据分层

| 数据 | 当前用途 | 当前保存位置 | 关闭后的行为 |
| --- | --- | --- | --- |
| 麦克风原始音频 | RTC 实时通信 | 浏览器/RTC 实时链路 | 应用不落盘 |
| 完整字幕 | 当前页面展示、Mock 幂等 | 浏览器内存；Mock Session 内存 | 新会话/刷新清除；服务端关闭时清除 Mock 回放数据 |
| 结构化摘要 | 客服结果和运营统计 | API 进程内存 | 默认最多 7 天 |
| 演示工单 | 表示用户已请求转人工 | API 进程内存 | 与摘要使用相同上限 |
| Session/Correlation ID | 关联状态与排障 | 控制面内存和结构化事件 | 按各自生命周期清理 |

摘要中仍有 `session_id`，因此它是可关联的去内容化记录，不等于匿名数据。不能因为去掉
姓名和原句就宣称已经匿名化。

中国《个人信息保护法》第六条要求明确、合理、直接相关的目的和最小范围，第十九条要求
保存期限原则上为实现目的所必要的最短时间。本项目据此把“默认全量保存 Transcript”改为
“默认只保存完成客服闭环所需的结构化事实”。这不表示 7 天适合所有企业；正式期限必须由
目的、合同、法律要求和删除机制共同决定。

## 2. 摘要为何不再调用一个 LLM

“把所有字幕再发给模型生成摘要”会增加：

- 一次新的数据传输和模型供应商处理；
- Prompt 注入影响摘要的风险；
- 额外 Token 成本和等待时间；
- 原始敏感信息进入新的日志、Trace 或缓存的机会。

当前摘要由确定性代码累积最少事实：

```json
{
  "outcome": "handoff_requested",
  "turn_count": 2,
  "topics": ["order_status", "human_handoff"],
  "sensitive_input_detected": true,
  "raw_audio_retained": false,
  "transcript_retained": false
}
```

服务端只在收到最终用户字幕时执行主题分类和高置信敏感模式检测，随后丢弃原文；重复事件
按 `event_id` 去重。`sensitive_input_detected=true` 只表示检测器命中，不保存命中的手机号、
密码或验证码，也不能替代正式 DLP 产品和人工流程。

订单工具只向摘要服务记录 `order_status` 标签，不复制工具结果。这样地址、手机号、订单
节点都不会为了“运营方便”再次进入摘要。

## 3. 明确的保留策略

```dotenv
SESSION_SUMMARY_RETENTION_DAYS=7
```

配置限制在 1～30 天。API reaper 会删除到期摘要和工单；尚未正常关闭的 Session 观察数据
也以 Session 到期时间为上限。当前存储是进程内 Map，所以进程重启会更早删除数据；生产
需要数据库 TTL/分区清理任务、删除失败告警和可验证的备份清理策略。

“数据库设置 TTL”仍不等于删除完成。对象存储、搜索索引、数据仓库、备份、日志、Trace
和客服导出都要进入同一数据清单和删除流程。

## 4. 转人工不是一句模型话术

MVP 没有真实呼叫中心，因此接口只能承诺：

```json
{
  "status": "recorded",
  "human_connected": false,
  "message": "已记录演示转人工工单；当前没有真人坐席接入。"
}
```

不能返回 `connected`、预计等待时间或真人姓名。模型即使说“已经转接”，也不会改变服务端
事实；UI 只展示 Handoff API 的结构化结果。

关闭流程为：

```text
用户明确点击转人工
  -> 浏览器停止采集并离开 RTC
  -> API Stop Agent（即使浏览器已调用过也安全）
  -> End Session
  -> 生成最小摘要
  -> 返回 ticket_id + human_connected=false
```

浏览器负责立即停止本地采集，服务端负责即使浏览器中途断开也停止 Agent 和 Session。
两边都做清理不是重复设计，而是不同故障域的防线。

## 5. 工单幂等和状态边界

一个 Session 最多一张 Handoff 工单：

| 请求 | 结果 |
| --- | --- |
| 第一次请求 | 创建工单并关闭 Session |
| 同原因、同一或不同幂等键重试 | 返回同一 `ticket_id`，`command_replayed=true` |
| 同 Session 改换原因 | `HANDOFF_ALREADY_REQUESTED` |
| 已结束且从未请求转人工 | `SESSION_NOT_ACTIVE` |

使用 Session 级唯一约束比只依赖浏览器幂等键更可靠，因为页面刷新或另一个标签页可能产生
新键。生产数据库应对 `session_id` 建唯一约束，并使用 Outbox 把工单可靠投递到真实客服
系统。第三方系统返回“已接收”与“真人已接通”必须是两个状态。

## 6. 严格 HTTP 契约

Handoff 请求只接受：

```json
{ "reason": "user_request" }
```

浏览器不能上传 `transcript`、自由文本摘要、客户 ID 或伪造的坐席状态。项目将 Fastify 的
AJV 设置为 `removeAdditional=false`：未知字段直接返回 400，而不是静默删除后继续执行。
这也强化了第 17 节工具参数的严格边界。

关闭响应使用 `Cache-Control: no-store`，日志不记录 Transcript、请求体、工单内容或敏感
值。OpenAPI 只暴露布尔标记和枚举标签。

`session_id` 只是资源标识符，不是身份凭证。当前课程还没有实现真实用户登录，所以接口仅
适合本地学习；生产环境必须在服务端鉴权中校验“当前用户或坐席是否有权操作这个
Session”，并对查看摘要、结束会话和转人工分别授权。随机且难猜的 ID 不能替代这项检查。

## 7. 当前真实 Provider 限制

Mock 文本轮次经过 API，因此服务端可以即时提取结构化标签。真实 RTC 字幕目前只在浏览器
内接收，尚未进入可信的服务端事件流；所以真实会话摘要可能只有工具标签，`turn_count`
可能为 0。

生产实现应从经过鉴权的 Provider 服务端事件或受控事件管线生成摘要，明确告知用途和
期限，并在进入日志/队列前脱敏。不应为了补齐统计而让浏览器在关闭时上传完整 Transcript。

本节同样没有实现真实客服系统、坐席排队、SLA、优先级、技能组路由或工单持久化；
`recorded` 只是课程内的演示终态。

## 8. 自动化证据

- 最终字幕事件重放不会重复增加轮次数。
- 手机号只产生一个布尔标记，关闭响应不含原值。
- 正常结束与 Handoff 都返回 `raw_audio_retained=false` 和
  `transcript_retained=false`。
- 同 Session 换幂等键仍返回同一工单。
- 更换 Handoff 原因和附加 Transcript 字段被拒绝。
- Session 结束后清除 Mock 原始轮次回放数据。
- 到期摘要和工单由 reaper 清理。
- 测试全部使用本地 Mock，不调用真实坐席、模型或云资源。

参考依据：

- [中国人大网：《中华人民共和国个人信息保护法》](https://www.npc.gov.cn/WZWSREL25wYy9jMi9jMzA4MzQvMjAyMTA4L3QyMDIxMDgyMF8zMTMwODguaHRtbD9yZWY9aW1i)
- [EUR-Lex：GDPR Article 5 数据最小化与存储限制](https://eur-lex.europa.eu/eli/reg/2016/679/art_5/oj)
