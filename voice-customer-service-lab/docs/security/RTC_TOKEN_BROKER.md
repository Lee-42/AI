# 服务端 RTC Token Broker

| 项目 | 当前决策 |
| --- | --- |
| Token 格式 | 火山 RTC Token `001` |
| 身份来源 | 服务端生成 `room_id` 与 `rtc_user_id` |
| 权限 | 仅当前房间和用户的发布、订阅 |
| TTL | 与 Session 同时过期，默认 20 分钟 |
| 长期密钥 | AppKey 只在 API 内存中使用 |
| 云调用 | 签名是本地 HMAC，不调用云 API |

## 1. 为什么要由服务端签发？

RTC Token 需要用 AppKey 做 HMAC 签名。若浏览器自己签名，就必须拿到 AppKey；
攻击者随后可以为任意房间和用户生成 Token，短期 Token 的限制也失去意义。

正确边界是：

```text
Browser
  POST /api/v1/sessions
        |
        v
API
  创建幂等 Session
  生成 room_id / rtc_user_id
  用 AppKey 在本地签名
        |
        v
Browser
  只收到 AppId、绑定身份、短期 Token、expires_at
```

AppId 是公开标识；AppKey 是长期秘密；RTC Token 是会话级秘密。Token 可以按需
交给浏览器加入房间，但不能进入 URL、日志、Analytics、OpenAPI 示例或
`localStorage`。

## 2. Session 与 RTC 身份如何绑定？

服务端当前使用：

```text
room_id    = session_id
rtc_user_id = usr_<随机 UUID>
```

创建请求不接受客户端传入 `room_id` 或 `user_id`。Token 内的 AppId、RoomId、
UserId 必须和客户端入房参数完全一致，包括大小写，否则 RTC 会把它当作无效
Token。

ID 只使用 `[A-Za-z0-9_@.-]`，最长 128 个字符，不包含姓名、手机号、订单号等
个人信息。本项目也拒绝通配房间 `*`；通配 Token 权限过大，不适合客服会话。

## 3. Token 里有什么？

Token `001` 的负载包含：

- 随机 `nonce`。
- 签发时间和绝对过期时间（Unix 秒）。
- RoomId 和 UserId。
- 发布、订阅权限及各权限过期时间。
- 用 AppKey 计算的 HMAC-SHA256 签名。

代码把 Token 和所有权限设为同一过期时间。默认：

```text
SESSION_TTL_SECONDS = 1200
MAX_SESSION_SECONDS = 900
```

正常会话最多 15 分钟，凭证 20 分钟过期，剩余 5 分钟用于退出和清理。若以后允许
更长会话，客户端要在 `onTokenWillExpire` 回调中向服务端请求新 Token，再调用
RTC SDK 的 `updateToken`；不能简单把 Token 改成永久有效。

## 4. 两个 Provider 为什么分开？

```dotenv
VOICE_PROVIDER=mock
RTC_TOKEN_PROVIDER=mock
```

`VOICE_PROVIDER` 控制是否启动真实 AI 语音服务，可能产生费用。
`RTC_TOKEN_PROVIDER` 只决定怎样在 API 本地签名：

| 组合 | 行为 |
| --- | --- |
| `mock + mock` | 完全本地，返回不可用于真实 RTC 的标记 Token |
| `mock + volcengine` | 本地生成真实格式 Token，但不入房、不启动 Agent |
| `volcengine + volcengine` | 后续课程的真实语音链路 |

因此本节可安全使用：

```dotenv
VOICE_PROVIDER=mock
RTC_TOKEN_PROVIDER=volcengine
VOLCENGINE_PAID_CALLS_ENABLED=false
```

签名本身不请求火山服务；只有后续真正加入 RTC 房间或启动 Agent 才进入云资源
路径。

## 5. HTTP 契约

请求：

```http
POST /api/v1/sessions
Idempotency-Key: web:<uuid>
Content-Type: application/json

{"locale":"zh-CN"}
```

响应结构：

```json
{
  "session": {
    "session_id": "ses_...",
    "room_id": "ses_...",
    "rtc_user_id": "usr_...",
    "provider": "mock",
    "state": "active",
    "revision": 1,
    "created_at": "2026-07-29T08:00:00.000Z",
    "expires_at": "2026-07-29T08:20:00.000Z"
  },
  "rtc_credentials": {
    "kind": "volcengine",
    "app_id": "<24-char-app-id>",
    "room_id": "ses_...",
    "user_id": "usr_...",
    "token": "[REDACTED]",
    "expires_at": "2026-07-29T08:20:00.000Z"
  },
  "events": [],
  "command_replayed": false
}
```

同一个 `Idempotency-Key` 不会创建第二个 Session；API 会返回原 Session 和一个
重新签名的短期 Token。因此“资源创建幂等”成立，但两次响应的 Token 字节不保证
相同。

## 6. 当前生产差距

当前课程 API 只监听本机，尚未接产品登录系统。生产部署前必须增加：

1. 验证用户身份，由服务端把 Session 绑定到内部主体。
2. 查询、刷新、结束接口都校验 Session 所有权。
3. 按用户、IP 和租户限流，限制活跃 Session 数。
4. 网关和 APM 也禁止记录 Token Response Body；API 已设置
   `Cache-Control: no-store`。
5. Session 和幂等记录迁移到有 TTL 的共享存储。

所以当前代码展示的是正确的密钥与签名边界，不代表“把这个本地端点直接暴露到
公网”就已经达到生产安全。

## 7. 自动化证据

- 固定测试向量与火山官方 Token `001` 实现逐字节一致。
- 测试拒绝通配身份、非法 ID 和已经过期的 Token。
- HTTP 测试确认 Response 中的 RoomId/UserId 与 Session 完全一致。
- Token Response 带 `Cache-Control: no-store`。
- 配置测试确认真实签名不需要开启付费语音开关。
- Web 只把凭证保存在 React 内存，不展示或持久化 Token。

官方依据：

- [火山引擎：使用 Token 完成鉴权](https://www.volcengine.com/docs/6348/70121)
- [火山引擎：RTC ID 参数规则](https://www.volcengine.com/docs/6348/70114)
- [火山引擎：官方 RTC Token Demo](https://github.com/volcengine/rtc-aigc-demo)
