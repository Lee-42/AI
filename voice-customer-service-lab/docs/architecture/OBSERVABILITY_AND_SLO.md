# 可观测性与实时语音 SLO

第 19 节建立一条本地零费用、后端中立的观测链路：Pino JSON 日志、Prometheus 指标、
W3C Trace Context、可选 OTLP Trace 导出，以及把用户体验观察转换成错误预算的滚动 SLO
快照。

## 1. 三种信号回答不同问题

| 信号 | 适合回答 | 本项目实现 |
| --- | --- | --- |
| 日志 | 这个请求发生了什么？ | 每个请求一条安全 JSON 完成日志 |
| 指标 | 一段时间内整体是否恶化？ | Counter、Histogram 和固定低基数标签 |
| Trace | 时间花在哪个步骤？ | Web → API 的 `traceparent` 和可选 OTLP Server Span |

三者通过 `trace_id`、`span_id` 和 `correlation_id` 关联。`correlation_id` 是本项目的请求
定位号；`trace_id` 遵守 W3C 格式，可以跨服务传播；二者都不是用户身份或鉴权凭证。

结构化请求日志只包含：

```json
{
  "event": "http_request_completed",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "correlation_id": "cor_...",
  "http": {
    "operation": "createVoiceSession",
    "method": "POST",
    "route": "/api/v1/sessions",
    "status_code": 201,
    "duration_ms": 12
  }
}
```

项目关闭 Fastify 默认请求日志，避免实际 URL 中的 Session ID 被自动打印；日志不含请求
体、字幕、RTC Token、幂等键、Cookie、Authorization 或完整错误消息。

## 2. Trace Context 与 OTLP

浏览器为每个逻辑 HTTP 操作生成一个 W3C `traceparent`，重试继续使用同一个父上下文。
API 验证上游格式、保留 Trace ID、创建新的 Server Span ID，并在响应中返回新的
`traceparent` 和 `X-Correlation-Id`。无效或全零 ID 会被丢弃并重新生成。

