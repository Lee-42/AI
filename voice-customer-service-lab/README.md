# AI 实时语音客服实验项目

这是课程第 14 章的 Monorepo。当前已经完成 Web、API、Mock Voice Provider、
服务端 RTC Token Broker、浏览器 RTC Client Adapter，以及可键盘和读屏使用的客服对话界面。

## 目录

```text
apps/api             Fastify TypeScript 控制面
apps/web             React 浏览器客户端
packages/contracts   TypeBox Schema 与生成的 HTTP 契约
docs                 SPEC、ADR、协议和安全设计
```

## 本地准备

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm contract:generate
```

默认使用 `VOICE_PROVIDER=mock`，可以练习 Session、RTC Token 和 AI Agent 生命周期，
但不会启动真实云 Agent。真实模式还受独立费用开关和本地 Voice Config 文件保护。
即使填入火山凭证，付费路径也默认关闭；资源与费用检查清单见
[`VOLCENGINE_RESOURCE_GUARDRAILS.md`](docs/security/VOLCENGINE_RESOURCE_GUARDRAILS.md)。

第 07 节可把 `RTC_TOKEN_PROVIDER` 单独改为 `volcengine`，用服务端 AppKey
在本地生成真实格式的短期 Token；这不会加入 RTC 房间或启动 AI Agent。安全边界
见 [`RTC_TOKEN_BROKER.md`](docs/security/RTC_TOKEN_BROKER.md)。

第 08 节只有点击“加入 RTC 房间”才会连接云端。浏览器设备和清理流程见
[`BROWSER_RTC_CLIENT.md`](docs/architecture/BROWSER_RTC_CLIENT.md)。

第 09 节只有入房后明确点击才启动 Agent。默认返回 Mock 生命周期；真实
`StartVoiceChat` 配置与回收策略见
[`AI_AGENT_LIFECYCLE.md`](docs/architecture/AI_AGENT_LIFECYCLE.md)。

第 10 节监听 Bot 进退房和 VoiceChat 的 `conv` / `subv` 二进制消息，并按轮次、
序号去重排序。协议和隐私边界见
[`RTC_MESSAGES_AND_ORDERING.md`](docs/architecture/RTC_MESSAGES_AND_ORDERING.md)。

第 11 节把技术演示页收敛成客服对话工作区：操作按旅程排序，流式字幕不会逐字播报，
用户向上阅读时也不会被自动滚动打断。可访问性边界和手动验收见
[`CONVERSATION_UI_ACCESSIBILITY.md`](docs/architecture/CONVERSATION_UI_ACCESSIBILITY.md)。

第 12 节固定服务端自动判停边界，并把 Mock/RTC 事件归一成同一套轮次状态。VAD 参数、
事件证据和“观察延迟”的测量限制见
[`VAD_AND_TURN_DETECTION.md`](docs/architecture/VAD_AND_TURN_DETECTION.md)。

第 13 节让 Provider 停播与客户端作废旧 Round/Response 协同工作，阻止迟到字幕和异步
结果复活旧回答。插话参数、代际守卫和竞态矩阵见
[`BARGE_IN_CANCELLATION_AND_RACES.md`](docs/architecture/BARGE_IN_CANCELLATION_AND_RACES.md)。

第 14 节使用 RTC SDK 自动重连加应用恢复窗口，并让所有可自动重试的控制命令复用原
幂等键。超时预算、Token 更新、重试矩阵和持久化边界见
[`WEAK_NETWORK_RETRY_AND_IDEMPOTENCY.md`](docs/architecture/WEAK_NETWORK_RETRY_AND_IDEMPOTENCY.md)。

第 15 节支持通话中切换麦克风、设备拔出后的确定性回退，并在首次采集前配置浏览器
基础降噪、回声消除和自动增益。权限分类、音量诊断和 AI 降噪边界见
[`AUDIO_DEVICE_QUALITY_AND_PERMISSIONS.md`](docs/architecture/AUDIO_DEVICE_QUALITY_AND_PERMISSIONS.md)。

第 16 节把客服角色、范围、隐私和降级话术放入服务端校验的版本化策略，覆盖控制台
散落 Prompt，并把策略版本写入 Agent 快照。Prompt 注入、真正授权边界和残余风险见
[`PROMPT_POLICY_AND_SAFETY_BOUNDARIES.md`](docs/architecture/PROMPT_POLICY_AND_SAFETY_BOUNDARIES.md)。

第 17 节接入只读订单工具：模型只生成工具名和订单号，服务端从 Session 绑定客户身份，
执行对象级授权、字段白名单和 ToolCallID 幂等。火山回调与本地零费用练习见
[`BUSINESS_TOOLS_AUTHORIZATION_AND_IDEMPOTENCY.md`](docs/architecture/BUSINESS_TOOLS_AUTHORIZATION_AND_IDEMPOTENCY.md)。

第 18 节让普通结束和转人工走同一套可靠关闭流程，只生成结构化最小摘要。演示工单明确
标记没有真人接入，并按 Session 防重复。数据分层、保留边界和真实 Provider 限制见
[`SESSION_DATA_PRIVACY_AND_HANDOFF.md`](docs/architecture/SESSION_DATA_PRIVACY_AND_HANDOFF.md)。

第 19 节贯通结构化日志、低基数 Prometheus 指标、W3C Trace Context、可选 OTLP Trace
导出与本地滚动 SLO 快照。哪些指标只是代理证据、错误预算算法和 SLS/ARMS 映射见
[`OBSERVABILITY_AND_SLO.md`](docs/architecture/OBSERVABILITY_AND_SLO.md)。

第 20 节把测试分成单元、契约、进程内 E2E 和 Staging 验收，并用测试专用脚本稳定注入
Provider 超时、清理失败和并发重复请求。测试边界、故障矩阵和 CI 分层建议见
[`TESTING_AND_FAULT_INJECTION.md`](docs/architecture/TESTING_AND_FAULT_INJECTION.md)。

第 15 章第 01 节先冻结 RAG 的公开知识范围、答案路由、无证据拒答规则和合成评测集，
暂不引入向量库或真实模型。产品边界、指标口径和练习见
[`RAG_PRODUCT_SCOPE_AND_EVALUATION.md`](docs/architecture/RAG_PRODUCT_SCOPE_AND_EVALUATION.md)。

第 15 章第 02 节用六边形架构建立 `AiOrchestrator` 输入 Port，以及 Router、Retriever、
LLM 和答案策略输出 Port；当前留在 API 进程内，并用确定性 Mock LLM 零费用验证。边界与
部署决策见
[`AI_ORCHESTRATOR_BOUNDARY.md`](docs/architecture/AI_ORCHESTRATOR_BOUNDARY.md)。

第 15 章第 03 节增加独立 LLM 配置、两阶段费用开关、火山方舟 Chat Completions Adapter，
以及默认关闭且仅限 local/test 的 Session 绑定调试 API。配置与密钥边界见
[`MODEL_CONFIGURATION_AND_PROVIDER_ADAPTER.md`](docs/architecture/MODEL_CONFIGURATION_AND_PROVIDER_ADAPTER.md)。

## 本地学习流程

分别启动：

```bash
pnpm dev:api
pnpm dev:web
```

打开 `http://localhost:5173`：

