# LangGraph Complete Guide Lab

《11 LangGraph全解析》的独立 TypeScript 练习项目。每个课程小节对应
`src/examples/` 中的一个编号示例。

## 环境要求

- Node.js 20+
- pnpm

## 安装与运行

```bash
nvm use
pnpm install
pnpm lesson:01
pnpm lesson:02
pnpm lesson:03
pnpm lesson:04
pnpm lesson:05
pnpm lesson:06
pnpm lesson:07a
pnpm lesson:07b
pnpm lesson:07c
pnpm lesson:07d
pnpm lesson:07e
pnpm lesson:07f
pnpm lesson:07g
pnpm lesson:08
pnpm lesson:09
pnpm check
```

第 01、02、07A、07C、07D、07F、07G、08 和 09 节不调用真实大模型，不需要 API Key。
第 03～06、07B 和 07E 节默认调用 LLM；运行这些示例前先复制环境变量模板并配置
OpenAI 或 DeepSeek：

```bash
cp .env.example .env
```

Provider 选择规则：

1. 设置 `LLM_PROVIDER=openai|deepseek` 时使用指定 Provider。
2. 未设置时优先使用已配置的 `OPENAI_API_KEY`。
3. 只配置 `DEEPSEEK_API_KEY` 时自动使用 DeepSeek。
4. `.env` 已被 `.gitignore` 忽略，不要把真实 API Key 写进源码。

## 当前示例

```text
src/examples/
  01-node-edge.ts            START -> normalize_name -> say_hello -> END
  02-conditional-routing.ts  evaluate_score -> celebrate / encourage
  03-email-intent-reply.ts   LLM classify -> conditional route -> LLM draft
  04-joke-prompt-chain.ts    LLM draft -> quality gate -> optional improve/polish
  05-parallel-story-merge.ts parallel story/joke/poem -> deterministic merge
  06-content-routing.ts      LLM route -> one selected story/joke/poem writer
  07a-workflow-pattern-selector.ts deterministic workflow pattern advisor
  07b-orchestrator-planner.ts LLM plan -> deterministic validation/numbering
  07c-send-dynamic-workers.ts approved plan -> dynamic Send worker tasks
  07d-worker-state-reducer.ts isolated workers -> ReducedValue -> sorted report
  07e-evaluator-optimizer.ts LLM/mock generate -> evaluate -> feedback loop
  07f-loop-safety-cost.ts bounded loop -> failure and cost controls
  07g-workflow-vs-agent.ts deterministic workflow vs fake-model agent
  08-store-item-basics.ts InMemoryStore put/get/update/search/delete
  09-store-namespaces.ts hierarchical namespace isolation and prefix queries
```

第 6 节还可以在命令行中替换默认创作请求，观察不同路由：

```bash
pnpm lesson:06 -- "用四行诗描写凌晨的机房"
```

第 07A 节会运行六个需求场景，并比较五种常见工作流模式：

```bash
pnpm lesson:07a
```

第 07B 节默认使用 LLM 动态规划章节；没有 API Key 时可以用 mock planner 完整运行
同一张图：

```bash
pnpm lesson:07b
pnpm lesson:07b -- --mock
pnpm lesson:07b -- --mock "为支付系统制定故障复盘报告"
```

第 07C 节从已批准计划中动态创建 `Send`。参数控制章节数，同一个已编译图会启动
对应数量的 Worker 实例：

```bash
pnpm lesson:07c
pnpm lesson:07c -- 2
pnpm lesson:07c -- 5
```

第 07D 节让动态 Worker 正式返回结果，通过 `ReducedValue` 汇总后按计划顺序合成：

```bash
pnpm lesson:07d
pnpm lesson:07d -- 2
pnpm lesson:07d -- 5
```

第 07E 节默认使用 LLM 生成并评价结果，也可以用 mock 完整观察反馈循环：

```bash
pnpm lesson:07e
pnpm lesson:07e -- --mock
```

第 07F、07G 节分别演示循环安全边界以及 Workflow/Agent 的区别：

```bash
pnpm lesson:07f
pnpm lesson:07g
```

第 08 节脱离 Graph 单独观察 Store Item 的创建、读取、更新、列举和删除：

```bash
pnpm lesson:08
```

第 09 节使用多组织、多用户数据学习 namespace 层级、精确读取、前缀查询与目录枚举：

```bash
pnpm lesson:09
```