默认 `.env` 不配置 OTLP，因此不会连接外部平台。配置后，Node OpenTelemetry SDK 使用
Batch Span Processor 将 API Server Span 发送到：

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=https://collector.example.com
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20example
```

通用 Endpoint 会按 OTLP 规则追加 `/v1/traces`；也可以直接给完整 Trace URL。Header 是
服务端 Secret，禁止进入 Web 和日志。生产环境优先把数据发给自管或托管 Collector，再由
Collector 路由到观测平台，避免应用绑定某家厂商。

当前 Trace 覆盖 Web → API Server Span；Provider HTTP、RTC 媒体链路和工具调用还没有
完整 Child Span。因此它是可扩展的真实 Trace 起点，不是“已经覆盖端到端”的声明。

## 3. 为什么指标标签不能放 Session ID

`/internal/metrics` 输出 Prometheus 文本，包括：

- `voice_api_http_requests_total`
- `voice_api_http_request_duration_seconds`
- `voice_realtime_sli_observations_total`
- `voice_realtime_sli_duration_seconds`
- `voice_agent_cleanup_total`
- `voice_agent_cleanup_duration_seconds`

指标只使用 `operation`、`method`、`status_class`、`sli`、`source`、`outcome` 和 `provider`
等固定集合。绝不把 Session、用户、订单、Room、Trace 或错误消息放进 Label。

每一种新 Label 组合都会创建新时间序列。将 Session ID 放进去不仅泄露关联信息，还会造成
高基数、存储费用和查询压力。需要定位单个请求时，应从指标跳到 Trace 或日志。

Prometheus Counter 必须单调递增，所以 `/internal/metrics` 展示进程启动以来的累计值；本地
SLO 快照使用单独的滚动观察窗口。二者用途不同，不能让 Counter 随窗口过期而下降。

## 4. SLI、SLO 和错误预算

- SLI：实际测量结果，例如 100 次中有 98 次在 2 秒内出现首个输出。
- SLO：团队同意的目标，例如至少 95% 在 2 秒内。
- SLA：对客户的合同承诺，本课程没有定义 SLA。
- Error Budget：允许的坏事件数量，即 `总事件 × (1 - SLO)`。

`/internal/observability/slo` 使用本地一小时滚动窗口：

| 指标 | 目标 | 当前证据 | 质量 |
| --- | --- | --- | --- |
| 控制面可用性 | ≥ 99.9% 非 5xx | API 服务端状态码 | authoritative |
| SLO-01 RTC 进房成功率 | ≥ 99% | 浏览器 `join()` 结果 | proxy |
| SLO-02 首个输出 | ≥ 95% 在 2 秒内 | 判停到状态/字幕首输出 | proxy |
| SLO-03 打断停止 | ≥ 95% 在 500ms 内 | 当前尚无音频停播帧证据 | no_data |
| SLO-04 Agent 回收 | ≥ 95% 在 60 秒内 | Stop Provider ACK | proxy |

`proxy` 很重要：浏览器收到字幕不等于收到可播放音频首帧，Stop API 成功也不一定等于
Provider 已进入可查询终态。生产完善方向是音频渲染回调、Provider 服务端事件和权威终态
查询，而不是删掉 `proxy` 标签。

SLO-05 重复副作用、SLO-06 长期密钥暴露、SLO-07 默认音频留存是必须为 0 的安全护栏，
主要依靠幂等约束、Secret 扫描和数据审计验证，不应被包装成“99% 就可以”的可用性比例。

样本少于 100 时 `sample_warning=true`，响应同时返回原始 `eligible_events` 和
`good_events`。零样本显示 `no_data`，不会显示虚假的 100%。

## 5. 浏览器 SLI 上报的隐私与可信度

浏览器只提交：

```json
{
  "observation_id": "obs_...",
  "sli": "turn_first_output",
  "source": "rtc",
  "outcome": "success",
  "duration_ms": 1250
}
```

Schema 不接受 Transcript、错误自由文本、用户或订单字段。同一个 Session 和
`observation_id` 只计一次；不存在的 Session 会被拒绝。

但当前课程还没有真实登录，浏览器数据也可能被篡改。因此它适合 RUM 趋势和本地教学，
不能单独作为付费 SLA 证据。生产需鉴权、限流、反滥用、版本/地域维度治理，并与服务端
和 Provider 证据交叉验证。

## 6. 本地窗口与生产窗口

```dotenv
OBSERVABILITY_WINDOW_SECONDS=3600
```

本地范围是 60～86400 秒，数据保存在进程内存，重启即清空。它便于理解算法和写测试，
不适合生产告警。生产通常使用持久指标后端计算经过业务评审的长滚动窗口，例如 28 天，
并使用多窗口燃烧率告警；不要直接对一次失败或短时百分比触发高优先级告警。

错误预算是决策工具，不是团队处罚分。预算耗尽时应暂停高风险发布、修复可靠性问题；目标
长期轻松达到时也应重新评审是否定得过松。

## 7. 接入 SLS / ARMS 时怎样映射

| 本项目信号 | 阿里云方向 | 注意事项 |
| --- | --- | --- |
| stdout JSON | Logtail → SLS Logstore | 只索引必要字段，设置保留期 |
| `/internal/metrics` | ARMS Managed Service for Prometheus 抓取 | 自定义指标可能收费，控制标签基数和抓取频率 |
| OTLP Trace | Collector → 支持 OTLP 的 Trace 后端 | Header 放 Secret Store，批量发送并设置采样 |

`/internal/metrics` 和 SLO 快照当前没有应用层鉴权，只能用于本地。生产必须放在私有网络、
ServiceMonitor/抓取 Agent 或带 mTLS 的内部网关之后，不能直接暴露公网。

## 8. 本地验证

```bash
curl -s http://127.0.0.1:8000/internal/metrics
curl -s http://127.0.0.1:8000/internal/observability/slo
```

完整测试验证了 Trace ID 连续性、无效 Trace 拒绝、观察幂等、滚动窗口、错误预算、低基数
Label、响应不含 Session ID、OTLP Header 解析和 Agent 回收指标。测试不启动 Collector，
也不产生云费用。

参考：

- [Google SRE Workbook：Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [Google SRE Workbook：Error Budget Policy](https://sre.google/workbook/error-budget-policy/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [Prometheus：Metric and label naming](https://prometheus.io/docs/practices/naming/)
- [阿里云 ARMS：Prometheus 自定义抓取](https://help.aliyun.com/en/arms/prometheus-monitoring/other-prometheus-service-discovery-configurations)
- [阿里云 SLS：日志数据模型](https://help.aliyun.com/zh/sls/product-overview/log)
