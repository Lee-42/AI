# Deep Agents TypeScript 学习工程

这个工程通过可运行示例学习 Deep Agents。目前包含 **Planning / Todo 任务规划机制**、
**Offload 上下文卸载机制**、**第一个完整 Demo**、**Virtual FS**、**超长上下文处理**和
**自定义 Tools**：既可以观察结构化计划，也可以验证上下文工程，并练习可靠的业务工具契约。

## 运行环境

- Node.js 20.19.4（见 `.nvmrc`）
- pnpm 9+
- Deep Agents JS 1.12.2

## 快速开始

```bash
cd deepagents-planning-lab
nvm use
pnpm install
cp .env.example .env
```

编辑 `.env`，配置 OpenAI 或 DeepSeek。然后运行：

```bash
pnpm example:env
pnpm lesson:02
pnpm lesson:03
pnpm lesson:05
pnpm lesson:06
pnpm lesson:07
pnpm lesson:08
pnpm lesson:09
pnpm lesson:10
pnpm lesson:11
pnpm lesson:12
pnpm lesson:13
pnpm lesson:15
```

只配置一个提供商时，请让 `LLM_PROVIDER` 保持为空，工程会根据已配置的 API Key 自动选择。只有在
同时配置了两个提供商、需要明确指定时，才设置 `LLM_PROVIDER=openai` 或
`LLM_PROVIDER=deepseek`。

运行类型检查和离线单元测试：

```bash
pnpm check
pnpm test
```

## 02 Planning / Todo 示例

```text
用户提出销售分析任务
        ↓
write_todos 创建 4～6 个任务
        ↓
todos 写入 Agent State
        ↓
读取本地模拟数据和验收规则
        ↓
每完成一步就替换完整 Todo 列表
        ↓
报告写入 StateBackend 虚拟文件系统
        ↓
所有任务 completed，返回最终回复
```

示例会打印每一次不同的 Todo 状态，便于观察：

```text
Todo 状态更新
1. ◉ [in_progress] 读取销售数据和分析规则
2. ○ [pending] 计算并核对核心指标
3. ○ [pending] 分析地区表现
4. ○ [pending] 写入并检查报告
```

## 关键代码

- `src/examples/02-planning-todo.ts`：创建 Deep Agent、启用 Todo、流式观察完整状态。
- `src/planning.ts`：Todo 去重输出、消息提取和虚拟文本文件读取。
- `src/examples/03-offload.ts`：触发自动 Offload，并用 `grep`、`read_file` 取回证据。
- `src/examples/05-first-demo.ts`：运行发布风险评估的第一个端到端 Deep Agent。
- `src/examples/06-virtual-fs.ts`：预置虚拟文件并练习六个内置文件工具。
- `src/examples/07-why-virtual-fs.ts`：离线比较完整文件和活跃消息工作集的大小。
- `src/examples/08-virtual-fs-long-text.ts`：对多份长文本执行锚点搜索、分页读取和证据索引。
- `src/examples/09-100k-context.ts`：对超过 10 万字语料执行分块、覆盖账本和 Map-Reduce 汇总。
- `src/examples/10-custom-tools.ts`：定义订单查询与退款写入工具，验证 Schema、业务错误和幂等性。
- `src/examples/11-subagents.ts`：由主 Agent 委派两个专业子 Agent，并验证结构化结果和上下文隔离。
- `src/examples/12-subagent-guardrails.ts`：验证任务契约、路由、输出预算、重试、并发和冲突防护。
- `src/examples/13-graph-vs-deepagent.ts`：比较架构选型，并运行 LangGraph 包裹 Deep Agent 的混合流程。
- `src/examples/15-interrupts.ts`：比较 Graph 节点级中断与 Deep Agent 敏感 Tool 审批中断。
- `src/offload.ts`：生成大型日志、识别卸载路径和提取工具轨迹。
- `src/config.ts`：OpenAI / DeepSeek 环境配置。
- `tests/*.test.ts`：不调用真实模型的离线测试。