1. 点击“创建会话”。
2. 点击“检查麦克风”，允许权限并选择输入设备。
3. 点击“加入语音房间”，短暂验证后点击“停止 AI 并退出房间”。
4. 入房后点击“连接 AI 客服”，确认 Provider 为 `mock`。
5. 点击“停止 AI”。
6. 输入一句 Mock 话语；在 AI 思考或输出时再次发送，观察上一轮变成“已打断”。
7. 使用“弱网故障注入（Mock）”分别观察恢复成功和超时清理。
8. 切换“客服语音优化/原始音频”；真实 RTC 下可观察音量并热切换麦克风。
9. 连接 Mock Agent，在连接详情中确认绑定的 Prompt Policy 版本。
10. 用 Mock 工具接口查询 `DEMO-1001`，再尝试不可见的 `DEMO-9009`。
11. 点击“转人工（演示工单）”，确认没有伪装真人已接入，并检查最小摘要。
12. 新建会话后点击“结束本次客服会话”，观察普通结束摘要与资源清理事件。
13. 打开 `/internal/metrics` 和 `/internal/observability/slo`，核对无数据、样本警告和错误预算。

只使用 Mock Agent 时，文本框和事件延迟仍来自 Mock Adapter。切换真实 Agent 后，
页面会优先展示经过校验、排序的 RTC 字幕。Mock 设计说明见
[`MOCK_VERTICAL_SLICE.md`](docs/architecture/MOCK_VERTICAL_SLICE.md)。

## 常用命令

```bash
# API
pnpm dev:api

# Web
pnpm dev:web

# 重新生成 OpenAPI 和 TypeScript 类型
pnpm contract:generate

# 契约、类型、测试与静态检查
pnpm check

# 契约漂移与运行时响应校验
pnpm test:contract

# 零云费用关键旅程
pnpm test:e2e

# 确定性故障注入
pnpm test:fault

# RAG 产品边界与评测数据集校验（零模型费用）
pnpm test:rag-baseline

# AiOrchestrator Port、证据门禁与 Mock LLM
pnpm test:ai-orchestrator

# 模型配置、方舟 Provider Adapter 与调试 API（Fake Fetch，零模型费用）
pnpm test:ai-provider

# 三个工作区的生产构建
pnpm build
```

不要把 `VOLCENGINE_*`、Token 或可识别用户的信息写入 Web 环境变量、源码、
OpenAPI 示例或日志。页面只显示凭证已签发，不显示 Token 内容。
