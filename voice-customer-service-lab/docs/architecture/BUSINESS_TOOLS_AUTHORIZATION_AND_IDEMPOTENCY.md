# 业务工具：授权、幂等与火山 Function Calling

第 17 节只接入一个只读工具：`get_order_status`。它用于讲清生产系统最重要的边界：

> 模型可以建议调用哪个工具并生成参数，但不能决定用户身份、数据权限，也不能直接访问
> 数据库或云凭证。

所有订单均为虚构演示数据，不会调用真实商城、支付系统或付费模型。

## 1. 端到端数据流

```text
用户说出订单号
  -> LLM 选择 get_order_status({ order_reference })
  -> 火山 POST 服务端回调
  -> 校验共享 Signature + AppId + 消息 Schema
  -> RoomID 映射到本地活动 Agent 和 Session
  -> Session 映射到服务端可信 tenantId/customerId
  -> tenant + customer + order 三个条件一次查询
  -> 只挑选允许返回的订单字段
  -> UpdateVoiceChat(Command=function, ToolCallID, Content)
  -> LLM 基于工具事实组织客服回复
```

`function.arguments` 是模型生成的不可信 JSON。即使其中偷偷加入 `customer_id`，严格
Schema 也会拒绝；真正的客户身份只来自 Session 的服务端绑定。

## 2. 工具目录为何要由代码管理

项目启动 Agent 前会移除控制台中的 `LLMConfig.Tools`、`MCP`、
`FunctionCallingConfig` 和联网搜索配置，再按代码中的白名单加入一个工具。这样可以回答：

- 当前模型究竟能调用哪些能力；
- 参数 Schema 是否经过代码评审；
- 控制台临时配置是否绕过了发布流程；
- 某项高风险写操作是否误进入生产。

当前工具只有 `order_reference` 一个输入，没有退款、改址、取消或任意 URL/SQL 参数。
Function Calling 未显式开启时，未评审的工具同样会被删除。

## 3. 对象级授权与最小数据返回

仓储查询同时使用：

```text
tenant_id = 当前 Session 的租户
customer_id = 当前 Session 的客户
order_reference = 模型提供并通过 Schema 的订单号
```

不能先按订单号查出完整记录，再在应用层“顺便判断”客户；复杂分支很容易漏掉授权。
`DEMO-9009` 属于另一位演示客户，当前 Session 查询它与查询不存在的 `DEMO-4040`
都会得到 `ORDER_NOT_FOUND`，避免泄露订单是否存在。

仓储记录故意带有虚构地址和手机号，但工具响应使用字段白名单，只返回履约状态、预计
日期和最新节点。生产系统还应限制日志、Trace 和模型上下文中的个人信息。

本实验尚未实现登录系统，因此默认 Principal 是服务端固定的演示客户。生产实现必须在
创建 Session 时，从已经验证的登录态绑定 `tenantId/customerId`，并在共享数据库中持久化；
不能接受浏览器、ASR、Prompt 或工具参数传入的客户身份。

## 4. 为什么 ToolCallID 还不够

火山会给每次工具请求一个 `ToolCallID`。项目使用
`sessionId + toolCallId` 作为幂等范围，并额外保存“工具名 + 规范化参数”的 SHA-256 指纹：

| 情况 | 行为 |
| --- | --- |
| 新 ID | 执行一次并缓存进行中的 Promise |
| 同 ID、同参数 | 复用第一次结果，`replayed=true` |
| 同 ID、不同参数 | 返回 `TOOL_CALL_ID_REUSED` |
| 两个并发相同请求 | 共享同一个进行中 Promise |

缓存 Promise 能防止两个同时到达的回调都穿透到仓储。当前 Map 只适合单进程学习；生产
需要 Redis/数据库唯一约束、结果保留期和多副本一致性。退款等写操作还必须使用业务
事务、状态机和领域幂等键，不能只依赖内存中的 ToolCallID。

这里保证的是“业务函数不重复执行”。如果工具结果已经送达火山、但回调 HTTP ACK 在
网络中丢失，服务端仍必须在重试时用同一 ToolCallID 再送一次结果，否则会丢结果；这属于
至少一次投递。接收方应按 ToolCallID 关联/去重，生产服务还应持久化执行结果与投递状态，
使用 Outbox 和可观测重试，不能宣称网络调用天然 exactly-once。

## 5. 火山回调的两个 JSON 层级

