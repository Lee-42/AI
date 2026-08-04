# 自动化测试与故障注入

## 目标

实时语音系统的测试不能只证明“正常请求返回 200”。第 20 节建立四层门禁，并对最危险的
Provider 超时、清理失败和并发重复请求做确定性故障注入。

所有新增场景都使用 Mock Provider 和进程内 Fastify，不连接 RTC、火山引擎或其他云服务。

## 测试分层

| 层级 | 当前实现 | 证明什么 | 不证明什么 |
| --- | --- | --- | --- |
| 单元测试 | Vitest + 依赖注入 | 状态机、排序、重试、权限等纯逻辑 | 组件接线和真实网络 |
| 契约测试 | TypeBox + OpenAPI 漂移检查 | 成功/错误响应满足共享 Schema，生成类型未过期 | 消费者 UI 一定正确使用字段 |
| 进程内 E2E | Fastify `inject()` 关键旅程 | 路由、中间件、服务和 Mock Provider 能完整协作 | 浏览器、TCP、音频和真实 RTC |
| Staging 验收 | 后续的真实设备/RTC 检查 | 云资源、浏览器媒体、网络和音频体验 | 每次 PR 的快速反馈 |

测试数量通常从上到下递减。高层测试更接近用户，但更慢、更贵，也更容易受外部环境影响。

## 为什么契约测试需要两道门？

本项目的契约有两个容易独立漂移的产物：

1. API 运行时使用的 TypeBox Schema；
2. 从 OpenAPI 生成给 Web 使用的 TypeScript 类型。

`contract-conformance.test.ts` 用真实响应检查共享 Schema。`pnpm contract:check` 则重新导出
OpenAPI、重新生成类型，并要求 Git 中的产物没有差异。只做其中一个，仍可能出现“服务端
能跑，但客户端类型已过期”或“生成文件更新了，但运行时响应不合约”的问题。

## 关键旅程怎么选？

`voice-journey.e2e.test.ts` 只保留一条高价值旅程：

```text
创建 Session -> 启动 Agent -> 用户发言 -> 查询订单 -> 转人工 -> 关闭和最小摘要
```

它穿过 HTTP 校验、Session、Agent、业务工具、转人工和隐私摘要，但仍保持零云费用。不要
把每个边界条件都复制进 E2E；边界条件应主要留在快速的单元测试中。

这里的 E2E 是“API 进程内端到端”，不是浏览器或真实语音端到端。它不会证明麦克风权限、
音频首帧、真实 RTC 重连和主观音质。

## 确定性故障脚本

测试专用 `ScriptedAgentGateway` 按顺序消费结果：

```ts
const gateway = new ScriptedAgentGateway({
  start: [
    { outcome: "error", code: "AGENT_PROVIDER_TIMEOUT" },
    { outcome: "success", providerRequestId: "provider-start-recovered" },
  ],
});
```

同一个脚本每次运行都会先超时、再成功。它比 `Math.random() < 0.2` 更适合 CI，因为失败可
复现，且能明确断言每一步是否被消费。

`createDeferredGate()` 可以暂停一次 Provider 调用。并发测试先让第一个 Start 停在门闩，
再发出相同命令，最后放行，以稳定复现“两个请求同时到达”，不依赖脆弱的 `sleep(100)`。

故障注入器只位于 `test/support`：

- 不读取环境变量；
- 不注册 HTTP 管理接口；
- 不进入生产构建；
- 默认不连接任何外部服务。

生产系统若需要 Chaos Engineering，应使用有权限控制、审计、爆炸半径和一键停止能力的
独立平台，不能把测试后门带进应用。

## 当前故障矩阵

| 故障 | 预期 HTTP/状态 | 必须验证的恢复与副作用 |
| --- | --- | --- |
| Start 超时 | 504、`retryable=true` | 原幂等键重试成功，复用同一 Task ID |
| Stop 暂时不可用 | 502、Agent 进入 orphaned | 再次关闭先完成 Agent 清理，再结束 Session |
| 两个并发重复 Start | 一个 201、一个 200 replay | Provider 只收到一次 Start |

一个完整的故障测试至少验证：

1. 对外错误是否稳定且可重试语义正确；
2. 内部状态是否进入允许恢复的状态；
3. 外部副作用是否至多执行一次；
4. 故障解除后是否真的恢复；
5. 必要时，指标和日志能否发现这次故障。

只断言“返回了 500”几乎没有价值。

## 命令

```bash
# 全量 Vitest
pnpm test

# 重新生成契约、检查漂移，再校验运行时响应
pnpm test:contract

# 关键业务旅程
pnpm test:e2e

# 确定性 Provider 故障
pnpm test:fault

# 契约、类型、全量测试和静态检查
pnpm check
```

## CI 与真实 RTC 的建议分层

第 21 节再实现 CI。推荐节奏是：

- 每个 PR：类型、静态检查、单元、契约、进程内 E2E、故障测试；
- 合并后或每日：浏览器 E2E，使用虚拟麦克风和受控测试账号；
- 灰度前：真实设备、弱网、打断、音频首帧和 Agent 回收演练；
- 禁止在普通 PR 中默认调用付费 Provider。

测试通过代表“已覆盖的风险没有复现”，不代表系统没有未知风险。测试报告必须保留测试层级
和环境信息，避免把 Mock 结果描述成真实 RTC 可用性。