当前 TypeScript 版本需要显式启用 Todo：

```ts
import { createDeepAgent } from "deepagents";
import { todoListMiddleware } from "langchain";

const agent = createDeepAgent({
  model,
  middleware: [todoListMiddleware()]
});
```

`write_todos` 只更新 Agent State 中的 `todos`，不会执行任务。每个 Todo 只有三种状态：
`pending`、`in_progress`、`completed`。

本例默认使用 `StateBackend`。报告存放在 Agent 的虚拟文件状态中，不会写入宿主机的
`/reports` 目录；程序结束前会从最终状态读取并打印报告。

## 03 Offload 示例

运行：

```bash
pnpm lesson:03
```

示例生成 5,000 行、超过默认卸载阈值的订单日志，并把唯一故障记录放在第 4,242 行：

```text
load_large_log 返回大型 ToolMessage
        ↓
FilesystemMiddleware 将完整结果写入 /large_tool_results/<id>.txt
        ↓
模型上下文只保留文件路径和开头预览
        ↓
grep 搜索 ORDER-A-4242
        ↓
read_file 分页读取目标行附近内容
        ↓
程序检查原文、工具轨迹和最终答案
```

默认 `StateBackend` 中的卸载文件是 Agent State 里的虚拟文件，不会写入宿主机根目录。

## 05 第一个完整 Demo

运行：

```bash
pnpm lesson:05
```

示例要求 Agent 评估一次软件发布是否满足门禁：

```text
用户目标
  ↓
write_todos 制订计划
  ↓
load_project_brief + load_release_policy 获取事实和规则
  ↓
逐项比较发布门禁
  ↓
write_file 生成报告
  ↓
read_file 复核报告
  ↓
完成 Todo，并返回“暂缓发布”结论
```

程序不只打印模型回答，还会检查必需工具是否调用、Todo 是否全部完成、报告是否存在，以及报告和最终
回复是否包含关键事实。默认 `StateBackend` 只把报告保存在本次 Agent State 中。

## 06 Virtual FS 使用

运行：

```bash
pnpm lesson:06
```

示例在调用 Agent 时向默认 `StateBackend` 注入两份输入文件，再要求模型完成：

```text
ls 查看目录
  ↓
read_file 读取两份材料
  ↓
write_file 创建 DRAFT-V1 报告
  ↓
read_file 后用 edit_file 精确替换为 FINAL-V1
  ↓
glob 查找 Markdown + grep 搜索风险编号
  ↓
read_file 复核并从 finalState.files 取回报告
```

`/workspace/...` 是 Agent 看到的虚拟路径。使用 `StateBackend` 时，它们对应 Agent State 中的文件数据，
不会在宿主机创建同名目录。

## 07 Virtual FS 解决了什么问题

运行：

```bash
pnpm lesson:07
```

示例使用 `FakeToolCallingModel`，不会消耗模型 API。它将 1,200 行日志预置在 `StateBackend`，只把搜索
命中和目标附近五行读入工具消息：

```text
完整日志保留在 Virtual FS
          ↓
ls → grep 风险编号 → read_file 局部证据
          ↓
write_file 保存精简风险报告
```

程序会打印初始文件字符量、模型消息轨迹字符量及其比例。比例只是本次执行的字符工作集对比，不是模型
的精确 token 用量。

## 08 Virtual FS 长文本处理

运行：

```bash
pnpm lesson:08
```

实验向 `StateBackend` 注入 3 份、共 3,600 行长文本，使用离线 Fake Model 执行：

```text
glob 发现语料文件
  ↓
grep 分别定位事件、政策、决策锚点
  ↓
read_file 按 offset/limit 读取命中附近内容
  ↓
write_file 建立带文件路径和行号的证据索引
  ↓
read_file 复核索引
```

