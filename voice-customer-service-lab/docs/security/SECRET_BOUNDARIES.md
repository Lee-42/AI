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
4. `SecretValue.reveal()` 只能在 Provider/Telemetry Adapter 边界调用。
5. 日志禁止记录 Authorization、Cookie、RTC Token、Transcript 和完整订单号。
6. `.env.example` 只能包含空值或明显的假值。
7. 发现密钥进入 Git 后先轮换，再清理历史；只删除文件并不等于密钥安全。
8. 生产密钥由部署平台 Secret Store 注入，不把生产 `.env` 打进镜像。

## 4. 自动化门禁

- 测试确保公共配置响应不包含 `secret`、`token`、`app_key` 或 `access_key`。
- CI 对仓库和构建产物执行 Secret Scan。
- OpenAPI 示例不得包含真实 Token。
- Web 构建产物执行关键字扫描。
- Provider 启动前验证必要密钥，但错误消息只列变量名，不打印变量值。
