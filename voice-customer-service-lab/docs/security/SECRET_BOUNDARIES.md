# 密钥与配置边界

## 1. 三层数据边界

```text
Browser public
  API Base URL、产品展示配置

Browser session-scoped
  session_id、room_id、user_id、短期 RTC Token、过期时间

Server secret
  RTC AppKey、AccessKey、SecretKey、Callback Secret、OTel Headers
```

“客户端能看到”不等于“公开到日志”。短期 Token 仍然是敏感凭证，只是泄露半径
受会话绑定和 TTL 限制。

## 2. 变量矩阵

| 变量 | 敏感级别 | 所属进程 | 允许提交 |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Public | Web | 示例值可以 |
| `APP_ENV` / `VOICE_PROVIDER` | Internal | API | 示例值可以 |
| `RTC_TOKEN_PROVIDER` | Internal | API | `mock` 可以 |
| `VOLCENGINE_VOICE_API_VERSION` | Internal | API | 示例值可以 |
| `VOLCENGINE_PAID_CALLS_ENABLED` | Internal safety switch | API | `false` 可以 |
| `VOLCENGINE_VOICE_CONFIG_PATH` | Internal | API | 示例路径可以 |
| VoiceChat `Config` 文件内容 | Secret | API | 不可以 |
| `VOLCENGINE_RTC_APP_ID` | Public identifier | API，按需返回 Web | 空模板可以 |
| `VOLCENGINE_RTC_APP_KEY` | Secret | API | 不可以 |
| `VOLCENGINE_ACCESS_KEY_ID` | Secret | API | 不可以 |
| `VOLCENGINE_SECRET_ACCESS_KEY` | Secret | API | 不可以 |
| RTC Token | Session secret | Web + RTC | 不可以 |
| `VOLCENGINE_CALLBACK_SIGNING_SECRET` | Secret | API | 不可以 |
| `OTEL_EXPORTER_OTLP_HEADERS` | Secret | API/Collector | 不可以 |

## 3. 强制规则

1. 根目录 `.env` 只由 API 读取；Vite 只读取 `apps/web` 内的环境文件。
2. 所有 `VITE_*` 都视为公开数据。
3. API 使用明确的 Response Schema，禁止返回或序列化整个 `ServerConfig`。
4. `SecretValue.reveal()` 只能在 RTC/Provider/Telemetry Adapter 边界调用。
5. 日志禁止记录 Authorization、Cookie、RTC Token、Transcript 和完整订单号。
6. `.env.example` 只能包含空值或明显的假值。
7. 发现密钥进入 Git 后先轮换，再清理历史；只删除文件并不等于密钥安全。
8. 生产密钥由部署平台 Secret Store 注入，不把生产 `.env` 打进镜像。
9. 运行时 IAM 身份使用独立子账号或角色，不使用主账号长期 AK/SK。
10. 配置密钥不等于允许付费；`VOLCENGINE_PAID_CALLS_ENABLED` 必须单独显式开启。
11. RTC Token 只保存在 React 内存；退出会话后立即清除，不写 `localStorage`。
12. VoiceChat `Config` 可能含模型凭证，只放 Secret Store 或 Git 忽略的本地文件。

注意：付费开关保护服务端 AI Provider，不会撤销已经下发给浏览器的 RTC Token。
真实 Token 的持有者仍可以在有效期内加入绑定房间，因此签发端点本身也必须鉴权、
限流和限制 TTL。

RTC Token Broker 的实现和生产鉴权差距见
[`RTC_TOKEN_BROKER.md`](RTC_TOKEN_BROKER.md)。

费用与权限的完整操作清单见
[`VOLCENGINE_RESOURCE_GUARDRAILS.md`](VOLCENGINE_RESOURCE_GUARDRAILS.md)。

## 4. 自动化门禁

- 测试确保公共配置响应不包含 `secret`、`token`、`app_key` 或 `access_key`。
- CI 对仓库和构建产物执行 Secret Scan。
- OpenAPI 示例不得包含真实 Token。
- Web 构建产物执行关键字扫描。
- Provider 启动前验证必要密钥，但错误消息只列变量名，不打印变量值。