回调外层包含 `Type=tool_calls`、`Signature`、`RoomID`、`TaskID`、`AppId` 和字符串
`Message`。解析 `Message` 后，里面每个 `function.arguments` 仍然是 JSON 字符串，因此
需要第二次解析：

```json
[
  {
    "id": "call_order_001",
    "type": "function",
    "function": {
      "name": "get_order_status",
      "arguments": "{\"order_reference\":\"DEMO-1001\"}"
    }
  }
]
```

工具执行后，服务端调用 `UpdateVoiceChat`：

```json
{
  "Command": "function",
  "Message": "{\"ToolCallID\":\"call_order_001\",\"Content\":\"...\"}"
}
```

官方说明回调里的 `TaskID` 是服务商内部任务标识，适合排障。本项目不会拿它覆盖自己的
任务身份，而是根据已认证的 `AppId + RoomID` 找到启动 Agent 时保存的 `TaskId`，再用于
`UpdateVoiceChat`。

## 6. 回调安全边界

火山当前契约中的 `ServerMessageSignature` 是双方约定的共享字符串；回调收到后进行
比较。它不是包含时间戳和请求体摘要的 HMAC，因此不能单独提供新鲜度和防重放能力。

当前实现包括：

- 默认关闭 Function Calling；
- 只接受公网 HTTPS 回调地址；
- 固定时间比较 Signature，同时核对 AppId；
- 严格限制消息形状、数量、长度、工具名和参数；
- 只接受活动 Room/Agent，并以 ToolCallID 幂等；
- 日志脱敏 `Signature` 和 `ServerMessageSignature`。

生产入口还应在网关配置限流、请求体大小、超时、WAF/来源限制和告警。不要把共享签名
写进 URL、浏览器环境变量、源码或日志。轮换时应采用短暂双密钥窗口或可控发布流程。

## 7. 失败语义

回调本身未通过鉴权、外层格式错误或 Room 不活动时返回 HTTP 错误。已经通过鉴权后，
“订单不可见”“工具不允许”“参数错误”属于业务工具结果，会包装成安全 JSON 回传给
模型，而不是返回 HTTP 4xx 诱发服务商无意义重试。

服务端返回给模型的错误不会包含数据库详情、其他客户身份或上游内部错误。模型只能据此
请用户核对订单号或转人工，不能声称订单不存在于整个系统。

## 8. 配置与费用保护

本地零费用练习保持：

```dotenv
VOICE_PROVIDER=mock
VOLCENGINE_PAID_CALLS_ENABLED=false
VOLCENGINE_FUNCTION_CALLING_ENABLED=false
```

只有准备好受控云验证时，才在原有真实 Agent 配置之外设置：

```dotenv
VOLCENGINE_FUNCTION_CALLING_ENABLED=true
VOLCENGINE_FUNCTION_CALLBACK_URL=https://your-api.example.com/internal/provider-callbacks/volcengine/function-calls
VOLCENGINE_CALLBACK_SIGNING_SECRET=使用密码管理器生成的随机值
```

开启它会走真实 Voice Agent、LLM 和 RTC 计费链路。先用 Mock 接口完成授权、幂等和契约
测试，再安排几十秒的监督测试并立即停止 Agent。

## 9. 自动化证据与剩余工作

自动化测试证明：

- 私有地址和手机号不会进入工具响应；
- 越权订单与不存在订单表现一致；
- 额外参数和非白名单工具被拒绝；
- 并发重试只查一次，同 ID 换参数被拒绝；
- 回调双层 JSON、签名、活动 Room 绑定和 `UpdateVoiceChat` 消息正确；
- 所有测试都使用 Fake/Mock，不访问真实云服务。

当前仍不是生产订单系统：没有登录、持久化 Principal、共享幂等库、审计存储、工具超时
预算和人工转接。这些限制是显式的，不能用演示固定客户替代真实鉴权。

官方依据：

- [火山引擎 Function Calling](https://www.volcengine.com/docs/6348/1554654?lang=zh)
- [StartVoiceChat 2025-06-01：Tools 与 FunctionCallingConfig](https://www.volcengine.com/docs/6348/1807452?lang=zh)
- [UpdateVoiceChat：Command=function 与 ToolCallID](https://api.volcengine.com/api-explorer/debug?action=UpdateVoiceChat&groupName=%E6%99%BA%E8%83%BD%E4%BD%93&serviceCode=rtc&version=2024-12-01)