程序会比较源文件总字符量和四次局部读取字符量，展示“原文留在 VFS，证据按需进入上下文”的处理方式。

## 09 10 万字上下文处理与优化

运行：

```bash
pnpm lesson:09
```

实验生成 10 份、超过 10 万字的中文语料，并模拟必须完整覆盖的审查任务：

```text
按章节保存原文
  ↓
按固定行数切块并保留少量重叠
  ↓
Map：逐块提取结构化风险并更新覆盖账本
  ↓
Reduce：去重、检查矛盾、合并证据
  ↓
生成风险索引和 coverage-ledger.json
```

这是离线架构实验，不调用模型 API。生产环境可以把 Map 步骤替换成模型调用或子 Agent，同时保留覆盖
账本、结构化结果和程序化验收。

## 10 自定义 Tools

运行：

```bash
pnpm lesson:10
```

示例用 `tool()` 定义一个只读工具和一个有副作用的写工具，再把它们传给 Deep Agent：

```text
get_order：核对订单事实
  ↓
create_refund_request：确认后创建退款申请
  ↓
使用相同 idempotencyKey 重试：复用第一次结果
```

程序不调用真实模型，会分别验收 Zod 参数校验、稳定业务错误、Agent 工具调用顺序和幂等写入。

## 11 Subagent 的设计与使用

运行：

```bash
pnpm lesson:11
```

示例把发布审查拆给两个工具权限不同的专业子 Agent：

```text
主 Agent
  ├─ task → api-reviewer  → API 结构化结论
  └─ task → data-reviewer → 迁移结构化结论
              ↓
         主 Agent 汇总发布门禁
```

实验使用 Fake Model，不调用模型 API。程序会验证两个子 Agent 各自执行了内部证据工具，而主 Agent
消息只包含 `task` 的精简结果，不包含子 Agent 的内部工具轨迹。

## 12 Subagent 注意事项

运行：

```bash
pnpm lesson:12
```

本实验不再重复 Agent API，而是在委派流程外增加一个确定性的控制平面：

```text
任务契约校验 → 路由白名单 → 有界并发 → 有限重试
       → 结果 Schema / 大小 / 证据校验 → 覆盖与冲突检查
```

程序故意提交不完整交接、错误专业路由和超大结果，并构造两个 API 审查者结论冲突，验证系统会拒绝
非法输入，并把冲突升级为 `NEEDS_HUMAN_REVIEW`。实验完全离线，不调用模型 API。

## 13 LangGraph 与 Deep Agents 的应用场景

运行：

```bash
pnpm lesson:13
```

示例先按开放程度、上下文规模、流程确定性、恢复与人工门禁需求，对五类任务进行启发式架构选型；随后
运行一个 Hybrid 流程：

```text
LangGraph 输入校验
  → Deep Agent 开放式证据分析
  → LangGraph 确定性政策门禁
```

Deep Agent 只负责发现事实，不能自行批准发布；最终 `APPROVE/HOLD/REJECT` 由 Graph 节点按显式规则
计算。示例使用 Fake Model，不调用模型 API。

## 15 Deep Agent 与 LangGraph 的中断区别

运行：

```bash
pnpm lesson:15
```

示例并排验证两种中断：LangGraph 在任意业务审批节点通过 `interrupt()` 暂停；Deep Agent 通过
`interruptOn` 在敏感 Tool 执行前暂停。两者都使用 Checkpointer、相同的 `thread_id` 和
`Command({ resume })` 恢复，但中断 Payload 与适用边界不同。

实验还验证：Graph 恢复时会从中断所在节点开头重放；Deep Agent 的人工决策可以批准、编辑或拒绝
Tool Call。本例将模型提出的群发地址编辑为发布负责人地址后才执行发信 Tool，全程不调用模型 API。

## 参考资料

- [Deep Agents JavaScript 文档](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [LangChain Todo middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in#to-do-list)
- [Deep Agents npm 包](https://www.npmjs.com/package/deepagents)
