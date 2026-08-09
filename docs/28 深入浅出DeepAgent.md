# 28 深入浅出DeepAgent

这一章学习如何让 Agent 从“完成一次简单工具调用”，升级为能够处理复杂、开放、长时程任务的
智能体系统。学习重点不是背诵某个版本的 API，而是理解规划、上下文管理、文件系统、子 Agent
和可靠执行怎样协同工作。

## 学习进度

- [x] 01 定义：Deep Agent 到底是什么
- [x] 02 Planning / Todo 任务规划机制
- [x] 03 Offload 与上下文管理
- [x] 04 Deep Agent 适用场景
- [x] 05 第一个 Demo
- [x] 06 Virtual FS 使用
- [x] 07 虚拟 FS 解决的问题
- [x] 08 虚拟 FS 长文本处理
- [x] 09 超长上下文优化
- [x] 10 自定义工具
- [x] 11 子 Agent 的设计与使用
- [x] 12 子 Agent 的注意事项
- [x] 13 Deep Agent 与 LangGraph 的应用边界
- [ ] 14 酒店客服 AI 系统架构案例
- [x] 15 Deep Agent 与 Graph 中断的区别

> 第 02 节 Planning / Todo 是补充的前置知识；从第 03 节开始，编号与 `course.json` 中的课程顺序一致。

---

## 01 定义：Deep Agent 到底是什么

### 本节目标

学完这一节，应该能够：

- 用一句话解释 Deep Agent；
- 说明名称中的 “Deep” 指什么、不指什么；
- 区分普通 Agent、Deep Agents、LangChain 和 LangGraph；
- 说出 Deep Agent 要解决的核心工程问题；
- 判断一个任务是否真的需要 Deep Agent；
- 识别其他常见 Harness，并与 Agent 框架、协议区分。

本节主要依据 LangChain 官方的 [Deep Agents 概览](https://docs.langchain.com/oss/python/deepagents/overview)、
[框架、运行时与 Harness 的区别](https://docs.langchain.com/oss/python/concepts/products)、
[Deep Agents 开源仓库](https://github.com/langchain-ai/deepagents)以及
[Deep Agents v0.7 发布说明](https://www.langchain.com/blog/deep-agents-v0-7)整理。

### 1. 先理解普通 Agent

普通 LLM 只能根据输入生成输出；Agent 则把模型放进一个可以反复调用工具的执行循环：

```text
用户目标
   ↓
模型判断下一步
   ↓
直接回答 ───────────────→ 结束
   │
   └─ 调用工具 → 获得结果 → 放回上下文 → 再次判断
```

这个循环通常称为 **Agent Loop**。模型负责判断下一步行动，工具负责读取外部信息或改变外部状态，
运行时负责保存消息、执行工具并把结果送回模型。

因此，普通 Agent 的最低成立条件可以概括为：

```text
Agent = 模型 + 工具 + 循环控制
```

它很适合天气查询、订单查询或一次数据库检索等短任务。但是，“能够循环调用工具”并不等于“能够
稳定完成一个持续几十步的复杂任务”。

### 2. Deep Agent 的一句话定义

> **Deep Agent 是一种为复杂、开放、长时程任务准备的、带有较完整默认能力的 Agent Harness；
> 它仍使用普通的模型—工具循环，但额外提供上下文管理、文件系统、任务分解、子 Agent、记忆和
> 执行控制等工程能力。**

这里的 **Harness** 可以理解为“智能体工作台”或“智能体运行外壳”：它把模型、提示词、工具、
中间件、状态、存储和运行时组合成一套开箱可用的工作环境。

需要区分两个容易混用的说法：

- **deep agent**：描述一类能够进行长时程、复杂工作的智能体系统；
- **Deep Agents / `deepagents`**：LangChain 团队提供的具体开源 Agent Harness 和软件包。

本章标题沿用课程中的 “DeepAgent”，正文在指具体产品时使用官方名称 **Deep Agents**。

### 3. “Deep” 到底深在哪里

这里的 “Deep” 不是“神经网络层数更多”，也不是使用了一个叫 DeepAgent 的新基础模型。它强调的
是智能体完成任务的**工作深度**：任务持续时间更长、步骤更多、上下文更大，而且需要不断根据
中间结果调整行动。

一个深度研究任务可能包含：

1. 澄清目标和交付物；
2. 拆分研究问题；
3. 搜索并筛选资料；
4. 把大量原始内容写入文件；
5. 委派子 Agent 分别调查不同主题；
6. 比较证据并处理冲突；
7. 生成初稿；
8. 检查遗漏后修改；
9. 输出带来源的最终报告。

“深”来自这种持续规划、行动、存储、反思和修正的过程，不来自名称本身。给普通 Agent 增加很多
工具，也不会自动让它变成可靠的 Deep Agent。

### 4. 它在技术栈中的位置

可以用下面的分层关系理解 LangGraph、LangChain 与 Deep Agents：

```text
┌────────────────────────────────────────────┐
│ 业务应用：研究助手、编码助手、数据分析助手 │
├────────────────────────────────────────────┤
│ Deep Agents：带完整默认能力的 Agent Harness│
├────────────────────────────────────────────┤
│ LangChain：模型、工具、中间件和 Agent 框架 │
├────────────────────────────────────────────┤
│ LangGraph：状态、持久化、流式与中断运行时   │
└────────────────────────────────────────────┘
```

| 层次 | 主要职责 | 什么时候直接使用 |
| --- | --- | --- |
| LangGraph | 控制状态图、节点、边、检查点、中断和持久化 | 执行流程需要精确控制或确定性分支时 |
| LangChain | 提供模型、工具、中间件和基础 Agent 抽象 | 只需要轻量 Agent 循环并想自行组装能力时 |
| Deep Agents | 在基础 Agent 上预装长任务所需的工作能力 | 希望快速构建开放、复杂、长时程 Agent 时 |
| 业务应用 | 加入领域工具、权限、数据、提示词和交付标准 | 面向真实用户解决具体问题时 |

它们不是三个互相排斥的竞品。Deep Agents 构建在 LangChain 的 Agent 抽象之上，并使用 LangGraph
作为运行时；需要时还可以把自定义 LangGraph 图作为子 Agent 接入。

### 5. 普通 Agent 为什么不够

任务一旦变长，困难往往不再是“模型会不会调用工具”，而是以下工程问题：

| 长任务中的问题 | 典型表现 | Deep Agent 的应对思路 |
| --- | --- | --- |
| 目标容易丢失 | 做了很多动作，却忘记最终交付物 | 分解任务并跟踪进度 |
| 上下文不断膨胀 | 工具返回值塞满上下文窗口 | 摘要、Offload 和按需读取 |
| 中间产物无处安放 | 搜索结果、草稿和代码都挤在消息中 | 用文件系统作为外部工作空间 |
| 子任务互相干扰 | 多个主题的资料混在主对话里 | 用子 Agent 隔离上下文 |
| 长时间运行容易中断 | 失败后只能从头再来 | 依靠运行时状态和检查点恢复 |
| 敏感操作风险高 | 模型可能直接写文件或执行命令 | 权限、沙箱和人工审批 |

Deep Agent 的价值不是让模型“突然变聪明”，而是改善模型所处的工作环境，使有限的上下文和不稳定
的逐步决策能够支撑更长、更复杂的任务。

### 6. 核心能力

理解 Deep Agent 时，可以抓住下面六类能力：

| 能力 | 作用 |
| --- | --- |
| 任务规划与跟踪 | 把大目标拆成步骤，记录完成状态，并随新信息调整计划 |
| 文件系统与 Offload | 把资料和中间产物移出对话上下文，需要时再按路径读取 |
| 上下文管理 | 压缩旧消息、转存过大的工具结果，控制送入模型的信息量 |
| 子 Agent 委派 | 让专门的 Agent 在隔离上下文中处理子任务，再返回精炼结果 |
| 记忆与 Skills | 跨会话保留规则，并按需加载可复用的领域流程和知识 |
| 可靠执行控制 | 借助检查点、流式输出、沙箱、权限和人工审批控制长任务 |

早期资料常把 Deep Agent 概括为四个要素：**详细系统提示词、规划工具、文件系统、子 Agent**。
这个概括有助于理解设计起点，但不能当作永久不变的 API 定义。Deep Agents v0.7 已移除默认基础
系统提示词，并把待办规划中间件改为可选能力；文件系统、上下文管理和委派等 Harness 思想仍然
保留。因此，判断 Deep Agent 应看它是否为长时程工作提供了一整套上下文工程与执行机制，而不是
机械检查某个默认工具是否存在。

### 7. 运行时的心智模型

Deep Agent 仍然没有脱离 Agent Loop，只是每一轮拥有更多管理长任务的手段：

```text
接收目标
   ↓
理解并分解任务（按需）
   ↓
模型选择下一步行动
   ├─ 调用业务工具
   ├─ 读写文件或转存大结果
   ├─ 委派子 Agent
   ├─ 更新任务进度
   └─ 请求人工批准敏感操作
   ↓
读取必要结果，继续推理与修正
   ↓
验证交付物并返回最终结果
```

文件系统在这里更像 Agent 的“外部工作记忆”。它不一定是用户电脑上的真实目录，也可以由内存
状态、持久化存储或远程沙箱实现。文件路径只是 Agent 访问中间产物的统一接口。

子 Agent 也不是必经步骤。只有当子任务适合并行、需要专门工具，或大量细节会污染主 Agent
上下文时，委派才有价值。

### 8. 怎样判断是否需要 Deep Agent

可以连续问三个问题：

1. 任务是否开放，无法在开发时写死全部步骤？
2. 任务是否要经历较多步骤，并产生大量中间资料或文件？
3. 任务是否需要动态改计划、隔离子任务或跨较长时间保持状态？

如果多数答案是“是”，Deep Agent 往往合适。例如深度研究、复杂编码、数据分析和多文档报告生成。

如果只是查一次天气、调用一次订单 API，普通 Agent 更简单；如果流程和分支都能预先确定，例如
固定的订单审批流，则应优先考虑普通代码或显式 LangGraph 工作流。实际系统也经常混合使用：
外层用确定性工作流控制关键步骤，某些节点内部再运行 Deep Agent 处理开放任务。

### 9. 除了 Deep Agents，还有哪些 Harness

“Agent Harness”没有完全统一的行业边界。可以用一个实用标准判断：它是否不只提供模型调用 API，
而是同时提供 Agent Loop、工具执行、工作区或文件系统、上下文管理、权限以及状态恢复等运行脚手架。

| 方案 | 更准确的定位 | 主要能力侧重 | 主要约束 |
| --- | --- | --- | --- |
| Deep Agents | 通用长任务 Harness | Planning、Filesystem、Offload、Summarization、Subagent、Backend | 完整脚手架会增加成本和调试面 |
| [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) | 接近完整 Harness | Claude Code 的 Agent Loop、文件与命令工具、上下文、子 Agent、权限和 Session | 主要使用 Claude |
| [OpenAI Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) | 编程专用 Harness | 启动、继续和恢复 Codex 编程线程，适合仓库任务与 CI/CD | 聚焦编程和 Codex 生态 |
| [OpenHands SDK](https://docs.openhands.dev/sdk/index) | 开源编程 Agent Harness | 推理循环、Bash/文件工具、Workspace、上下文压缩、安全分析和沙箱 | 以 Python/REST 为主，系统较重 |
| [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/quickstart) | 通用 Agent 编排 SDK | Agent Loop、Tools、Handoffs、Guardrails、Session、HITL、Tracing；可使用 [Sandbox Agents](https://developers.openai.com/api/docs/guides/agents/sandboxes) | 比 Deep Agents 更轻，需要自行组合部分规划和上下文策略 |

其中，Claude Agent SDK 在完整度上最接近 Deep Agents；Codex SDK 和 OpenHands 更偏软件工程；
OpenAI Agents SDK 更偏通用业务 Agent 编排。选择时要先看任务和模型生态，不应只比较工具数量。

还要注意以下概念并不完全属于同一层：

- LangGraph、Google ADK、Microsoft Agent Framework、AutoGen、CrewAI、PydanticAI 通常更接近框架或编排器；
- MCP 是连接模型与外部工具的协议；
- 模型厂商的 Client SDK 主要负责调用模型 API；
- Harness 则进一步提供一套可以直接工作的执行循环和运行环境。

所以这些产品可以组合使用。例如外层用 OpenAI Agents SDK 或 LangGraph 编排多个业务 Agent，再把
Codex 作为编程专家；也可以用 OpenHands 或 Deep Agents 自己承担完整的执行循环。

### 本节结论

```text
Deep Agent ≠ 新模型
Deep Agent ≠ 工具数量很多的普通 Agent
Deep Agent ≠ 必须使用多个 Agent

Deep Agent = 基础 Agent Loop
           + 面向长时程任务的上下文工程
           + 文件与中间产物管理
           + 按需规划和任务委派
           + 持久化、权限、审批等可靠执行机制
```

最重要的一句话是：**Deep Agent 的“深”体现在它能够组织长期、复杂的工作过程，而不是单次推理
有多深。**

### 自测

1. Deep Agent 是一种新的大语言模型吗？为什么？
2. Agent Harness 与 Agent Runtime 分别负责什么？
3. 文件系统为什么能缓解上下文窗口压力？
4. 什么情况下子 Agent 反而没有必要？
5. 为什么不能用“是否默认带待办工具”来定义 Deep Agent？
6. Claude Agent SDK、Codex SDK 和 OpenAI Agents SDK 的定位分别有什么不同？

---

## 02 Planning / Todo 任务规划机制

### 本节目标

学完这一节，应该能够：

- 解释 Planning / Todo 机制要解决什么问题；
- 区分“记录计划”和“执行任务”；
- 看懂 `write_todos` 的数据结构和状态变化；
- 在 Deep Agents v0.7 中启用 `TodoListMiddleware`；
- 写出粒度合理、可验证、可动态调整的任务清单；
- 判断什么时候应该使用 Todo，什么时候应该跳过；
- 区分 Todo、确定性工作流与子 Agent 委派；
- 识别 Todo 机制不能提供的可靠性保证。

本节主要依据 LangChain 官方 [Deep Agents 的 Task planning 文档](https://docs.langchain.com/oss/python/deepagents/overview#task-planning)、
[TodoListMiddleware API](https://reference.langchain.com/python/langchain/agents/middleware/todo)以及
[Deep Agents v0.7 发布说明](https://www.langchain.com/blog/deep-agents-v0-7)整理。

### 1. Planning 不是预先写死所有步骤

Deep Agent 中的 Planning 是一种**轻量、可修改的执行计划**。Agent 先把复杂目标拆成若干可操作的
Todo，在工作过程中更新状态，并根据新发现增加、删除或改写尚未完成的任务。

```text
Planning = 目标拆分 + Todo 状态 + 进度更新 + 动态重规划
```

例如，用户要求“分析销售数据并生成报告”，Agent 可以先建立：

```text
1. 检查数据字段和缺失值
2. 计算核心销售指标
3. 分析趋势和异常
4. 生成图表
5. 撰写并检查最终报告
```

执行第二步时，如果发现不同地区使用了不同币种，Agent 可以插入“统一币种和汇率口径”，再继续
分析。这说明计划是当前工作的导航，不是不可改变的合同。

它也不同于经典 AI 中求解动作序列的自动规划算法。`write_todos` 不搜索最优路径，只是让 LLM
把自己的工作计划显式写入结构化状态。

### 2. `write_todos` 到底做了什么

启用 Todo 能力后，模型会看到一个名为 `write_todos` 的工具。模型调用它时，工具主要完成两件事：

1. 接收一份结构化 Todo 列表；
2. 用这份列表更新 Agent 状态中的 `todos` 字段。

它不会搜索网页、修改业务数据或自动执行清单中的工作：

```text
write_todos(["分析数据", "生成报告"])
        ↓
只记录“准备做什么”
        ↓
模型仍要继续调用数据、文件等工具完成每一项
```

早期 Deep Agents 文章曾把 Todo 工具称为 “no-op”，想表达的正是它不直接完成业务动作。不过它
并非毫无效果，因为它会更新 Agent 状态，并可把计划展示给模型、运行时和用户界面。

因此必须记住：**更新最后一个 Todo 为完成，不等于已经向用户交付答案。** Agent 仍要在最终消息
中返回报告、代码或用户要求的其他结果。

### 3. Todo 的数据结构与状态

每个 Todo 至少包含任务内容 `content` 和执行状态 `status`：

```json
[
  {
    "content": "检查销售数据的字段和缺失值",
    "status": "completed"
  },
  {
    "content": "计算销售额、订单量和客单价",
    "status": "in_progress"
  },
  {
    "content": "生成趋势图并撰写报告",
    "status": "pending"
  }
]
```

官方中间件只定义了三种任务状态：

| 状态 | 含义 | 什么时候使用 |
| --- | --- | --- |
| `pending` | 尚未开始 | 已计划但当前还没有执行 |
| `in_progress` | 正在进行 | 已开始执行，但结果尚未验证完成 |
| `completed` | 已完成 | 工作和必要验证均已结束 |

这里没有 `failed` 或 `blocked` 状态。遇到阻塞时，不应把未完成任务伪装成 `completed`；可以让它
保持 `in_progress`，并新增一个用于解除阻塞的 Todo，或者直接向用户说明需要的外部条件。

`write_todos` 每次提交的是**完整列表**，新列表会替换旧列表。因此，同一轮模型调用中最多允许
调用一次该工具，否则并行产生的两份完整列表无法确定谁应该覆盖谁。

### 4. Todo 的生命周期

一个规范的 Todo 通常经历下面的状态流转：

```text
创建计划
   ↓
pending ──开始执行──→ in_progress ──完成并验证──→ completed
   ▲                        │
   └────调整计划或返工──────┘
```

推荐遵守以下规则：

1. 开始工作前，先把当前任务改为 `in_progress`；
2. 真正完成并验证后，立即改为 `completed`；
3. 不要到最后一次性把所有任务批量标记为完成；
4. 只要计划尚未全部完成，通常应至少有一个 `in_progress`；
5. 相互独立、确实并行执行的任务可以同时为 `in_progress`；
6. 新发现会改变后续路线时，应及时更新未完成的任务；
7. 已经不再需要的任务应从列表删除，而不是长期保留；
8. 已完成任务不要因为重新规划而随意改写。

计划的价值来自它与真实执行同步。如果状态长期不更新，Todo 就会变成误导模型和用户的过期清单。

### 5. 中间件怎样接入 Agent Loop

`TodoListMiddleware` 不只是注册一个普通函数。它还提供状态结构、工具说明和使用指令，把规划能力
接入每轮 Agent Loop：

```text
TodoListMiddleware
   ├─ 向模型暴露 write_todos 工具及参数结构
   ├─ 提供何时使用、何时不用的工具说明
   ├─ 在 Agent 状态中增加 todos 字段
   └─ 接收工具调用并替换当前 Todo 列表

用户提出复杂目标
   ↓
模型调用 write_todos 创建计划
   ↓
中间件把计划写入 state["todos"]
   ↓
模型执行真实工具并不断更新 Todo
   ↓
完成验证，返回最终交付物
```

Todo 存在 Agent 状态里，因此前端可以订阅 `todos` 的变化，实时展示“待处理、进行中、已完成”。
这也是 Todo 对长任务用户体验的主要价值之一：用户不必面对一个长时间没有反馈的聊天窗口。

### 6. 在 Deep Agents v0.7 中启用 Todo

从 Deep Agents v0.7 开始，任务规划是**可选能力**，`create_deep_agent` 默认不再添加
`TodoListMiddleware`。需要时应显式启用：

```python
from deepagents import create_deep_agent
from langchain.agents.middleware import TodoListMiddleware

agent = create_deep_agent(
    model="openai:gpt-5.5",
    middleware=[TodoListMiddleware()],
)

result = agent.invoke(
    {
        "messages": [
            {
                "role": "user",
                "content": "分析销售数据，生成包含趋势、异常和建议的报告",
            }
        ]
    }
)

print(result.get("todos", []))
```

启用中间件只代表模型**可以**使用 `write_todos`，不保证每次请求都会调用。模型会根据工具说明、
任务复杂度和自身判断决定是否创建计划。

版本差异需要特别留意：

| Deep Agents 版本 | Todo 行为 |
| --- | --- |
| v0.6 及更早版本 | `TodoListMiddleware` 默认启用 |
| v0.7 及以后版本 | 默认关闭，需要在 `middleware` 中显式添加 |

官方在 v0.7 的多类评测中发现，默认开启 Todo 没有显著提高总体效果，反而增加了 token、延迟和
成本，所以将它改为按需启用。这说明“更多 Agent 脚手架”并不必然带来更好结果。

### 7. 怎样拆出一份好计划

高质量 Todo 应该服务于执行和验收，而不是复述用户原话。可以使用下面六条原则：

1. **面向结果**：写“生成并检查趋势图”，不要只写“处理一下图表”；
2. **粒度适中**：一项最好对应一个清晰阶段，避免把每次工具调用都列成 Todo；
3. **可以验收**：每项都应能判断是否真正完成；
4. **体现依赖**：先检查输入，再分析，最后生成和验证交付物；
5. **保留验证**：把测试、事实核对或格式检查作为明确步骤；
6. **允许调整**：新证据推翻原假设时，修改未完成计划，而不是机械执行旧清单。

下面这份计划粒度过细：

```text
读取文件 → 查看第一列 → 查看第二列 → 计算一个平均数 → 打开输出文件
```

更合适的表达是：

```text
检查数据质量 → 计算并验证核心指标 → 分析趋势与异常 → 生成并检查报告
```

Todo 数量没有绝对标准，但如果清单本身比任务还难读，通常说明拆得太细；如果一个 Todo 内仍包含
十几个无法独立验证的动作，则说明拆得太粗。

### 8. 什么时候使用，什么时候跳过

| 更适合使用 Todo | 更适合直接执行 |
| --- | --- |
| 至少包含三个有区别的工作阶段 | 单一、明确的问题 |
| 需要多轮工具调用和结果验证 | 一两次简单工具调用即可完成 |
| 新结果可能改变后续计划 | 步骤固定且没有分支 |
| 用户一次提出多个交付要求 | 纯聊天、解释或简短翻译 |
| 较弱模型容易遗漏步骤 | Todo 维护成本超过任务本身 |
| 前端需要展示长任务进度 | 用户只关心即时答案 |

Deep Agents v0.7 官方仍建议在三类场景考虑 Todo：长时间多步骤任务、需要更多脚手架的较弱模型，
以及必须向用户展示计划和进度的界面。

判断标准不是“能不能列计划”，而是：

```text
Todo 带来的任务完整性和可见性
是否大于
额外的模型调用、token、延迟和状态维护成本
```

### 9. Todo、工作流与子 Agent 的边界

三个概念解决的问题不同：

| 机制 | 解决的问题 | 控制强度 |
| --- | --- | --- |
| Todo | 接下来要完成哪些工作、当前进展如何 | 软约束，由模型自行维护 |
| LangGraph 工作流 | 必须经过哪些节点、满足什么条件才能跳转 | 硬约束，由代码和图结构执行 |
| 子 Agent | 哪个隔离上下文或专门角色来完成子任务 | 执行分工，由主 Agent 发起委派 |

例如“生成报告前必须通过合规审批”属于不可绕过的业务规则，不能只写成一个 Todo；它应由 LangGraph
条件边或中断机制强制执行。Todo 只能提醒模型，模型可能忘记调用、错误更新或过早标记完成。

同样，“调研三个竞争对手”可以先写成 Todo；如果每个调研都需要大量搜索，再分别委派给三个子
Agent。Todo 记录“要做什么”，子 Agent 负责“由谁在独立上下文中做”。

因此 Todo 不是调度器、验证器或可靠性边界。需要严格保证时，还应增加：

- 确定性的图路由和终止条件；
- 工具调用次数与成本限制；
- 自动测试或结构化验证；
- 检查点、重试和错误处理；
- 敏感操作前的人工审批。

### 本节结论

```text
Planning / Todo 的本质：

把模型脑中的临时计划
        ↓
变成 Agent 状态中的结构化任务清单
        ↓
让模型、运行时和用户都能看到并更新进度
```

`write_todos` 只负责记录和更新计划，真正的工作仍由模型调用其他工具完成。它适合复杂、长时程、
需要动态调整或展示进度的任务，但不能替代 LangGraph 的确定性控制、结果验证和安全机制。

### 自测

1. `write_todos` 调用后，清单里的任务会被自动执行吗？
2. Todo 支持哪三种状态？为什么没有完成的任务不能提前标记为 `completed`？
3. 为什么同一轮模型调用中不能并行调用两次 `write_todos`？
4. Deep Agents v0.7 为什么把 Todo 改成了按需启用？
5. Todo 和 LangGraph 条件边的控制强度有什么不同？
6. Todo 与子 Agent 分别回答“要做什么”和哪个问题？

### 配套 TypeScript 实验

本节的可运行示例位于
[deepagents-planning-lab](../deepagents-planning-lab/README.md)。示例显式启用
`todoListMiddleware()`，流式打印 `todos` 状态，调用本地模拟数据工具，并把最终报告写入
`StateBackend` 虚拟文件系统。

#### 关键代码 1：给 Agent 装上规划能力

```ts
import { createDeepAgent } from "deepagents";
import { todoListMiddleware } from "langchain";

const agent = createDeepAgent({
  model,
  // 业务工具真正完成工作，write_todos 不会替代它们。
  tools: [loadSalesData, loadAnalysisRequirements],
  // 中间件向模型暴露 write_todos，并把 todos 加入 Agent State。
  middleware: [todoListMiddleware()],
  systemPrompt: `
    先调用 write_todos 创建可验收任务；
    每完成一项就更新完整列表，最后再交付报告。
  `
});
```

这段代码说明：`todoListMiddleware()` 提供的是**规划工具和状态结构**；`systemPrompt` 说明如何使用
它；真正的数据读取、计算和写报告仍由 Agent 调用其他工具完成。

#### 关键代码 2：从状态流观察 Todo 生命周期

```ts
let finalState;
const stream = await agent.stream(
  { messages: [{ role: "user", content: "分析销售数据并生成报告" }] },
  { streamMode: "values" }
);

for await (const state of stream) {
  finalState = state;
  for (const todo of state.todos ?? []) {
    console.log(todo.status, todo.content);
  }
}
```

`streamMode: "values"` 会在状态更新后返回当前完整状态，因此可以看到 Todo 从 `pending` 到
`in_progress`，再到 `completed`。`write_todos` 每次写入的是完整清单，而不是单项补丁。

#### 关键代码 3：不要把模型自报完成当成可靠性保证

```ts
if (!finalState?.todos?.length) {
  throw new Error("模型没有创建 Todo");
}

const unfinished = finalState.todos.filter(
  (todo) => todo.status !== "completed"
);
if (unfinished.length > 0) {
  throw new Error(`仍有 ${unfinished.length} 个 Todo 未完成`);
}

const report = readVirtualTextFile(
  finalState.files,
  "/reports/planning-todo-sales.md"
);
if (!report) throw new Error("Todo 已完成，但报告不存在");
```

Todo 是模型维护的软约束。应用程序仍应检查“是否创建计划、是否全部完成、交付物是否真实存在”；
更严格的业务流程还需要 LangGraph 路由、结构化校验或人工审批。

完整实现见
[`src/examples/02-planning-todo.ts`](../deepagents-planning-lab/src/examples/02-planning-todo.ts)。

---

## 03 Deep Agent 的 Offload 机制

### 本节目标

学完这一节，应该能够：

- 用一句话解释 Offload；
- 说明 Offload 为什么能缓解上下文窗口压力；
- 看懂“大工具结果 → 后端文件 → 预览和引用”的处理流程；
- 区分 Offload、Summarization、子 Agent 和长期记忆；
- 说明 Backend 为什么决定了卸载内容的生命周期；
- 使用 `read_file`、`grep` 分段取回信息；
- 在 TypeScript 中观察自动 Offload 的结果；
- 识别 Offload 的成本、风险和可靠性边界。

本节主要依据 LangChain 官方的
[Deep Agents Context Engineering](https://docs.langchain.com/oss/javascript/deepagents/context-engineering)、
[Backends](https://docs.langchain.com/oss/javascript/deepagents/backends)和
[deepagentsjs](https://github.com/langchain-ai/deepagentsjs)整理。代码行为同时核对了本实验安装的
`deepagents@1.12.2`。

### 1. Offload 是给工作上下文减负

LLM 每次推理都要重新读取当前消息历史。工具返回几万行日志、网页或数据库记录后，如果把原文一直
留在消息中，会快速消耗上下文窗口，并增加 token、延迟和模型注意力负担。

Offload 的核心做法是：

```text
大块原始内容
    ↓ 完整保存
Backend 中的文件
    ↓ 替换当前消息
少量预览 + 文件路径
```

可以把模型上下文理解成桌面，把 Backend 理解成文件柜。Offload 不是把桌面变大，而是把暂时不用的
材料放进文件柜，只在桌面保留标签；需要细节时再按标签取回。

### 2. Offload 不等于删除或摘要

一次成功的 Offload 同时产生两份不同形态的信息：

| 位置 | 保留内容 | 作用 |
| --- | --- | --- |
| Backend | 完整原始结果 | 以后精确检索和读取 |
| 活跃消息上下文 | 预览、文件路径和读取提示 | 告诉模型内容存在以及怎样找回 |

因此它通常是**存储层面的无损搬移**，但模型当前能直接看到的信息已经减少。它不会自动理解内容、
提炼结论，也不会保证模型主动读取被隐藏的关键部分。

Offload 也不等于 RAG：它默认不切分向量、不生成 Embedding、不做相似度召回，主要依靠文件路径、
`grep` 和 `read_file` 精确取回内容。

### 3. 哪些内容会触发自动 Offload

官方 TypeScript 文档给出的默认大工具输入或结果阈值是 **20,000 tokens**。以本实验使用的
`deepagents@1.12.2` 为例，内置 `FilesystemMiddleware` 还包含以下行为：

1. 普通工具结果超过约 20,000 tokens 时，立即写入 `/large_tool_results/`；
2. 替换后的 `ToolMessage` 保留文件路径和开头内容预览；
3. 超大的最新 `HumanMessage` 默认阈值为约 50,000 tokens，原文写入 `/conversation_history/`；
4. 已写入文件的大型 `write_file`、`edit_file` 参数，在上下文接近限制时可被截断为文件引用；
5. `ls`、`glob`、`grep` 等已有截断策略的文件工具不会按普通大结果再次 Offload。

当前文件系统中间件用“约 4 个字符等于 1 token”判断大结果，属于快速估算，不是模型 tokenizer 的
精确计数。中文、代码和特殊符号的实际 token 比例可能不同，因此阈值只是保护机制，不是容量承诺。

### 4. 一次大工具结果怎样被搬走

以返回 100 KB 日志的 `load_large_log` 为例，调用链可以简化为：

```text
模型调用 load_large_log
        ↓
工具返回大型 ToolMessage
        ↓
FilesystemMiddleware 检查大小
        ↓
Backend.write("/large_tool_results/<tool-call-id>.txt", 完整结果)
        ↓
原 ToolMessage 被替换成：
“结果过大，已保存到 <path>” + 开头预览
        ↓
下一轮模型只接收替换后的短消息
```

关键点在于：Offload 发生在**工具执行之后、下一次模型调用之前**。所以业务工具不需要知道 Offload
的存在，模型也不需要先决定是否卸载；中间件在 Agent Loop 的边界自动处理。

### 5. Backend 决定文件存在哪里、能活多久

“写入文件”不一定表示写入宿主机磁盘。文件路径是 Deep Agent 暴露给模型的统一接口，真正存储位置
由 Backend 决定：

| Backend | Offload 内容的位置和生命周期 | 典型用途 |
| --- | --- | --- |
| 默认 `StateBackend` | 跟随 Agent State；配合 checkpointer 可在线程内保留 | 教学、临时工作区 |
| `FilesystemBackend` | 指定根目录下的本地文件 | 本地项目和持久文件 |
| `StoreBackend` | LangGraph Store，可跨线程持久化 | 长期记忆和共享资料 |
| `CompositeBackend` | 按路径路由到不同 Backend | 分离临时结果、项目文件和记忆 |

所以 Offload 本身不等于长期记忆。默认 `StateBackend` 中的 `/large_tool_results/...` 只是工作记忆；
是否跨调用、跨进程或跨线程存在，取决于 Backend、checkpointer 和部署方式。

### 6. 正确的取回方式是“先搜索，再局部读取”

卸载后如果立刻把整个文件重新读回，等于把刚清空的桌面再次堆满。更好的恢复流程是：

```text
从 ToolMessage 获得文件路径
        ↓
grep 搜索错误码、订单号或关键词
        ↓
read_file(path, offset, limit) 读取相关区间
        ↓
必要时换 offset 继续分页
```

可以在系统提示词中明确约束模型：

```ts
const agent = createDeepAgent({
  model,
  tools: [loadLargeLog],
  systemPrompt: `
    大型工具结果被保存到文件后，先用 grep 定位关键词；
    再用 read_file 的 offset 和 limit 读取相关片段，不要一次读完整文件。
  `
});
```

这是一种“按需加载”的上下文工程：模型需要的是当前决策相关的证据，而不是所有可获得的数据。

### 7. Offload、Summarization 与子 Agent 的区别

| 机制 | 主要处理对象 | 活跃上下文中的结果 | 是否调用 LLM 压缩 |
| --- | --- | --- | --- |
| Offload | 单个大型输入或工具结果 | 预览 + 文件引用 | 否 |
| Summarization | 较老的整段消息历史 | LLM 生成的结构化摘要 | 是 |
| 子 Agent | 独立的多步骤子任务 | 子 Agent 的最终回复 | 子 Agent 自己调用 |

三者可以接力工作：先把大型工具结果 Offload；上下文整体继续增长时，再由 Summarization 压缩旧
历史；某项调研本身会产生大量中间过程时，则交给独立上下文的子 Agent，只向主 Agent 返回结论。

官方当前默认策略通常在上下文达到模型输入窗口约 85% 时触发 Summarization，并保留近期消息。
Summarization 的活跃摘要可能丢失细节，但完整旧消息也会写入 `/conversation_history/` 供以后查找。

### 8. 用 TypeScript 观察自动 Offload

下面的工具故意返回超过约 80 KB 的文本。`createDeepAgent` 已内置文件系统和 Offload 中间件，不需要
为普通使用重复添加 `createFilesystemMiddleware()`：

```ts
import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { z } from "zod";

const loadLargeLog = tool(
  async () =>
    Array.from(
      { length: 5_000 },
      (_, i) => `${i + 1} 订单服务运行正常；示例日志用于触发 Offload。`
    ).join("\n"),
  {
    name: "load_large_log",
    description: "返回大型教学日志，必须调用一次。",
    schema: z.object({})
  }
);

const agent = createDeepAgent({ model, tools: [loadLargeLog] });
const result = await agent.invoke({
  messages: [{ role: "user", content: "读取日志并说明它被保存到了哪里" }]
});

const offloadedPaths = Object.keys(result.files ?? {}).filter((path) =>
  path.startsWith("/large_tool_results/")
);
console.log(offloadedPaths);
```

如果输出出现 `/large_tool_results/<id>.txt`，说明原始工具结果已经进入默认 `StateBackend`。测试时
应检查 `result.files` 或跟踪记录，而不是仅凭模型回复“我已卸载”判断成功。

本节的完整可运行示例位于
[`src/examples/03-offload.ts`](../deepagents-planning-lab/src/examples/03-offload.ts)，运行命令为
`pnpm lesson:03`。示例把目标事件放在第 4,242 行，要求 Agent 必须经过
`load_large_log → grep → read_file` 才能完成验证。

底层手动组合中间件时，TypeScript API 还提供 `toolTokenLimitBeforeEvict` 和
`humanMessageTokenLimitBeforeEvict`。但 `createDeepAgent` 已装配标准中间件，不能为了改阈值就盲目再
添加一套同名文件工具；需要深度定制时，应明确设计自己的 `createAgent + middleware` 组合。

### 9. Offload 的收益、代价与边界

使用 Offload 时要同时记住以下几点：

1. 它减少后续模型调用携带的上下文，但不会消除 Backend 的存储成本；
2. 重新读取文件仍会消耗 token，取回范围应尽量小；
3. 预览可能没有关键证据，模型必须会搜索和分页读取；
4. 敏感工具结果被写入 Backend 后，需要权限、隔离、加密和清理策略；
5. Backend 写入失败时不能假设原文已经安全保存；
6. 自动阈值是兜底措施，稳定系统还应限制工具输出并返回结构化摘要；
7. Offload 不能验证结果正确，也不能替代业务校验和人工审批；
8. 应通过 State、日志或 LangSmith trace 观察实际路径、大小和取回行为。

最有效的模式不是“让所有工具无限输出，再依赖 Offload”，而是让工具先提供摘要和索引，把完整原始
数据存入可检索位置；模型只在确有需要时读取小片段。

### 本节结论

```text
Offload = 保留完整原文 + 缩小活跃上下文 + 提供可恢复引用
```

它解决的是“当前模型调用不必携带所有材料”，不是“模型已经理解所有材料”。Deep Agent 通过
FilesystemMiddleware 和 Backend 把大结果变成可按需读取的外部工作记忆，再与 Summarization、
子 Agent 隔离和确定性验证共同支撑长时程任务。

### 自测

1. Offload 为什么没有扩大模型的上下文窗口？
2. Offload 后，完整原文和文件引用分别保存在哪里？
3. 为什么不应该马上用 `read_file` 读回整个卸载文件？
4. Offload 和 Summarization 在是否调用 LLM、是否保留原文方面有什么区别？
5. 默认 `StateBackend` 中出现文件，为什么不等于已经获得跨线程长期记忆？
6. 如何用程序证明大型工具结果确实完成了 Offload？

---

## 04 Deep Agent 哪些场景适用

### 本节目标

学完这一节，应该能够：

- 不依赖行业名称，根据任务形态判断是否需要 Deep Agent；
- 识别复杂度、上下文、产物和执行时长四类关键信号；
- 说出研究、编程和长文档任务为什么适合 Deep Agent；
- 识别使用 Deep Agent 会“用力过猛”的简单任务；
- 区分直接调用、`createAgent`、Deep Agent 和 LangGraph；
- 估算 Deep Agent 带来的 token、延迟和执行风险；
- 用一个简单决策函数完成初步技术选型；
- 说明生产环境使用 Deep Agent 的前置条件。

本节主要依据 LangChain 官方的
[Deep Agents Overview](https://docs.langchain.com/oss/javascript/deepagents/overview)、
[LangChain Agents](https://docs.langchain.com/oss/javascript/langchain/agents)、
[LangGraph Overview](https://docs.langchain.com/oss/javascript/langgraph/overview)和
[Context Engineering](https://docs.langchain.com/oss/javascript/deepagents/context-engineering)整理。

### 1. 判断的是任务形态，不是行业名称

“客服系统适不适合 Deep Agent？”这个问题太宽。客服中的“查询一个订单状态”可能只需一次工具调用，
而“分析半年投诉、核对政策、提出改进方案并生成报告”则可能需要规划、文件系统和子 Agent。

因此，应该先问任务具有什么形态：

```text
任务是否复杂、开放、长时程？
是否会产生大量中间上下文？
是否需要生成和反复修改交付物？
是否需要独立子任务或跨轮记忆？
```

Deep Agent 仍然建立在模型调用工具的 Agent Loop 上。它的价值不是拥有另一种“更聪明的推理算法”，
而是预装了 Planning、Filesystem、Offload、Summarization、Subagent 等执行脚手架。

### 2. 信号一：任务需要动态规划和多阶段验收

更适合 Deep Agent 的任务通常至少包含三个不同阶段，而且后一步依赖前一步的发现：

```text
理解目标 → 搜集材料 → 分析证据 → 生成产物 → 测试或复核 → 返工
```

例如“把旧版支付模块迁移到新 SDK”不是简单改一行代码。Agent 需要定位调用点、阅读迁移文档、修改
多个文件、运行测试，并根据错误重新规划。此时 `write_todos` 能降低遗漏步骤的概率，也便于展示进度。

如果步骤始终固定、没有探索或返工空间，则不一定需要模型维护 Todo；普通函数或确定性工作流通常
更便宜、更容易验证。

### 3. 信号二：上下文大、长度不确定或需要产物工作区

当工具可能返回大网页、日志、数据库结果，或者任务需要阅读大量文件时，普通消息历史很容易膨胀。
Deep Agent 的文件系统、Offload 和 Summarization 能让模型把材料移出活跃上下文，再按需搜索读取。

适合的任务包括：

- 阅读多份合同并输出差异报告；
- 分析大型日志并定位跨服务故障；
- 调研多个来源并形成带证据的长报告；
- 维护一个包含代码、测试和说明文档的项目；
- 对超长数据生成中间结果、索引和最终产物。

这里的重点不只是“输入很长”，而是内容会在执行过程中继续增长，并需要保存中间产物。一次性的长文
摘要如果能放进模型窗口，未必值得引入完整 Deep Agent Harness。

### 4. 信号三：子任务需要上下文隔离或专业分工

有些目标可以由一个主 Agent 完成，但中间调研会产生大量无关细节。例如比较五家竞品时，每家都要
搜索、阅读和归纳。如果所有工具结果都进入主上下文，主 Agent 很快会被中间噪声淹没。

Deep Agent 可以把工作委派给子 Agent：

```text
主 Agent：确定比较维度并汇总结论
   ├─ 子 Agent A：研究竞品 A，只返回摘要
   ├─ 子 Agent B：研究竞品 B，只返回摘要
   └─ 子 Agent C：核对价格和来源
```

这类任务适合使用子 Agent，因为独立上下文本身就有价值。反过来，如果子任务只是一次简单 API
查询，创建子 Agent 会增加模型调用、延迟和协调成本，不如让主 Agent 直接调用工具。

### 5. 三类典型适用场景

| 场景 | 为什么适合 | 常用能力组合 |
| --- | --- | --- |
| 深度研究与报告 | 来源多、路线会变化、需要证据和长产物 | Todo + 搜索工具 + 文件系统 + 子 Agent |
| 软件工程任务 | 要读写多文件、执行测试、根据失败返工 | 文件系统 + Sandbox/execute + Todo |
| 文档与数据分析 | 输入长度不定、需要中间结果和局部检索 | Offload + grep/read_file + Summarization |

还可以扩展到复杂运营分析、事件调查、长期项目助理等场景。但只有在这些任务确实需要多步自治和上下文
管理时，Deep Agent 才有明显优势；给场景贴上“AI 研究”或“智能客服”标签并不足以证明适用。

### 6. 哪些场景不适合直接使用 Deep Agent

以下任务通常应该采用更简单或更确定的方案：

1. **单轮知识问答**：模型直接回答即可；
2. **单一工具查询**：例如按订单号查状态，`createAgent` 或普通函数足够；
3. **固定业务流程**：节点和条件明确时，优先用代码或 LangGraph 表达；
4. **极低延迟接口**：Deep Agent 可能规划、读写文件并产生多轮模型调用；
5. **高吞吐批处理**：确定性脚本通常成本更低、结果更稳定；
6. **不可逆高风险操作**：不能只依靠模型自我约束，必须增加审批和权限；
7. **无法可靠调用工具的模型**：Harness 的多数能力都依赖正确的工具调用；
8. **缺少可验证结果的任务**：自治程度越高，越需要明确验收标准。

“可以用 Deep Agent”不等于“值得用”。即使官方 SDK 能处理简单任务，复杂 Harness 仍会带来更多工具
描述、状态、中间件、token 和调试面。

### 7. Direct、createAgent、Deep Agent 与 LangGraph 怎样选

| 方案 | 更适合的问题 | 控制方式 |
| --- | --- | --- |
| 直接模型或函数调用 | 单步、输入输出明确 | 应用代码直接控制 |
| LangChain `createAgent` | 少量工具、短循环、模型动态选工具 | 轻量 Agent Loop |
| `createDeepAgent` | 开放式长任务、上下文管理、文件和子 Agent | 带完整脚手架的 Agent Harness |
| 自定义 LangGraph | 固定节点、硬性顺序、审批、重试和状态机 | 图结构确定性控制 |

这四者不是互斥产品。常见生产架构是让 LangGraph 负责不可绕过的业务流程，在某个需要开放式调查或
生成复杂产物的节点中调用 Deep Agent：

```text
LangGraph：身份校验 → 意图路由 → [Deep Agent 调查复杂问题] → 人工审批 → 执行操作
```

这样既保留 Deep Agent 的探索能力，又不会让模型决定所有安全边界。

### 8. 生产环境还要看成本、安全和可观测性

Deep Agent 的收益来自更完整的执行过程，相应也要支付更多成本：

| 维度 | 需要评估的问题 |
| --- | --- |
| Token | 规划、子 Agent、摘要和文件取回会增加多少调用？ |
| 延迟 | 用户能否接受多轮工具执行和验证？ |
| 权限 | Agent 可以读取、写入、执行哪些资源？ |
| 隔离 | 多用户文件、Sandbox 和记忆是否正确分区？ |
| 可靠性 | 是否有测试、结构化校验、重试和终止条件？ |
| 可观测性 | 能否看到工具轨迹、Todo、文件和子 Agent 状态？ |

至少应具备支持工具调用的模型、边界清楚的工具、受控 Backend、明确验收标准和运行追踪。涉及发布、
付款、删除、发送消息等外部副作用时，还要加入最小权限和 Human-in-the-loop 审批。

### 9. 用 TypeScript 做一次初步选型

下面不是官方评分公式，而是一条便于项目评审的教学启发式规则：

```ts
type TaskProfile = {
  distinctStages: number;
  largeOrGrowingContext: boolean;
  createsArtifacts: boolean;
  needsIsolatedSubtasks: boolean;
  requiresHardWorkflow: boolean;
};

function chooseArchitecture(task: TaskProfile) {
  if (task.requiresHardWorkflow) {
    return "langgraph";
  }

  const deepSignals = [
    task.distinctStages >= 3,
    task.largeOrGrowingContext,
    task.createsArtifacts,
    task.needsIsolatedSubtasks
  ].filter(Boolean).length;

  if (deepSignals >= 3) return "deep-agent";
  if (task.distinctStages >= 2) return "create-agent";
  return "direct-call";
}
```

例如：

```ts
chooseArchitecture({
  distinctStages: 5,
  largeOrGrowingContext: true,
  createsArtifacts: true,
  needsIsolatedSubtasks: true,
  requiresHardWorkflow: false
}); // "deep-agent"
```

评分只能帮助团队提出问题，不能代替压测和评估。更稳妥的做法是先实现最简单的可行架构，用真实任务
集比较完成率、延迟、token 成本和人工返工率，再决定是否升级为 Deep Agent。

### 本节结论

```text
Deep Agent 的适用性
    = 任务复杂度
    + 上下文管理需求
    + 产物与执行工作区需求
    + 子任务隔离需求
    - 成本、延迟与风险
```

最典型的 Deep Agent 任务是“目标明确，但完成路径需要探索”的长任务。如果路径和规则完全固定，
优先使用代码或 LangGraph；如果只需要一两次工具调用，优先使用直接调用或 `createAgent`。

### 自测

1. 为什么不能只根据“客服”或“编程”这种行业标签判断是否适用？
2. 一次性长文摘要和执行过程中不断增长的上下文有什么区别？
3. 什么情况下子 Agent 的上下文隔离价值大于额外调用成本？
4. 为什么固定的审批流程更适合 LangGraph，而不是只写进 Todo？
5. Deep Agent 用于简单订单查询时可能产生哪些额外成本？
6. 在生产环境上线 Deep Agent 前，至少要具备哪些边界和验证措施？

---

## 05 第一个 Demo：发布准备度审查 Agent

### 本节目标

学完这一节，应该能够：

- 用 `createDeepAgent` 创建一个可运行的 Deep Agent；
- 区分模型、自定义工具和 Harness 内置工具；
- 用系统提示词定义任务边界和验收条件；
- 观察 Todo、工具调用和虚拟文件怎样形成执行闭环；
- 理解默认 `StateBackend` 中的文件位于 Agent State；
- 对 Agent 的执行过程和最终产物分别做程序化验收；
- 使用 OpenAI 或 DeepSeek 运行同一份示例。

本节示例位于
[`src/examples/05-first-demo.ts`](../deepagents-planning-lab/src/examples/05-first-demo.ts)，依据 LangChain
官方的 [Deep Agents Quickstart](https://docs.langchain.com/oss/javascript/deepagents/quickstart)、
[Deep Agents Overview](https://docs.langchain.com/oss/javascript/deepagents/overview)和
[Backends](https://docs.langchain.com/oss/javascript/deepagents/backends)编写。

### 1. Demo 要解决什么问题

用户要求 Agent 判断 `REL-2026-08` 是否可以发布。Agent 必须读取项目事实和发布规则，逐项检查门禁，
生成 Markdown 报告并给出明确结论。

这不是为了模拟复杂的真实发布系统，而是把 Deep Agent 的关键执行链缩小到一次终端运行中：

```text
目标 → 规划 → 获取事实 → 获取规则 → 比较判断 → 写报告 → 读取复核 → 返回结论
```

已知迁移演练只有 48/50 通过，回滚手册也缺少审批人，因此正确结论是“暂缓发布”。这些事实必须来自
工具结果，不能直接写进用户消息让模型照抄。

### 2. 定义自定义业务工具

Deep Agents 不知道项目的内部数据，需要应用提供领域工具：

```ts
const loadProjectBrief = tool(async ({ releaseId }) => {
  return JSON.stringify(PROJECT_BRIEF, null, 2);
}, {
  name: "load_project_brief",
  description: "按 releaseId 读取发布状态和测试结果。",
  schema: z.object({ releaseId: z.string() })
});

const loadReleasePolicy = tool(async () => RELEASE_POLICY.join("\n"), {
  name: "load_release_policy",
  description: "读取发布门禁规则。",
  schema: z.object({})
});
```

工具应返回事实，模型负责比较和解释。生产代码还要在工具内部完成身份校验、参数验证、超时、审计和错误
处理，不能只依靠系统提示词限制模型。

### 3. 创建 Deep Agent

核心装配代码只有几项：

```ts
const agent = createDeepAgent({
  name: "first-deep-agent-demo",
  model,
  tools: [loadProjectBrief, loadReleasePolicy],
  middleware: [todoListMiddleware()],
  systemPrompt: SYSTEM_PROMPT
});
```

其中：

| 配置 | 作用 |
| --- | --- |
| `model` | 负责理解目标、选择工具和生成内容 |
| `tools` | 注入应用自己的业务能力 |
| `middleware` | 本例显式启用 Todo 状态，便于观察和验收 |
| `systemPrompt` | 描述角色、步骤约束、产物位置和完成标准 |

`createDeepAgent` 还会装配文件系统等 Harness 能力。应用不需要重新实现工具循环。

### 4. 自定义工具与内置工具怎样协作

本例最终应出现五类关键工具：

```text
write_todos                         内置：记录和更新计划
load_project_brief                  自定义：读取项目事实
load_release_policy                 自定义：读取发布规则
write_file                          内置：写入报告
read_file                           内置：读取并复核报告
```

模型决定具体调用时机，Harness 负责把工具暴露给模型、执行调用并把结果送回 Agent Loop。Todo 和文件
系统不是模型本身拥有的能力，而是运行时提供的脚手架。

### 5. 为什么要使用系统提示词约束闭环

系统提示词不仅描述“你是发布审查员”，还要声明可验证的完成条件：

```ts
const SYSTEM_PROMPT = `
1. 先调用 write_todos 创建计划；
2. 必须读取项目事实和发布规则；
3. 报告写入 /reports/release-readiness.md；
4. 写入后调用 read_file 复核；
5. 最终给出结论、阻塞原因和报告路径。
`;
```

提示词能提高模型遵循流程的概率，但不能提供强可靠性。如果“读取后才能审批”属于不可绕过的业务规则，
应由应用代码或 LangGraph 控制流程，而不是只在提示词里写一句“必须”。

### 6. 用流式状态观察执行过程

Deep Agent 返回的是 LangGraph 图，可以使用 `streamMode: "values"` 观察每次更新后的完整状态：

```ts
const stream = await agent.stream(
  { messages: [{ role: "user", content: userRequest }] },
  { streamMode: "values" }
);

for await (const state of stream) {
  console.log(state.todos);
  console.log(state.messages.at(-1));
}
```

示例对 Todo 状态和已经完成的工具调用做去重，只打印新变化。这里观察的是 Agent 的执行轨迹，而不是
仅仅等待最终文本。

### 7. 文件写到了哪里

本例没有指定 `backend`，因此文件工具默认使用 `StateBackend`：

```text
/reports/release-readiness.md
             ↓
finalState.files["/reports/release-readiness.md"]
```

它是 Agent 看到的 POSIX 风格虚拟路径，不是 macOS 宿主机的 `/reports` 目录。程序结束后从
`finalState.files` 读取报告。后续第 06～08 节会继续解释 Virtual FS 和不同 Backend。

### 8. 不只验收最终回答

模型说“已经完成”不能证明任务真的完成。本例从三个层面验收：

```ts
// 过程：关键工具确实执行过
requiredTools.every((name) => toolNames.includes(name));

// 状态：Todo 全部完成
finalState.todos.every((todo) => todo.status === "completed");

// 产物：报告存在并包含关键证据
report.includes("tenant_id") && report.includes("暂缓发布");
```

生产系统还应该增加结构化输出 Schema、事实一致性检查、权限、重试、超时、成本上限和人工审批。

### 9. 运行示例并阅读输出

```bash
cd deepagents-planning-lab
pnpm lesson:05
```

模型可以由 `.env` 中的 `OPENAI_*` 或 `DEEPSEEK_*` 配置选择。预期输出会依次出现 Todo 更新、工具完成
记录、`Demo 验收通过`、最终回复和虚拟文件报告。工具顺序可能略有差异，但程序规定的关键调用和产物
必须全部存在。

### 本节结论

第一个 Deep Agent Demo 的重点不是 `createDeepAgent` 这一行，而是完整执行闭环：

```text
模型负责动态决策
业务工具提供可信事实
Harness 提供规划与文件工作区
应用代码负责最终验收
```

这四层缺一不可。只创建 Agent 没有领域工具，它无法接触真实业务；只靠提示词没有程序验收，则无法
知道它是否真正执行了要求的步骤。

### 自测

1. `load_project_brief` 和 `write_file` 分别属于哪一类工具？
2. 为什么项目事实不应该直接写进用户问题让模型照抄？
3. `streamMode: "values"` 让我们观察到了什么？
4. 为什么 `/reports/release-readiness.md` 默认不是宿主机文件？
5. 系统提示词中的“必须调用”为什么不能成为强业务保证？
6. 本例分别从过程、状态和产物验证了什么？

---

## 06 Virtual FS 使用

### 本节目标

学完这一节，应该能够：

- 解释 Virtual FS 中“虚拟”的含义；
- 使用默认 `StateBackend` 创建 Agent 工作区；
- 在调用 Agent 时预置输入文件；
- 正确使用 `ls`、`read_file`、`write_file`、`edit_file`、`glob` 和 `grep`；
- 区分虚拟路径、Backend 存储位置和宿主机路径；
- 从 Agent 最终状态中取回文件产物；
- 说明 `write_file` 与 `edit_file` 的不同语义；
- 识别默认虚拟文件的生命周期和安全边界。

本节参考 LangChain 官方的
[Deep Agents Backends](https://docs.langchain.com/oss/javascript/deepagents/backends)、
[Context Engineering](https://docs.langchain.com/oss/javascript/deepagents/context-engineering)和
[Customization](https://docs.langchain.com/oss/javascript/deepagents/customization)。配套代码位于
[`src/examples/06-virtual-fs.ts`](../deepagents-planning-lab/src/examples/06-virtual-fs.ts)。

### 1. Virtual FS 是统一的文件操作界面

Virtual FS 不是一种新的磁盘格式，而是 Deep Agents 暴露给模型的一组文件工具及其抽象路径：

```text
模型调用 ls/read_file/write_file/...
                 ↓
       Filesystem Middleware
                 ↓
              Backend
                 ↓
Agent State、本地磁盘、Store、Sandbox 或自定义存储
```

模型始终使用类似 `/workspace/report.md` 的 POSIX 路径。路径背后究竟是内存状态、真实磁盘还是远程对象
存储，由 Backend 决定。这样可以在不重写 Agent 文件操作逻辑的情况下更换存储实现。

### 2. 默认 StateBackend 把文件存在 Agent State

不传 `backend` 时，Deep Agents 默认使用 `StateBackend`。本例为了让这一点更直观，显式写出：

```ts
const agent = createDeepAgent({
  model,
  backend: new StateBackend(),
  systemPrompt: SYSTEM_PROMPT
});
```

它适合作为临时工作区、草稿区和大型工具结果的卸载位置。同一线程配置了 Checkpointer 时可以跨多次
调用保留状态，但它不自动成为跨线程长期存储。

### 3. 调用 Agent 时预置虚拟文件

应用可以把已有材料放入 `files`，供 Agent 按需发现和读取：

```ts
function createTextFile(content: string): FileData {
  const now = new Date().toISOString();
  return {
    content,
    mimeType: "text/markdown",
    created_at: now,
    modified_at: now
  };
}

await agent.invoke({
  messages: [{ role: "user", content: "检查发布材料" }],
  files: {
    "/workspace/input/project-brief.md": createTextFile(brief),
    "/workspace/input/release-checklist.md": createTextFile(checklist)
  }
});
```

文件进入 State 不等于内容已经塞进模型上下文。模型只知道文件工具存在，需要通过 `ls` 和
`read_file` 主动获取内容。这正是文件系统帮助控制上下文大小的基础。

### 4. 六个核心文件工具

| 工具 | 作用 | 关键语义 |
| --- | --- | --- |
| `ls` | 列出目录内容 | 适合先探索再读取 |
| `read_file` | 按路径读取文件 | 默认最多 100 行，可用 `offset`、`limit` 分页 |
| `write_file` | 创建或整体写入文件 | 文件已存在时会完整替换 |
| `edit_file` | 精确替换字符串 | 应先读取；旧字符串必须准确匹配 |
| `glob` | 按路径模式查找文件 | 支持 `*`、`**`、`?` |
| `grep` | 搜索文件内容 | 默认是字面量匹配，不是正则表达式 |

这组工具把“找哪个文件”和“文件里有什么”分开：`glob` 搜索路径，`grep` 搜索内容。

### 5. write_file 与 edit_file 不要混用

创建全新报告时使用 `write_file`：

```text
write_file(
  file_path="/workspace/output/review.md",
  content="version: DRAFT-V1\nowner: TBD"
)
```

只修改其中一小块时使用 `edit_file`：

```text
edit_file(
  file_path="/workspace/output/review.md",
  old_string="version: DRAFT-V1\nowner: TBD",
  new_string="version: FINAL-V1\nowner: mobile-team"
)
```

`read_file` 返回的显示行号不是原文内容，不能把行号复制进 `old_string`。如果旧字符串不存在或出现
多次但未设置批量替换，编辑会报错。

### 6. Demo 的完整文件操作流程

示例用虚拟工作区完成一次发布材料审查：

```text
/workspace/input/project-brief.md ─────┐
                                       ├─ read → synthesize
/workspace/input/release-checklist.md ─┘           ↓
                                /workspace/output/virtual-fs-review.md
                                              ↓
                                 read → edit → glob/grep → read
```

要求先写入 `DRAFT-V1`，再精确编辑为 `FINAL-V1`。这个步骤虽然是教学设计，却能清楚暴露“整体覆盖”
和“局部替换”的差别。

### 7. glob 和 grep 回答不同问题

```text
glob(pattern="**/*.md", path="/workspace")
```

回答“工作区里有哪些 Markdown 文件”。

```text
grep(pattern="RISK-MOBILE-OFFLINE", path="/workspace")
```

回答“哪些文件的内容出现了该风险编号”。`grep` 的 `pattern` 是字面量；如果传入 `foo|bar`，它会搜索
字符 `foo|bar` 本身，而不是正则中的“或”。

### 8. 从最终状态取回文件

使用 `StateBackend` 时，程序可以从最终状态检查文件路径和内容：

```ts
const paths = Object.keys(finalState.files ?? {});
const report = readVirtualTextFile(
  finalState.files,
  "/workspace/output/virtual-fs-review.md"
);
```

本例会验证三份文件都存在、报告已经变成 `FINAL-V1`、负责人已经更新，并且草稿标记不再存在。这是对
文件真实状态的验收，不依赖模型声称“我修改好了”。

### 9. 生命周期与安全边界

必须同时分清三件事：

| 概念 | 本例中的值 |
| --- | --- |
| Agent 看到的路径 | `/workspace/...` |
| Backend | `StateBackend` |
| 实际存储 | 当前线程的 LangGraph Agent State |

如果换成 `FilesystemBackend`，同一套工具可能操作真实磁盘，错误写入就会产生持久副作用；如果需要执行
代码，则应选择隔离 Sandbox。生产环境还应配置路径权限、用户隔离、文件大小限制和敏感信息策略。

### 本节结论

Virtual FS 的核心不是模仿操作系统，而是给 Agent 一个统一、可搜索、可替换 Backend 的工作区：

```text
虚拟路径负责统一接口
文件工具负责受控操作
Backend 决定存储位置和生命周期
应用负责预置材料与验收产物
```

### 运行示例

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:06
```

预期看到六类文件工具的执行轨迹、三条虚拟文件路径、最终 `FINAL-V1` 报告和验收通过提示。

### 自测

1. Virtual FS 的路径为什么不一定对应宿主机路径？
2. 把文件放进 `finalState.files` 与把内容放进模型上下文有什么区别？
3. `write_file` 和 `edit_file` 分别适合什么修改？
4. 为什么调用 `edit_file` 前应该先调用 `read_file`？
5. `glob` 和 `grep` 分别搜索什么？
6. 默认 `StateBackend` 能否自动跨线程保存文件？
7. 怎样从应用代码证明报告确实从 `DRAFT-V1` 变成了 `FINAL-V1`？

---

## 07 Virtual FS 解决了什么问题

### 本节目标

学完这一节，应该能够：

- 解释为什么模型上下文不能兼任长期工作区；
- 区分消息上下文、文件工作区和持久化存储；
- 说明 Virtual FS 如何减少活跃上下文中的无关内容；
- 说明文件怎样承载中间产物和可修改交付物；
- 理解按路径、文件名和内容进行按需取回的价值；
- 说明主 Agent 与子 Agent 为什么需要共享工作区；
- 根据生命周期选择不同 Backend；
- 识别 Virtual FS 不能自动解决的问题；
- 用离线实验比较完整文件和活跃消息工作集。

本节主要依据 LangChain 官方的
[Deep Agents Context Engineering](https://docs.langchain.com/oss/javascript/deepagents/context-engineering)、
[Backends](https://docs.langchain.com/oss/javascript/deepagents/backends)和
[Subagents](https://docs.langchain.com/oss/javascript/deepagents/subagents)。配套实验位于
[`src/examples/07-why-virtual-fs.ts`](../deepagents-planning-lab/src/examples/07-why-virtual-fs.ts)。

### 1. 首先分清上下文与工作区

普通 Agent 很容易把所有信息都堆进 `messages`：用户输入、工具结果、草稿、修改后的草稿和验证结果。
但模型上下文更像 CPU 工作集，而不是硬盘：容量有限，每次调用都要重新处理其中的内容。

```text
消息上下文：当前这一步必须让模型看到什么
Virtual FS：任务过程中有哪些材料和产物可供按需读取
Backend：这些文件实际上存在哪里、能保存多久
```

Virtual FS 的基本价值是把“信息存在”与“信息此刻必须进入模型注意力”分开。

### 2. 问题一：上下文会随着任务不断膨胀

假设 Agent 依次读取五份报告，每份 20,000 字。如果每份全文都永久停留在消息历史中，后续每次模型
调用都要携带大量已经暂时用不到的内容：

```text
第 1 步：目标 + 报告 A
第 2 步：目标 + A + B
第 3 步：目标 + A + B + C
...
```

使用 Virtual FS 后，可以把材料保存在文件中，活跃上下文只保留文件路径、搜索结果和当前需要的片段。
它没有扩大上下文窗口，而是缩小每一步的工作集。

### 3. 问题二：工具结果长度不可预测

搜索、日志、网页和数据库查询的返回量可能从几行变成几十万字。没有文件层时，工具结果只能直接进入
ToolMessage，容易造成上下文溢出或截断。

Deep Agents 可以把过大的工具结果 Offload 到 Backend，用路径和预览替换消息里的全文：

```text
大型工具结果
    ├─ 完整原文 → /large_tool_results/<id>.txt
    └─ 活跃上下文 → 文件路径 + 少量预览
```

这正是第 03 节 Offload 必须依赖 Virtual FS 的原因。后续需要证据时，再通过 `grep` 和局部
`read_file` 取回。

### 4. 问题三：中间产物不适合只存在对话里

长任务会产生计划、研究笔记、代码、数据表、草稿和最终报告。只存在消息中的内容有三个缺点：

1. 难以用稳定名字引用；
2. 修改一小段时容易重新生成全文；
3. 应用程序难以把产物独立取出并验收。

Virtual FS 允许用路径表达产物身份：

```text
/workspace/plan.md
/workspace/research/payment.md
/workspace/drafts/report-v1.md
/workspace/output/final-report.md
```

路径让 Agent、应用代码和其他 Agent 对“正在修改哪个产物”形成共同认识。

### 5. 问题四：需要按需发现，而不是一次读取全部

文件工具支持两类定位：

```text
ls / glob：根据目录和文件名发现材料
grep：根据内容找到候选文件与行号
read_file：只把候选片段放回上下文
```

这是一种渐进式披露：先看目录，再搜索，再局部读取。模型关注的是当前证据，不必同时阅读整个资料库。
第 08 节会继续学习长文本的分页和搜索策略。

### 6. 问题五：长任务需要可反复修改的外部状态

模型输出是一次性生成结果，但软件工程、研究和文档任务通常需要多轮修改：

```text
生成草稿 → 测试或审阅 → 定位问题 → 局部修改 → 再验证
```

`write_file` 可以形成一个稳定基线，`edit_file` 对明确片段做修改，`read_file` 再确认结果。文件状态独立
于模型的自然语言自报，因此应用可以检查“文件真的变了没有”。

### 7. 问题六：多个 Agent 需要共享但不必共享全部上下文

子 Agent 的价值之一是上下文隔离：研究子 Agent 可以阅读大量原始资料，主 Agent 只接收总结。但二者
仍可能需要交换较大的结构化产物。

```text
研究子 Agent ──写入──> /workspace/research.md
主 Agent       ──读取──> 摘要或指定章节
审查子 Agent   ──写入──> /workspace/review.md
```

默认 `StateBackend` 在主 Agent 与子 Agent 之间共享，所以文件可以充当 Blackboard。共享的是产物，
不是所有中间 ToolMessage。

### 8. 问题七：业务逻辑不应该绑定一种存储

Agent 始终调用相同的 `ls`、`read_file`、`write_file` 等工具，Backend 决定文件的物理位置：

| 需求 | 合适的 Backend |
| --- | --- |
| 单线程临时草稿 | `StateBackend` |
| 跨线程记忆 | `StoreBackend` |
| 本地开发项目 | `FilesystemBackend` |
| 隔离执行环境 | Sandbox Backend |
| 临时工作区加持久记忆 | `CompositeBackend` |

因此可以先用 State 开发，再根据生命周期、隔离和执行需求更换 Backend，不必重写模型的文件使用方式。

### 9. Virtual FS 不是什么万能解法

它不能自动做到以下事情：

- 不会扩大模型上下文窗口；读取的内容仍然消耗 token；
- 不会保证模型搜索和读取了正确证据；仍需提示、轨迹检查和产物验收；
- 默认 `StateBackend` 不提供跨线程长期记忆；
- Virtual FS 抽象本身不等于安全沙箱；真实磁盘和执行能力需要额外隔离；
- 不会替代数据库事务、对象权限、审计和备份；
- 不会把所有信息自动组织好；目录、命名和产物规范仍由应用设计。

Virtual FS 解决的是 Agent 的工作区和上下文管理问题，不是所有状态、存储和安全问题。

### 配套离线实验

实验预置一份 1,200 行日志，但 Fake Model 只执行：

```text
ls → grep RISK-CHECKOUT-TIMEOUT
   → read_file 目标附近 5 行
   → write_file 精简风险报告
```

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:07
```

关键代码：

```ts
const result = await agent.invoke({
  messages: [{ role: "user", content: "定位风险并写报告" }],
  files: initialFiles
});

const fileCharacters = countTextCharacters(initialFiles);
const activeTraceCharacters = JSON.stringify(result.messages).length;
```

输出的比例只比较本次实验的字符量，不是精确 token 成本，也不能直接外推到所有模型。但它能证明：
完整日志可以存在 Virtual FS，而模型消息只需出现搜索命中、局部证据和精简产物。

### 本节结论

```text
Virtual FS
  = Agent 的外部工作区
  + 上下文按需加载机制
  + 中间产物交换接口
  + 可替换存储抽象
```

它最核心的作用是控制活跃工作集：让资料和产物保持可访问，却不要求它们始终占据模型上下文。

### 自测

1. 为什么说模型上下文更像工作集，而不是硬盘？
2. Virtual FS 为什么没有扩大模型的上下文窗口？
3. Offload 为什么依赖文件 Backend？
4. 文件路径怎样帮助 Agent 管理中间产物？
5. `glob → grep → read_file` 为什么比直接读取所有文件更合理？
6. 文件怎样帮助主 Agent 与子 Agent 协作而不共享全部上下文？
7. 为什么 `StateBackend` 不能直接当成跨线程长期记忆？
8. Virtual FS 不能替代哪些安全和数据基础设施？

---

## 08 Virtual FS 长文本的处理办法

### 本节目标

学完这一节，应该能够：

- 解释为什么长文本不应该默认一次性全文读取；
- 为长文本建立便于检索的目录和文件边界；
- 使用 `glob` 缩小候选文件范围；
- 使用多个字面量锚点和 `grep` 定位证据；
- 使用 `read_file` 的 `offset`、`limit` 分页读取；
- 建立带文件路径和行号的证据索引；
- 区分定点检索与全文覆盖任务；
- 识别字面量搜索对语义问题的局限；
- 用程序验证长文本没有被整体送入消息轨迹。

本节依据 LangChain 官方的
[Deep Agents Backends](https://docs.langchain.com/oss/javascript/deepagents/backends)和
[Context Engineering](https://docs.langchain.com/oss/javascript/deepagents/context-engineering)整理。配套实验位于
[`src/examples/08-virtual-fs-long-text.ts`](../deepagents-planning-lab/src/examples/08-virtual-fs-long-text.ts)。

### 1. 长文本处理的默认策略不是全文读取

面对一个数万行文件，直接调用一次无边界的 `read_file` 有三个问题：

1. 可能超过工具结果或模型上下文限制；
2. 大量无关内容会稀释模型对关键证据的注意力；
3. 后续每一步都可能继续携带这份大结果，增加 token 和延迟。

更稳妥的默认路线是：

```text
发现文件 → 搜索锚点 → 获取行号 → 读取附近片段 → 保存证据索引
```

只有任务明确要求全文统计、逐条审查或证明没有遗漏时，才设计完整的分块遍历流程。

### 2. 先把长文本组织成可检索语料

Virtual FS 能搜索文件，但目录和文件边界仍需应用设计。建议按来源或职责拆分，而不是把所有信息塞进
一个没有结构的超大文件：

```text
/corpus/
├── service.log       运行事实
├── policy.md         判断规则
└── decisions.md      历史决策
```

好的文件名、稳定标识符、时间、事件 ID 和章节标题都可以成为检索锚点。如果数据在写入时就丢失了这些
结构，后续 Agent 再聪明也只能进行成本更高、可靠性更低的模糊判断。

### 3. 第一步用 glob 发现候选文件

当文件名或扩展名可预测时，先缩小语料范围：

```text
glob(pattern="**/*.md", path="/corpus")
glob(pattern="**/*.log", path="/corpus")
```

`glob` 搜索的是路径，不读取正文。它适合回答“有哪些文件可能相关”，也能避免随后在图片、音频等不
相关文件中搜索文本。

### 4. 第二步用多个锚点 grep 定位

本节实验分别搜索三个稳定标识符：

```text
INCIDENT-AUTH-TIMEOUT
POLICY-AUTH-SLO-5000
DECISION-ROLLBACK-2026-08
```

```ts
grep({
  pattern: "INCIDENT-AUTH-TIMEOUT",
  path: "/corpus"
});
```

`grep` 返回文件路径、行号和命中行。它执行字面量匹配，不是正则；不要用 `timeout|latency` 期待匹配
两个词，应分别搜索。多个锚点还能避免只找到事故却遗漏政策或最终决策。

### 5. 第三步按行读取命中附近内容

命中行本身可能缺少上下文，因此读取前后几行：

```ts
read_file({
  file_path: "/corpus/service.log",
  offset: 1372,
  limit: 6
});
```

`offset` 从 0 开始，工具显示的行号从 1 开始。本例目标位于原文第 1,375 行，所以从 `1372` 开始可以
读到目标附近。不要把工具显示时附加的行号当成文件原文。

如果第一次片段不完整，可以向前或向后调整 `offset`，而不是立刻读取整个文件。

### 6. 把证据写成二级索引

长任务中不要只依赖 ToolMessage 记住命中。把已验证事实写成小型证据文件：

```markdown
# Authentication timeout evidence

- incident: INCIDENT-AUTH-TIMEOUT; source=/corpus/service.log:1375
- policy: POLICY-AUTH-SLO-5000; source=/corpus/policy.md:842
- decision: DECISION-ROLLBACK-2026-08; source=/corpus/decisions.md:701
- conclusion: BLOCK_AND_ROLLBACK
```

这样形成两层结构：

```text
第一层：完整原文，容量大、按需读取
第二层：证据索引，容量小、适合汇总与复核
```

索引必须保留来源路径和行号，否则摘要一旦写错，就很难回到原文核验。

### 7. 定点检索和全文覆盖是两种任务

“查出这个事故的门禁与决策”属于定点检索，搜索加局部读取通常足够。

“统计全文所有事故”“检查每一条合同义务”则属于全文覆盖，必须确保每块都处理：

```text
按章节或固定行数分块
  ↓
记录 chunk 位置与处理状态
  ↓
每块提取结构化结果
  ↓
合并、去重、交叉检查
  ↓
验证所有 chunk 都已覆盖
```

不能因为 `grep` 找到三个命中，就宣称已经完整阅读了全文。任务的召回要求决定读取策略。

### 8. 没有稳定关键词时怎么办

`grep` 只能做字面量检索。用户问“哪些地方暗示登录体验恶化”时，原文可能只出现“认证耗时”“重试”
或“会话建立失败”，没有用户问题中的原词。

可采用分层方案：

1. 先用多个同义锚点扩大字面量召回；
2. 在数据进入 VFS 时生成章节目录、实体索引或短摘要；
3. 用自定义全文检索或向量检索工具筛选候选片段；
4. 对必须完整覆盖的任务分块调用模型；
5. 用子 Agent 分担不同文件，再把结构化结果写回共享工作区。

Virtual FS 提供存储和文件操作表面，不会自动提供语义检索质量。

### 9. 给读取过程设置预算并做验收

长文本 Agent 应显式控制：

| 预算 | 示例 |
| --- | --- |
| 文件范围 | 只搜索 `/corpus` |
| 命中数量 | 使用 `max_count` 防止结果爆炸 |
| 单次读取 | 每次 5～100 行，而非全文 |
| 总读取量 | 限制累计片段数量或字符量 |
| 来源完整性 | 每条结论必须记录路径和行号 |
| 覆盖状态 | 全文任务记录每个 chunk 是否完成 |

配套实验使用离线 Fake Model，对 3 份、共 3,600 行语料执行三次锚点搜索、三次证据片段读取，并在
最后读取一次生成的证据索引：

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:08
```

关键代码：

```ts
const readCharacters = observations
  .filter((item) => item.name === "read_file")
  .reduce((sum, item) => sum + item.content.length, 0);

const sourceCharacters = textLength(initialFiles);
```

程序还检查消息轨迹没有出现源文件首尾的填充记录，从而证明没有把三份全文整体读入上下文。字符比例
仅表示本实验的局部读取规模，不等同于精确 token 用量。

### 本节结论

```text
长文本处理
  = 文件分层
  + 候选发现
  + 多锚点定位
  + 分页读取
  + 带来源的证据索引
  + 与任务召回要求匹配的覆盖策略
```

Virtual FS 让长文本保持“可访问”，搜索与分页让其中必要的部分在正确时机进入上下文。

### 自测

1. 为什么不应默认一次读取完整长文件？
2. `glob`、`grep` 和 `read_file` 在检索链中的职责分别是什么？
3. `read_file.offset` 为什么与工具显示的行号相差 1？
4. 为什么要使用多个锚点，而不是只搜索事故编号？
5. 证据索引为什么必须保留来源路径和行号？
6. 定点检索与全文覆盖分别适合什么策略？
7. 没有稳定关键词时，可以怎样提高语义召回？
8. 应该为长文本读取设置哪些预算和验收条件？

---

## 09 10 万字上下文 Agent 如何处理与优化

### 本节目标

学完这一节，应该能够：

- 区分字符数、token 数和模型上下文窗口；
- 根据任务的召回要求选择处理路线；
- 设计原文层、索引层、工作集和产物层；
- 对超长语料进行结构化切分并保留来源位置；
- 为定点问题设计混合检索和证据复核；
- 为全文任务设计 Map-Reduce 与覆盖账本；
- 正确组合 Offload、Summarization 和子 Agent；
- 为 token、调用、读取和并发设置预算；
- 用评估指标验证答案完整性与可追溯性。

本节主要依据 LangChain 官方的
[Deep Agents Context Engineering](https://docs.langchain.com/oss/javascript/deepagents/context-engineering)、
[Backends](https://docs.langchain.com/oss/javascript/deepagents/backends)和
[Subagents](https://docs.langchain.com/oss/javascript/deepagents/subagents)。配套离线实验位于
[`src/examples/09-100k-context.ts`](../deepagents-planning-lab/src/examples/09-100k-context.ts)。

### 1. 先别把“10 万字”直接当成“10 万 token”

字符、词和 token 不是同一个单位。中文、英文、数字、代码和标点的分词方式不同，不同模型的 tokenizer
也可能不同，因此不能用固定的“一个汉字等于一个 token”做容量设计。

真正需要确认的是：

```text
模型最大输入是多少？
系统提示、工具 Schema 和消息历史已经占多少？
本轮还要为工具结果和模型输出预留多少？
上下文越长时，模型检索关键信息的可靠性是否下降？
```

10 万字即使能一次塞进某个长上下文模型，也不代表成本、延迟、注意力质量和后续多轮调用都可以接受。
应使用目标模型对应的 tokenizer 或服务端 usage 数据测量，而不是只看 JavaScript 字符串长度。

### 2. 先按任务类型选路线

处理方式由任务目标决定，而不只由文本长度决定：

| 任务 | 示例 | 优先路线 |
| --- | --- | --- |
| 定点问答 | 某个事故的负责人是谁 | 检索 → 局部读取 → 引用 |
| 多点归纳 | 找出所有 P0/P1 风险 | 多查询检索 → 去重 → 汇总 |
| 全文摘要 | 总结整份尽调材料 | 分层摘要 / Map-Reduce |
| 完整审计 | 检查每项合同义务 | 全量分块 → 覆盖账本 → 逐块验收 |
| 全文改写 | 将整本手册改成新规范 | 按章节处理 → 保持结构 → 全局一致性复核 |

如果任务只需要一个事实，遍历全文浪费成本；如果任务要求“全部”，只搜索几个关键词又会漏项。

### 3. 建立四层上下文架构

不要把 10 万字设计成一个巨大 Prompt。更合适的是分层：

```text
原文层：/corpus/*                完整、不可随意丢失
索引层：/workspace/index/*       目录、实体、关键词、证据位置
工作集：当前模型调用             目标 + 少量候选片段
产物层：/workspace/output/*      报告、覆盖账本、结构化结果
```

原文是事实真源，索引帮助定位，工作集只保留当前步骤必要内容，产物层保存可验收结果。摘要不能替代原文，
因为摘要可能遗漏细节或引入错误；需要时必须能够沿来源位置回查。

### 4. 语料切分要保留结构与来源

优先按自然结构切分：章节、标题、日志时间窗、代码模块、合同条款。只有缺少结构时才使用固定 token 或
字符窗口，并保留少量重叠，防止一句话或一个事件恰好跨越边界。

每个块至少记录：

```ts
type CorpusChunk = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
};
```

重叠会提高边界召回，却会产生重复结果，所以 Reduce 阶段需要按稳定 ID 和来源去重。块过小会增加调用
次数并割裂语义，块过大则重新造成上下文拥挤；应在真实任务集上评估。

### 5. 定点任务采用多阶段检索

对于局部问题，推荐：

```text
metadata/path filter
  → 字面量搜索或向量召回
  → 多查询扩大召回
  → 重排候选片段
  → read_file 读取完整证据段
  → 生成带来源答案
```

Virtual FS 的 `glob`、`grep` 和分页 `read_file` 能完成路径过滤、字面量定位和证据读取。语义问题还需
自定义向量检索、全文搜索或预生成索引。最终答案应引用原文片段，而不是只引用向量库中的摘要。

### 6. 全覆盖任务使用 Map-Reduce 与覆盖账本

必须阅读全部语料时，需要把“是否处理完”变成显式状态：

```text
Planner：生成所有 chunk 与 pending 状态
   ↓
Map：每个 chunk 提取相同 Schema 的结果
   ↓
Ledger：成功才把该 chunk 标记 completed
   ↓
Reduce：去重、合并、检查冲突
   ↓
Verifier：确认 completed === total，再允许输出最终结论
```

结构化 Map 输出示例：

```ts
type RiskFinding = {
  riskId: string;
  severity: string;
  owner: string;
  mitigation: string;
  sourcePath: string;
  sourceLine: number;
};
```

即使前几个块已经发现重要风险，也不能提前结束“找出全部风险”的任务。失败块应重试或进入人工处理，
不能悄悄从分母中删除。

### 7. Offload、Summarization 与子 Agent 各有职责

| 机制 | 解决的问题 | 不能替代什么 |
| --- | --- | --- |
| Virtual FS / Offload | 把大内容移出活跃消息并保留原文 | 不做语义理解 |
| Summarization | 压缩已经发生的长消息历史 | 不能保证保留所有原文细节 |
| 子 Agent | 隔离不同文件或子任务的上下文 | 不自动保证汇总完整 |
| Evidence Index | 保存结构化结论和来源位置 | 不能代替原始证据 |
| Coverage Ledger | 证明所有分块都处理过 | 不能证明每个 Map 结果正确 |

大型任务常见组合是：原文保存在 VFS，多个子 Agent 分块处理，结果写入索引；主 Agent 只读取结构化
结果和少量证据；会话历史过长时再进行 Summarization。

### 8. 用预算控制成本、延迟和失败半径

至少设置以下预算：

- 单块最大 token 和为输出预留的 token；
- 每个任务最大模型调用次数和重试次数；
- 每次 `grep` 最大命中数和每次读取最大行数；
- 子 Agent 最大并发数，避免触发限流；
- 单次任务总 token、总费用和最长执行时间；
- 摘要、索引和 Map 结果的缓存策略；
- 中断后从覆盖账本恢复，而不是从第一个块重跑。

并行可以降低墙钟时间，但不会自动减少总 token，并且可能增加限流、重复调用和汇总冲突。应使用有界
并发，而不是一次启动所有子任务。

### 9. 优化必须用完整性指标验证

只看“回答很流畅”无法证明 10 万字处理正确。评估至少包括：

| 指标 | 要回答的问题 |
| --- | --- |
| Chunk coverage | 所有要求处理的块是否完成？ |
| Evidence recall | 植入或标注的关键事实找回了多少？ |
| Citation accuracy | 路径和行号是否真的支持结论？ |
| Contradiction rate | 不同块的冲突是否被发现？ |
| Deduplication | 重叠块是否造成重复计数？ |
| Cost / latency | token、调用数和耗时是否在预算内？ |
| Resume correctness | 中断恢复后是否遗漏或重复处理？ |

配套实验生成 10 份、超过 10 万字的语料，以 50 行一块、2 行重叠完成全量 Map，使用覆盖账本确认所有
块已完成，再去重 12 个植入风险：

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:09
```

核心过程：

```ts
for (const chunk of chunks) {
  mappedFindings.push(...mapChunk(chunk));
  coverage.push({ chunkId: chunk.id, status: "completed" });
}

const findings = reduceFindings(mappedFindings);

if (coverage.length !== chunks.length) throw new Error("覆盖不完整");
if (findings.length !== expectedRiskCount) throw new Error("召回不完整");
```

实验使用确定性解析器模拟 Map 步骤，因此不调用模型 API。生产环境可以把 `mapChunk` 换成结构化模型
调用或子 Agent，但覆盖、去重、冲突检查和来源验收仍应由应用代码负责。

### 本节结论

```text
10 万字处理能力
  ≠ 模型窗口足够大
  = 正确的任务路由
  + 分层上下文
  + 可恢复的分块执行
  + 有来源的结构化汇总
  + 成本预算与质量评估
```

长上下文模型可以提高单次可见范围，但可靠系统仍要控制工作集、保存原文、证明覆盖并验证证据。

### 自测

1. 为什么 10 万字不能直接换算成 10 万 token？
2. 定点问答和完整审计的处理路线为什么不同？
3. 原文层、索引层、工作集和产物层分别保存什么？
4. 分块重叠带来什么收益和副作用？
5. Coverage Ledger 能证明什么，不能证明什么？
6. Offload、Summarization 和子 Agent 的职责分别是什么？
7. 并行处理为什么不一定降低总成本？
8. 怎样验证一个 Agent 真的处理完了全部 10 万字？

---

## 10 自定义 Tools

### 本节目标

学完这一节，应该能够：

- 解释 Tool 在 Agent Loop 中的位置；
- 使用 `tool()`、名称、描述和 Zod Schema 定义工具；
- 把自定义 Tool 注册给 Deep Agent；
- 区分参数校验、业务校验和权限校验；
- 通过依赖注入连接数据库或领域服务；
- 设计稳定、精简、可恢复的工具结果；
- 为有副作用的工具增加确认、幂等和审计边界；
- 独立测试 Tool，并验证 Agent 的完整调用轨迹。

本节主要依据 LangChain 官方的
[Tools](https://docs.langchain.com/oss/javascript/langchain/tools)、
[Customize Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/customization)、
[Human-in-the-loop](https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop)和
[Permissions](https://docs.langchain.com/oss/javascript/deepagents/permissions)。配套离线实验位于
[`src/examples/10-custom-tools.ts`](../deepagents-planning-lab/src/examples/10-custom-tools.ts)。

### 1. Tool 是模型与真实世界之间的受控接口

模型本身不会访问订单库，也不会直接执行 TypeScript 函数。它只会看到 Tool 的名称、描述和参数
Schema，然后生成一条结构化调用请求；Agent 运行时负责校验和执行：

```text
用户目标
  ↓
模型读取 name + description + schema
  ↓
模型生成 tool call：get_order({ orderId: "ORD-1001" })
  ↓
运行时校验参数并调用 TypeScript 实现
  ↓
结果转换为 ToolMessage，交还模型继续判断
```

因此，一个业务 Tool 至少包含两份契约：

- **给模型的契约**：什么时候调用、需要哪些参数、会产生什么影响；
- **给业务系统的契约**：权限、数据一致性、错误、超时、重试和审计怎样处理。

普通函数只有“应用调用函数”这一层；Tool 还要让一个不完全可靠的模型正确选择和填写它。

### 2. 最小定义由实现、名称、描述和 Schema 组成

使用 `tool()` 包装普通函数，再传给 `createDeepAgent({ tools })`：

```ts
import { tool } from "langchain";
import { createDeepAgent } from "deepagents";
import { z } from "zod";

const getOrder = tool(
  async ({ orderId }) => JSON.stringify(await orderService.find(orderId)),
  {
    name: "get_order",
    description: "按订单号读取实付金额、币种和状态。这是只读工具。",
    schema: z.object({
      orderId: z.string().regex(/^ORD-\d{4}$/)
    })
  }
);

const agent = createDeepAgent({
  model,
  tools: [getOrder]
});
```

传入的自定义 Tool 会与 Deep Agents Harness 提供的文件、子 Agent 等工具共同进入 Agent。工具名应保持
唯一，避免与内置工具或其他中间件提供的工具冲突。

### 3. 名称、描述和 Schema 共同影响模型选择

`name` 和 `description` 不是装饰文字，而是模型路由工具时的主要信息：

```ts
{
  name: "create_refund_request",
  description:
    "创建退款申请，会产生业务写入。仅在用户明确确认、且已用 get_order 核对金额后调用。",
  schema: z.object({
    orderId: z.string().describe("已核对的订单编号"),
    amountCents: z.number().int().positive().describe("退款金额，单位为分"),
    reason: z.string().min(8).max(200).describe("退款原因"),
    idempotencyKey: z.string().describe("防止重复写入的稳定幂等键")
  })
}
```

设计时遵循以下原则：

- 名称使用稳定的 `snake_case` 动词短语，例如 `get_order`，不要使用含糊的 `handle`；
- 描述说明用途、前置条件、是否只读以及副作用，不要只重复工具名；
- 参数使用业务含义明确的字段，金额同时写明单位；
- 用 `enum`、`min`、`max`、`regex` 和字段 `describe()` 缩小错误空间；
- 不要设计一个同时负责查询、判断、修改和通知的万能 Tool。

工具越多、名称越相似，模型越容易选错。可以按当前角色只暴露必要的最小工具集。

### 4. Schema 校验不等于业务校验，更不等于授权

Zod 能确认 `amountCents` 是正整数，却不知道它是否超过订单实付金额，也不知道当前用户是否有退款权限：

```ts
amountCents: z.number().int().positive().max(1_000_000)

// Tool 实现中的业务校验
if (amountCents > order.paidAmountCents) {
  return error("AMOUNT_EXCEEDS_PAYMENT", "退款金额超过实付金额");
}

// 授权依据来自应用控制的服务，不能只相信模型参数
if (!approvals.isApproved(orderId)) {
  return error("REFUND_NOT_APPROVED", "尚未通过应用层退款确认");
}
```

即使 Schema 要求模型传入 `confirmation: "CONFIRM_REFUND"`，这个字段仍是模型自己生成的，不能证明
真人真的确认过。生产环境应从登录态、服务端权限、可信审批记录或 Human-in-the-loop 中取得授权，
并在 Tool 内再次检查。

可以把三层边界记成：

```text
Schema：参数长什么样
业务规则：这个操作现在是否成立
授权规则：这个调用者是否可以执行
```

### 5. 用依赖注入连接领域服务，不把基础设施塞进 Schema

数据库连接、API Client、密钥和审批服务都应该由应用创建，再通过闭包或工厂函数注入 Tool：

```ts
function createOrderTools(
  gateway: OrderGateway,
  approvals: RefundApprovalStore
) {
  const getOrder = tool(async ({ orderId }) => {
    return gateway.findOrder(orderId);
  }, getOrderDefinition);

  const createRefundRequest = tool(async (input) => {
    if (!approvals.isApproved(input.orderId)) {
      return createNotApprovedResult(input.orderId);
    }
    return gateway.createRefund(input);
  }, createRefundDefinition);

  return { getOrder, createRefundRequest };
}
```

这样模型只生成业务参数，无法指定数据库地址、访问令牌或任意表名，也方便用内存实现替换生产服务做测试。
每次调用才确定的用户 ID、会话信息、持久化 Store 和进度流，可以通过 `ToolRuntime` 读取；同样不要让
模型把这些可信身份信息作为普通参数伪造出来。

### 6. 结果和错误都应稳定、精简、可行动

可预期的失败不是系统崩溃。订单不存在、余额不足或状态不允许时，可以返回统一业务结果：

```ts
type ToolResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
    };
```

稳定错误码能让模型或确定性代码选择“修改参数、换工具、稍后重试或停止”。数据库断连、程序 Bug 等
非预期故障可以抛出异常，再由重试、中间件和监控处理；不要把堆栈、SQL、密钥或内部网络信息返回给
模型。

工具结果只返回下一步决策所需的数据。查询得到上万行时，应分页、过滤、聚合或写入 Virtual FS，
不要让整个数据库响应进入活跃上下文。

### 7. 写操作必须具备安全边界和幂等性

读取工具和写入工具应分开，因为它们的权限、审批与重试策略不同。退款实验使用稳定幂等键防止同一
请求因网络重试执行两次：

```ts
const existing = refundsByIdempotencyKey.get(idempotencyKey);
if (existing) return { ...existing, replayed: true };

const refund = await createRefund();
refundsByIdempotencyKey.set(idempotencyKey, refund);
return { ...refund, replayed: false };
```

生产写工具还应考虑：

- 最小权限的服务账号与资源范围；
- 在服务端重新计算金额和归属关系；
- 超时、有限重试、速率限制和熔断；
- `userId`、`toolCallId`、参数摘要和结果的审计日志；
- 删除、转账、发送消息等高风险操作使用 `interruptOn` 暂停并等待人工审批；
- Human-in-the-loop 需要 Checkpointer，才能安全暂停和恢复执行。

特别注意：Deep Agents 的 `permissions` 只约束内置文件系统工具，不会自动保护自定义 Tool。自定义
Tool 访问文件、数据库或外部 API 时，必须在自己的服务边界中实现权限策略。

### 8. 根据用途选择 Tool 的返回方式

最常见的是返回字符串或可序列化对象，运行时会把它转换成模型可见的 ToolMessage：

| 返回方式 | 适用场景 |
| --- | --- |
| 简短字符串 | 简单事实或操作结果 |
| 结构化对象 / JSON | 稳定字段、错误码和后续程序化处理 |
| 文本加 Artifact | 模型看摘要，应用保留额外产物 |
| `Command` | Tool 需要显式更新 Graph State |
| Virtual FS 路径 | 结果很大，需要后续搜索或分页读取 |

不要因为模型最终要生成自然语言，就让 Tool 只返回一段含糊文字。稳定字段更容易测试、去重、追踪和
演进。版本升级时应优先增加可选字段；修改字段含义或错误码属于契约变更。

### 9. 先独立测试 Tool，再测试 Agent 是否正确使用它

配套实验分三层验收：

```text
Tool 单测：非法金额是否被 Zod 拒绝
业务契约：未知订单是否返回 ORDER_NOT_FOUND
授权边界：模型填写确认字段，是否仍不能绕过应用审批
Agent 集成：是否先 get_order，再 create_refund_request
副作用验收：相同幂等键重试后，数据库是否仍只有一条记录
```

Tool 可以脱离 Agent 直接调用：

```ts
await getOrder.invoke({ orderId: "ORD-1001" });
await createRefundRequest.invoke(refundArgs);
```

Agent 集成测试则可用 `FakeToolCallingModel` 固定工具轨迹，不消耗模型 API，也不会受真实模型输出波动
影响。生产环境还应记录调用次数、耗时、错误码、重试、输入输出大小和副作用结果，并通过 Trace 回放
失败案例。

运行实验：

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:10
```

### 本节结论

```text
可靠的自定义 Tool
  = 清晰的模型契约
  + 严格的参数 Schema
  + 服务端业务与权限校验
  + 稳定精简的结果
  + 可控制、可幂等的副作用
  + 独立测试与完整可观测性
```

`tool()` 只是入口。真正决定 Tool 能否进入生产环境的，是模型无法绕过的业务边界和可验证的执行契约。

### 自测

1. 模型调用 Tool 时，真正执行 TypeScript 函数的是谁？
2. `name`、`description` 和 `schema` 分别承担什么职责？
3. 为什么 Zod 校验通过仍不代表退款操作合法？
4. 为什么模型传入 `confirmation: "CONFIRM_REFUND"` 不能作为真正授权？
5. 为什么数据库连接和用户身份不应该成为模型生成的 Tool 参数？
6. 业务失败和基础设施异常应该怎样分别处理？
7. 幂等键解决什么问题，为什么写操作尤其需要它？
8. 为什么要分别测试 Tool 实现和 Agent 工具选择？

---

## 11 Subagent 的设计与使用

### 本节目标

学完这一节，应该能够：

- 解释主 Agent、`task` 工具和子 Agent 的协作关系；
- 判断任务应该直接执行还是委派；
- 使用 `SubAgent` 配置专业子 Agent；
- 为委派任务设计清晰的输入和验收契约；
- 解释子 Agent 如何隔离中间消息与工具结果；
- 为不同子 Agent 分配提示词、工具和模型；
- 使用结构化输出减少主 Agent 汇总歧义；
- 区分同步与异步子 Agent；
- 验证委派轨迹、结果质量和上下文隔离。

本节主要依据 LangChain 官方的
[Deep Agents Subagents](https://docs.langchain.com/oss/javascript/deepagents/subagents)、
[Context Engineering](https://docs.langchain.com/oss/javascript/deepagents/context-engineering)、
[Event Streaming](https://docs.langchain.com/oss/javascript/deepagents/event-streaming)和
[Async Subagents](https://docs.langchain.com/oss/javascript/deepagents/async-subagents)。配套离线实验位于
[`src/examples/11-subagents.ts`](../deepagents-planning-lab/src/examples/11-subagents.ts)。

### 1. Subagent 是由主 Agent 调度的隔离工作单元

Deep Agents 采用 Supervisor 模式：用户只与主 Agent 交互，主 Agent 通过统一的 `task` 工具选择子 Agent，
子 Agent 独立完成任务后返回一份结果：

```text
用户
  ↓
主 Agent / Supervisor
  ├─ task(subagent_type="api-reviewer", description="...")
  │       └─ 子 Agent 内部：模型 → 工具 → 模型 → 最终结果
  ├─ task(subagent_type="data-reviewer", description="...")
  │       └─ 子 Agent 内部：模型 → 工具 → 模型 → 最终结果
  ↓
主 Agent 比较结果并回复用户
```

`task` 不是直接运行一个工具，而是启动一次新的 Agent Loop。主 Agent 决定委派对象和任务描述，子 Agent
自己决定内部步骤；同步子 Agent 完成前，主 Agent 会等待其返回。

当前 TypeScript 包中的 `task` 主要参数是：

```ts
{
  subagent_type: "api-reviewer",
  description: "审查 REL-2026-09 的 API 门禁，并返回结论和证据。"
}
```

### 2. 只有值得隔离的任务才应该委派

适合 Subagent 的任务通常至少满足一项：

- 需要连续多步搜索、读取或分析，会产生很多中间内容；
- 需要独立的领域提示词，例如法务、数据或代码审查；
- 只应获得一组受限工具或数据权限；
- 适合使用不同模型，例如便宜模型筛选、强模型复核；
- 多个子任务边界清楚，主 Agent 只需要最终结论。

不适合委派的情况：

- 一次简单查询或一次计算；
- 子任务与主对话高度耦合，必须频繁读取所有历史细节；
- 主 Agent 仍然需要子 Agent 的每个中间步骤；
- 委派的模型调用、延迟和汇总成本超过任务本身。

Subagent 不会自动提高答案质量。它真正提供的是隔离、专业化和调度边界；任务划分不合理时，只会增加
调用次数和信息损失。

### 3. `SubAgent` 配置定义了一个专家的身份与能力

最常用的是声明式 `SubAgent`：

```ts
import { createDeepAgent, type SubAgent } from "deepagents";

const apiReviewer: SubAgent = {
  name: "api-reviewer",
  description: "审查 API 契约测试和兼容性；不要用于数据迁移。",
  systemPrompt: "你是 API 审查员。必须引用证据编号。",
  tools: [readApiEvidence],
  model: apiModel,
  responseFormat: reviewSchema
};

const supervisor = createDeepAgent({
  model: supervisorModel,
  subagents: [apiReviewer]
});
```

| 字段 | 作用 |
| --- | --- |
| `name` | `task.subagent_type` 使用的稳定标识 |
| `description` | 帮助主 Agent 判断何时选择它 |
| `systemPrompt` | 规定子 Agent 的角色、规则、工具用法和输出要求 |
| `tools` | 允许它使用的业务工具集合 |
| `model` | 可选的模型覆盖；未指定时使用默认模型 |
| `responseFormat` | 约束返回给主 Agent 的结构化结果 |
| `middleware` | 增加日志、限流、重试等横切能力 |
| `interruptOn` | 指定子 Agent 的高风险工具审批策略 |
| `skills` | 指定该子 Agent 自己可以加载的 Skills |

如果需要精确的分支、循环或确定性节点，可以把编译好的 LangGraph 作为 `CompiledSubAgent.runnable` 接入。

### 4. 委派描述是一份任务交接单

子 Agent 不应该靠猜测理解主 Agent 的意图。一个合格的 `description` 至少说明：

```text
目标：要解决什么问题
输入：批次、文件、时间范围或已知事实
边界：做什么、不做什么
规则：必须遵守的判断标准
输出：字段、篇幅和来源要求
验收：怎样才算完成
```

例如：

```ts
description: `
审查 REL-2026-09 的数据迁移门禁。
只使用迁移证据，不分析 API。
演练通过率不足 100% 时必须返回 BLOCK。
输出 area、decision、summary、evidenceIds。
`
```

不要只写“研究一下数据库”。也不要把整个主对话无选择地复制过去；应传递子任务需要的最小充分上下文。
任务依赖另一个子 Agent 的结论时，主 Agent 应把已验证的结论明确加入下一次交接，而不是假设两个子 Agent
能够互相读取对方的对话。

### 5. 隔离的是工作上下文，不等于安全隔离

同步子 Agent 启动时使用新的消息上下文，内部的搜索、文件读取和工具调用不会逐条进入主 Agent 消息；
主 Agent 通常只获得最后一条报告或 `structuredResponse`：

```text
子 Agent 上下文：任务说明 + 读取证据 + 多轮工具消息 + 推理 + 最终报告
主 Agent 上下文：task 调用 + 最终报告
```

这可以显著减小主 Agent 的上下文污染，但要注意：

- 子 Agent 可能使用同一个 Backend，写入的 Virtual FS 产物可以成为跨 Agent 的协作接口；
- 运行时 Context 会传播给子 Agent，工具仍需执行服务端权限校验；
- 文件和状态的共享方式取决于 Backend 与中间件配置；
- 消息隔离不是进程沙箱、数据权限或租户隔离。

如果子 Agent 处理敏感数据，仍需最小权限工具、路径权限、沙箱、审批和审计。

### 6. 专业化来自明确边界，而不是多起一个名字

一个有效的专业子 Agent 应同时缩小四个范围：

| 范围 | 设计问题 |
| --- | --- |
| 职责 | 它只负责哪一种成果？ |
| 工具 | 完成任务最少需要哪些工具？ |
| 提示词 | 必须使用什么规则与输出格式？ |
| 模型 | 需要速度、成本、长上下文还是强推理？ |

配套实验中：

```ts
api-reviewer  → tools: [readApiEvidence]
data-reviewer → tools: [readDataEvidence]
```

两个专家不能调用对方的业务证据工具，从配置上减少越权和误用。工程中应显式声明自定义子 Agent 的工具，
不要依赖模糊的继承预期。

Deep Agents 还会提供 `general-purpose` 子 Agent，适合只需要上下文隔离、没有领域专长的复杂任务。
自定义子 Agent 的 Skills 默认独立配置；不能假设主 Agent 的所有领域能力都会自动继承。

### 7. 主从接口优先使用结构化输出

自由文本适合叙述，但不适合可靠汇总。可以给不同专家使用相同 Schema：

```ts
const reviewSchema = z.object({
  area: z.enum(["api", "data"]),
  decision: z.enum(["PASS", "BLOCK"]),
  summary: z.string(),
  evidenceIds: z.array(z.string()).min(1)
});
```

主 Agent 因而可以使用确定性规则汇总：

```ts
const overallDecision = reviews.some(
  (review) => review.decision === "BLOCK"
) ? "BLOCK" : "PASS";
```

Schema 只能保证结果形状，不能保证事实正确。主 Agent 或 Verifier 仍应检查证据编号、来源、覆盖率和冲突。
如果结果很大，子 Agent 可以把完整产物写入 Virtual FS，只返回摘要、路径和关键证据。

### 8. 根据等待方式选择同步或异步 Subagent

| 类型 | 主 Agent 行为 | 适合场景 |
| --- | --- | --- |
| 同步 Subagent | `task` 返回前等待完成 | 当前回答必须使用子任务结果 |
| 异步 Subagent | 启动后立即得到任务 ID，可继续交互 | 长时间研究、可并行后台任务 |

本节示例使用同步 `task`，并按 API → 数据迁移顺序委派。独立任务可以并行降低墙钟时间，但总模型调用
和 token 通常不会因此减少，还需要处理限流、超时、部分失败和结果顺序。

异步 Subagent 适合需要查询状态、追加指令或取消的长任务，但执行和部署模型更复杂，应在同步方案确实
阻塞用户体验时再采用。不要启动异步任务后立即循环轮询，否则只是把同步等待换了一个写法。

### 9. 同时观察主 Agent 和子 Agent 的验收指标

只检查最终答案不足以证明委派设计有效，至少验证：

- 主 Agent 是否选择了正确的 `subagent_type`；
- 交接描述是否包含必要输入、边界和输出格式；
- 子 Agent 是否只调用允许的工具；
- 子 Agent 是否返回符合 Schema 且带证据的结果；
- 主 Agent 是否发现冲突，并按规则完成汇总；
- 子 Agent 的中间工具消息是否留在隔离上下文；
- 调用数、token、耗时、失败率和重试是否在预算内。

生产环境可以使用 `streamEvents()` 的 `subagents` 投影分别观察子 Agent 的生命周期、消息和工具调用，
并用 Agent 名称关联 Trace。配套实验则用 Fake Model 做确定性验收：

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:11
```

实验预期：

```text
子 Agent 内部工具：api=1, data=1
主 Agent 工具轨迹：task → task
主上下文包含内部工具名：否
api：PASS
data：BLOCK
整体发布结论：BLOCK
```

Fake Model 为了模拟真实模型的结构化输出，会显式调用测试 Schema 对应的提取工具；生产代码只需配置
`responseFormat`，由支持工具调用或原生结构化输出的模型生成结果。

### 本节结论

```text
可靠的 Subagent 系统
  = 值得隔离的子任务
  + 清晰的专家职责和最小工具集
  + 完整的任务交接单
  + 精简、结构化、带证据的返回值
  + 主 Agent 的确定性验收与汇总
  + 分层可观测性和成本预算
```

Subagent 的重点不是“Agent 越多越好”，而是让复杂工作在清楚的上下文与权限边界内完成，并只把主流程
真正需要的信息带回来。

### 自测

1. `task` 工具和普通业务 Tool 的执行深度有什么区别？
2. 哪些任务值得委派，哪些任务直接执行更合适？
3. `name`、`description` 和 `systemPrompt` 分别服务于谁？
4. 一份合格的任务交接描述应包含哪些内容？
5. 为什么上下文隔离不能等同于安全隔离？
6. 为什么应给专业子 Agent 分配最小工具集？
7. 结构化输出解决了什么问题，不能保证什么？
8. 同步和异步 Subagent 的主要区别是什么？

---

## 12 Subagent 一些要注意的问题

### 本节目标

学完这一节，应该能够：

- 避免把简单任务过度拆成多 Agent；
- 用任务契约防止子 Agent 缺少必要上下文；
- 发现描述重叠和错误路由；
- 控制子 Agent 的工具、权限和递归深度；
- 把子 Agent 返回值视为需要校验的数据；
- 避免并发修改共享状态造成竞争；
- 正确设计超时、有限重试和部分失败；
- 控制并发、token、延迟与异步任务生命周期；
- 检测结论冲突并升级人工复核。

本节主要依据 LangChain 官方的
[Deep Agents Subagents](https://docs.langchain.com/oss/javascript/deepagents/subagents)、
[LangChain Subagents](https://docs.langchain.com/oss/javascript/langchain/multi-agent/subagents)、
[Multi-agent](https://docs.langchain.com/oss/javascript/langchain/multi-agent)、
[Async Subagents](https://docs.langchain.com/oss/javascript/deepagents/async-subagents)和
[Event Streaming](https://docs.langchain.com/oss/javascript/deepagents/event-streaming)。配套离线实验位于
[`src/examples/12-subagent-guardrails.ts`](../deepagents-planning-lab/src/examples/12-subagent-guardrails.ts)。

### 1. 不要为了“多 Agent”而过度委派

每次同步委派至少增加一次主 Agent 决策和一段独立的子 Agent Loop。子 Agent 还可能继续调用模型和工具，
所以数量增加会直接扩大 token、延迟、失败点和 Trace 数量。

可以先问三个问题：

```text
这个子任务是否需要多步自主工作？
它的中间上下文是否值得与主 Agent 隔离？
它是否真的需要不同的提示词、工具、模型或权限？
```

如果三个答案都是“否”，优先使用普通 Tool、确定性函数或让主 Agent 直接完成。常见选择：

| 需求 | 更合适的机制 |
| --- | --- |
| 一次数据库查询或计算 | Tool |
| 只需按需加载专业流程 | Skill |
| 单次分类后进入固定处理器 | Router |
| 需要把会话控制权切给另一角色 | Handoff |
| 多步工作、上下文隔离、中央汇总 | Subagent |

“一个 Agent 对应一个函数”通常拆得太细；更合理的边界是一个能够独立验收的工作成果。

### 2. 子 Agent 每次启动都不能依赖“它应该知道”

同步子 Agent 通常从新的消息上下文开始，主 Agent 保留会话历史，子 Agent 只得到本次委派说明以及运行时
允许传播的状态。上一次调用的聊天细节不会自动成为下一次调用的可靠记忆。

不要这样交接：

```text
帮我看看上面那个发布有没有问题。
```

应把委派变成结构化任务契约：

```ts
const taskContractSchema = z.object({
  taskId: z.string(),
  agentName: z.string(),
  scope: z.enum(["api", "data", "security"]),
  releaseId: z.string(),
  goal: z.string().min(10),
  acceptanceCriteria: z.array(z.string()).min(1),
  evidenceRequired: z.literal(true),
  maxOutputChars: z.number().int(),
  timeoutMs: z.number().int(),
  maxRetries: z.number().int()
});
```

任务至少应有稳定 ID、目标、必要输入、范围、验收标准和预算。对话很长时，传递经验证的事实摘要或文件
路径，而不是复制全部历史；但不要把可能影响判断的限制条件摘要掉。

### 3. 描述重叠会导致错路由，模型选择之后仍要校验

下面两个描述几乎无法帮助 Supervisor 选择：

```text
reviewer-a：负责审查
reviewer-b：也负责审查
```

名称和描述应写明正向适用范围与反向边界：

```text
api-reviewer：审查 API 契约与兼容性；不要用于数据库迁移
data-reviewer：审查迁移演练与数据完整性；不要用于 API
```

即使描述清楚，模型仍可能选错，所以执行层应再次校验注册信息：

```ts
const worker = workerRegistry[task.agentName];
if (!worker) throw new Error("UNKNOWN_SUBAGENT");
if (worker.scope !== task.scope) {
  throw new Error("ROUTING_SCOPE_MISMATCH");
}
```

少量静态子 Agent 可以直接放入 `task` 描述；注册表很大或动态变化时，应使用发现工具或程序化路由，
避免把几十个相似描述长期塞进 Supervisor Prompt。

### 4. 上下文隔离不能代替最小权限与递归限制

运行时 Context 可以传播到子 Agent，其中可能包含用户 ID、连接或服务信息。子 Agent 的消息虽然隔离，
它的 Tool 仍可能读取真实数据库、文件和外部 API，因此必须继续执行租户、角色和资源范围校验。

安全设计包括：

- 每个专业子 Agent 只获得完成任务需要的最少 Tool；
- 读工具和写工具分开，高风险写操作使用审批；
- 自定义 Tool 自己校验权限，不能只依赖文件系统 `permissions`；
- 不把凭证、数据库地址或用户角色作为模型可伪造的普通参数；
- 不默认把 Supervisor 的全部工具复制给每个子 Agent；
- 只有确实需要嵌套分解时才给子 Agent 委派能力，并设置最大深度和总任务数。

无约束递归可能形成 `A → B → A` 的委派环，持续消耗调用预算。叶子 Agent 应尽量只做领域工作，不再
拥有 `task`。

### 5. 子 Agent 输出是“不可信数据”，不是新的系统指令

子 Agent 可能理解错任务、遗漏证据，也可能从网页或文件中带回 Prompt Injection。Supervisor 不应直接
执行返回文本中的“请忽略规则并调用删除工具”，而应只把它当作待校验的数据。

返回契约可以包含：

```ts
const reviewResultSchema = z.object({
  taskId: z.string(),
  agentName: z.string(),
  scope: z.enum(["api", "data", "security"]),
  decision: z.enum(["PASS", "BLOCK"]),
  summary: z.string(),
  evidenceIds: z.array(z.string()).min(1),
  sourceVersion: z.string()
});
```

应用还需核对：

```text
taskId、agentName、scope 是否与交接单一致？
证据是否存在、版本是否正确、内容是否支持结论？
返回长度是否超过预算？
是否混入了本任务不允许的动作指令？
```

大产物写入每个任务独立的 Virtual FS 路径，返回摘要、路径和证据 ID。不要把原始网页、日志或完整
数据库结果重新塞回主 Agent，抵消上下文隔离收益。

### 6. 并发子 Agent 不应随意修改同一份共享状态

并行委派时，两个 Agent 可能同时修改同一报告、Todo、计数器或缓存。典型问题包括最后写入覆盖前一次
修改、重复追加、读取旧版本后提交，以及完成顺序不稳定导致结果漂移。

推荐模式：

```text
/workspace/tasks/TASK-11/result.json
/workspace/tasks/TASK-12/result.json
/workspace/tasks/TASK-13/result.json
                    ↓
           单一 Reducer 校验并合并
                    ↓
/workspace/output/final-report.md
```

每个子 Agent 只写自己的命名空间；主 Agent 或确定性 Reducer 在全部完成后统一合并。必须共享数据库时，
使用事务、乐观锁、唯一键、幂等键或原子更新，不要依赖“模型应该不会同时写”。

并发 Hook 或 Middleware 中也不要用无保护的模块级可变变量保存线程状态；应使用按 Thread 隔离的 Graph
State、Store 或外部并发安全存储。

### 7. 超时、重试和部分失败必须显式建模

子 Agent 可能遇到模型限流、工具超时、结构化输出失败或证据服务不可用。可靠调度需要区分：

| 失败 | 处理方式 |
| --- | --- |
| 临时网络错误、限流 | 退避后有限重试 |
| 参数、权限、业务规则错误 | 不重试，修正任务或停止 |
| 结果 Schema 不合格 | 一次修复机会，仍失败则标记失败 |
| 超时 | 记录状态；确认是否真的取消后再决定重试 |
| 部分子任务失败 | 保留已完成结果，但最终状态标记不完整 |

示例用 `Promise.race` 设置等待超时，并且只有 `RetryableWorkerError` 能在 `maxRetries` 内重试。需要注意，
停止等待不一定会取消底层请求；原操作可能仍在后台完成。因此所有写操作必须幂等，最好使用支持
`AbortSignal` 或服务端取消的客户端。

Coverage Ledger 必须区分 `pending`、`running`、`completed`、`failed` 和 `timed_out`。任务要求全覆盖时，
只有 `completed === total` 才能给出完整结论；不能把失败项从分母里删除。

### 8. 并发与异步执行必须同时受预算和生命周期约束

一次启动所有子 Agent 容易造成模型限流、数据库连接耗尽和费用突增。至少设置：

- 最大同时运行数；
- 每个子 Agent 的模型调用、token、工具调用和重试次数；
- 单任务与整批任务超时；
- 最大嵌套深度和总委派数；
- 整体费用上限与熔断条件。

同步并行能缩短墙钟时间，却不会自动减少总 token。异步 Subagent 还要注意：

- 启动后把任务 ID 完整保存，不截断或重新格式化；
- 历史消息里的状态可能已过期，汇报前重新 `check` 或 `list`；
- 不要启动后立即高频轮询，否则异步退化为昂贵的同步等待；
- 支持取消、追加指令和失败回收；
- Worker Pool 必须覆盖 Supervisor 与并发子任务，否则任务会排队。

是否使用异步取决于用户是否需要在任务运行时继续交互，而不只是“能不能并行”。

### 9. 多个子 Agent 一致不代表正确，不一致也不能随意投票

两个 Agent 可能因为共享同一错误来源而一致；两个结论冲突也可能来自数据版本、范围或规则不同。Reducer
应先按 `scope`、证据和 `sourceVersion` 对齐，再判断是真冲突还是口径差异。

配套实验让两个 API 审查者分别返回 `PASS` 和 `BLOCK`：

```ts
const conflicts = findConflicts(results);

const overallDecision = conflicts.length > 0
  ? "NEEDS_HUMAN_REVIEW"
  : results.some((item) => item.decision === "BLOCK")
    ? "BLOCK"
    : "PASS";
```

冲突不能让 Supervisor 随机选择更顺眼的答案，也不能简单多数表决；应回查证据、使用独立 Verifier，或
提交人工复核。生产环境还要通过事件流观察每个子 Agent 的 `started`、`completed`、`failed`、
`interrupted` 状态，并关联 task ID、tool call ID、Trace、成本和耗时。

运行防护实验：

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:12
```

实验预期：

```text
不完整交接单：拒绝
错误专业路由：拒绝
超大返回结果：拒绝
有界并发峰值：2/2
有限重试次数：2
覆盖进度：4/4
检测到的冲突：api:BLOCK vs PASS
整体结论：NEEDS_HUMAN_REVIEW
```

### 本节结论

```text
可靠的 Subagent 编排
  = 克制的任务拆分
  + 完整交接契约
  + 路由和权限双重校验
  + 独立产物与确定性合并
  + 有界并发、超时和有限重试
  + 覆盖、冲突、证据与成本验收
```

提示词负责引导，程序化控制平面负责兜底。不要把“模型通常会做对”当成生产系统的状态机、权限系统或
一致性协议。

### 自测

1. 为什么简单任务拆成 Subagent 可能更慢、更贵？
2. 子 Agent 每次启动时，哪些上下文不能靠隐式假设？
3. 为什么清晰描述之后仍要做程序化路由校验？
4. 上下文隔离为什么不能阻止 Tool 越权？
5. 为什么 Supervisor 应把子 Agent 输出视为不可信数据？
6. 多个子 Agent 为什么不应同时编辑同一个报告文件？
7. 为什么等待超时不一定代表底层写操作已经取消？
8. 两个子 Agent 结论冲突时，为什么不能简单投票？

---

## 13 Graph 和 Deep Agent 的应用场景

### 本节目标

学完这一节，应该能够：

- 说明 LangChain、LangGraph 与 Deep Agents 所处的层次；
- 区分确定性 Workflow 和动态 Agent；
- 识别根本不需要 Agent 的任务；
- 判断什么场景适合 Deep Agents；
- 判断什么场景适合直接使用 LangGraph；
- 依据风险而不是“复杂度”选择控制边界；
- 设计 Graph 与 Deep Agent 的三种组合方式；
- 正确划分状态、持久化和人工中断职责；
- 使用选型清单验证架构决策。

本节主要依据 LangChain 官方的
[Frameworks, runtimes, and harnesses](https://docs.langchain.com/oss/javascript/concepts/products)、
[Deep Agents overview](https://docs.langchain.com/oss/javascript/deepagents/overview)、
[LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph/overview)、
[Workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)和
[Subgraphs](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs)。配套离线实验位于
[`src/examples/13-graph-vs-deepagent.ts`](../deepagents-planning-lab/src/examples/13-graph-vs-deepagent.ts)。

### 1. LangGraph 与 Deep Agents 不是同一层的竞争产品

可以把它们放回完整技术栈：

```text
┌──────────────────────────────────────────┐
│ 业务应用：客服、研究、发布审查、编码助手 │
├──────────────────────────────────────────┤
│ Deep Agents：带工作能力的 Agent Harness │
├──────────────────────────────────────────┤
│ LangChain：模型、Tool、Agent 与中间件抽象│
├──────────────────────────────────────────┤
│ LangGraph：状态图与持久化执行 Runtime    │
└──────────────────────────────────────────┘
```

LangGraph 提供状态、节点、边、检查点、流式和中断等低层编排能力；Deep Agents 构建在 LangChain 和
LangGraph 能力之上，预先组合文件系统、上下文管理、子 Agent、记忆等工作环境。

因此“选择 Deep Agents”通常表示选择更高层的 Harness，并不意味着底层不再使用 LangGraph；“直接使用
LangGraph”则表示应用愿意自己定义更多状态、路径和执行语义。

### 2. 先区分 Workflow 和 Agent

官方文档给出的核心区别是：Workflow 的代码路径预先确定，Agent 会根据上下文动态决定下一步和工具。

```text
Workflow / Graph
开始 → 校验 → 审批 → 执行 → 对账 → 结束
        每条边由程序明确规定

Agent / Deep Agent
目标 → 模型判断下一步 → 调工具或委派 → 观察结果 → 再判断
        具体路径运行时才出现
```

| 问题 | Workflow 更合适 | Agent 更合适 |
| --- | --- | --- |
| 步骤是否预先知道 | 基本知道 | 需要探索后决定 |
| 分支条件 | 可写成业务规则 | 依赖语言理解和开放判断 |
| 是否允许跳步 | 通常不允许 | 可以根据证据调整计划 |
| 错误恢复位置 | 明确节点 | 可能发生在任意工具轮次 |
| 验收方式 | 状态和规则断言 | 结果质量、证据与轨迹评估 |

真实系统常同时包含两者：外层业务生命周期固定，某个节点内部的资料研究是开放的。

### 3. 选型之前先确认是否需要 LLM

不是所有复杂程序都需要 Graph，也不是所有自然语言界面都需要 Deep Agent：

| 场景 | 优先选择 |
| --- | --- |
| 汇率换算、税费公式、字段转换 | 普通代码 |
| 一次分类、抽取或结构化生成 | 单次模型调用 |
| 订单状态问答，只调用一两个 Tool | LangChain `createAgent` |
| 固定步骤的数据处理管道 | 普通工作流或任务队列 |
| 开放式长任务与大量上下文 | Deep Agents |
| 有状态、可恢复、精细控制的业务流程 | LangGraph |

如果规则能可靠地写成 `if`，就不应为了“智能”交给模型判断。Deep Agents 官方也建议：简单 Agent 优先
考虑 LangChain `createAgent` 或自定义 LangGraph Workflow。

### 4. Deep Agents 适合“目标明确、路径开放”的长任务

典型信号：

- 用户给出的是目标和交付物，而不是固定步骤；
- 需要边做边规划，并根据新证据调整计划；
- 搜索、文件读取或工具结果会产生大量上下文；
- 需要 Virtual FS 保存原文、草稿和中间产物；
- 可以把独立领域委派给子 Agent；
- 任务持续多个模型—工具循环；
- 需要 Skills、长期记忆或沙箱工作环境。

适用例子：

```text
十万字尽调研究
跨仓库代码迁移
竞品分析与引用报告
复杂故障调查
生成、运行、修复和验证代码
```

这些任务的终点可以定义，例如“提交带来源的审查报告”，但无法事先画出每一次搜索和读取的准确顺序。
使用纯 LangGraph 当然也能实现，却可能重新开发规划、文件工作区、结果 Offload 和子 Agent 等 Harness 能力。

### 5. LangGraph 适合“路径和状态必须由应用掌控”的流程

直接使用 LangGraph 的典型信号：

- 节点和允许的跳转必须显式可见；
- 业务要求某些阶段严格按顺序发生；
- 需要在指定节点持久化并从失败处恢复；
- 分支、循环、并行和重试条件可以程序化表达；
- 需要检查或修改 Graph State；
- 人工审批发生在明确业务阶段，而不只是某个 Tool 前；
- 合规系统要求证明“哪一步为何被执行”。

适用例子：

```text
付款：风控 → 人工审批 → 扣款 → 对账
理赔：材料校验 → 定损 → 审批 → 支付
发布：测试 → 迁移门禁 → 审批 → 部署 → 回滚监控
客服工单：分类 → SLA 路由 → 处理 → 质检 → 关闭
```

Graph 节点内部仍然可以调用模型或普通 Agent。LangGraph 不是“完全不用 Agent”，而是由 Graph 决定 Agent
在什么状态下运行、运行完允许到哪里。

### 6. 控制边界应由错误风险决定，而不只看任务复杂度

“任务很复杂”不能直接推出使用 Deep Agents；“流程有很多节点”也不能直接推出全部交给 LangGraph。
更有效的问题是：某一步做错时，应用能承受什么后果？

```text
低风险、可撤销、路径难预知
  → 允许 Agent 自主探索

高风险、有资金或外部副作用、顺序不可跳过
  → 使用 Graph / 确定性代码控制
```

推荐把责任分成两类：

| 模型擅长 | 程序必须控制 |
| --- | --- |
| 理解用户意图 | 权限和租户隔离 |
| 搜索与归纳非结构化资料 | 金额、阈值和业务公式 |
| 发现可能风险 | 状态迁移和允许的边 |
| 生成候选方案 | 幂等、事务和唯一性 |
| 解释证据 | 强制审批和审计记录 |

让 Deep Agent“提出是否发布”，可以；让它绕过门禁直接部署，通常不可以。

### 7. Graph 与 Deep Agent 有三种常见组合方式

#### 方式 A：Graph 外层控制，Deep Agent 作为一个节点

```text
LangGraph 校验输入
  → Deep Agent 调研证据
  → LangGraph 验证证据
  → LangGraph 审批或执行
```

适合外层生命周期固定、某一步需要开放研究的系统。配套示例采用这种方式。

#### 方式 B：Deep Agent 主控，Graph 作为 `CompiledSubAgent`

```ts
const policyWorkflow = {
  name: "policy-workflow",
  description: "执行固定顺序的政策校验",
  runnable: compiledGraph
};

const agent = createDeepAgent({
  model,
  subagents: [policyWorkflow]
});
```

适合总体工作开放，但某个专业子任务必须沿固定 Graph 运行。

#### 方式 C：Graph 编排多个 Agent 或 Deep Agent

```text
Router Graph
  ├─ research-agent
  ├─ customer-agent
  └─ compliance-agent
          ↓
      deterministic reducer
```

适合多个团队维护不同 Agent，而中央流程需要明确并行、汇总和失败策略。应避免层层嵌套到无法判断状态、
成本和错误属于哪一层。

### 8. 组合时必须指定状态、持久化和中断的唯一责任方

Hybrid 架构最常见的问题不是 API 不会写，而是两层都试图管理同一件事：

| 关注点 | 必须明确的问题 |
| --- | --- |
| 业务状态 | Graph State 还是 Agent State 是事实源？ |
| 大型产物 | 保存到哪个 Backend，返回路径还是全文？ |
| Checkpoint | 外层 Graph 与内层 Agent 分别保存什么？ |
| Thread ID | 用户会话、业务实例和子任务怎样关联？ |
| Retry | 节点重试是否会重复触发 Agent 副作用？ |
| Interrupt | 在 Graph 阶段暂停，还是在 Tool 调用前暂停？ |
| Streaming | UI 如何区分外层节点、Agent 消息和子 Agent？ |

推荐：业务生命周期和不可变审计字段以外层 Graph State 为准；Agent 的搜索轨迹、工作文件和局部计划留在
Agent 工作区；两层通过窄的结构化输入输出交流。

LangGraph 的 `interrupt()` 适合在明确流程节点暂停，并依靠 Checkpointer 和 Thread ID 恢复。Deep Agents
的 `interruptOn` 更适合拦截指定高风险 Tool。两者可以组合，但不要让同一操作被两套审批重复暂停。

### 9. 用需求清单选型，再用真实任务评估

可以按下面顺序判断：

```text
1. 不用 LLM 能否可靠完成？
   能 → 普通代码 / Workflow

2. 只需要一个轻量模型—Tool 循环？
   是 → LangChain createAgent

3. 是否需要规划、VFS、上下文压缩或子 Agent？
   是 → 倾向 Deep Agents

4. 是否有严格顺序、持久恢复、显式状态或业务中断？
   是 → 倾向 LangGraph

5. 第 3 和第 4 同时成立？
   是 → Hybrid
```

配套实验先对五个场景执行这一启发式决策，再实际运行 Hybrid：

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:13
```

关键代码：

```ts
const workflow = new StateGraph(HybridState)
  .addNode("validate_input", validateInput)
  .addNode("deep_agent_analysis", invokeDeepAnalyst)
  .addNode("policy_gate", applyDeterministicPolicy)
  .addEdge(START, "validate_input")
  .addEdge("deep_agent_analysis", "policy_gate")
  .addEdge("policy_gate", END)
  .compile();
```

实验中的 Deep Agent 只读取并分析发布证据；`HOLD` 由 LangGraph 的 `policy_gate` 节点根据 P1 风险和迁移
通过率计算。示例的选型函数是教学启发式，不是所有项目通用的评分公式。真正选型还应在评测集上比较
正确率、路径可解释性、失败恢复、延迟、token 和维护成本。

### 本节结论

```text
Deep Agents：给模型一个适合长期开放工作的 Harness
LangGraph：给应用一个可精确控制和恢复的 Runtime

Hybrid：Graph 控制不可妥协的边界
        Agent 处理无法预先穷举的工作
```

好的架构不是选择最强的抽象，而是把每一种不确定性放到最适合承担它的层次。

### 自测

1. 为什么选择 Deep Agents 并不表示底层没有使用 LangGraph？
2. Workflow 与 Agent 的路径决定方式有什么区别？
3. 哪些任务应该优先使用普通代码或 `createAgent`？
4. Deep Agents 最适合哪类“目标明确、路径开放”任务？
5. LangGraph 最适合控制哪些业务要求？
6. 为什么应按错误风险划分模型和程序的职责？
7. Graph 与 Deep Agent 有哪三种组合方式？
8. Hybrid 架构中为什么必须明确状态和 Checkpoint 的事实源？

---

## 15 Deep Agent 和 Graph 中断的区别

### 本节目标

学完这一节，应该能够：

- 说明两种中断不是两套互不相关的实现；
- 区分“业务流程暂停”和“敏感 Tool 审批”；
- 使用 `interrupt()` 暂停任意 Graph 节点；
- 使用 Deep Agent 的 `interruptOn` 配置 Tool 审批策略；
- 使用 Checkpointer、Thread ID 和 `Command({ resume })` 恢复任务；
- 解释为什么恢复时中断节点会从头执行；
- 正确处理副作用、多个 Tool 审批和子 Agent 中断；
- 在 Hybrid 系统中为一个操作只设置一道明确审批门禁。

本节主要依据 LangChain 官方的
[LangGraph Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)、
[Deep Agents Human-in-the-loop](https://docs.langchain.com/oss/javascript/deepagents/human-in-the-loop)和
[LangGraph Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)。配套离线实验位于
[`src/examples/15-interrupts.ts`](../deepagents-planning-lab/src/examples/15-interrupts.ts)。

### 1. 两者的关系：一个是底层原语，一个是面向 Tool 的策略

先给出最重要的结论：

```text
LangGraph interrupt()
  └─ 通用暂停 / 保存 / 恢复原语
       ↑
Deep Agent interruptOn
  └─ 基于该原语实现的敏感 Tool 审批策略
```

Deep Agent 构建在 LangGraph Runtime 上。它的中断并不是另一套调度器，而是由 Human-in-the-loop
Middleware 检查模型提出的 Tool Call，命中 `interruptOn` 策略后触发 LangGraph 中断。

因此两者真正的区别是抽象层和默认用途：Graph 暴露“在哪里、为什么暂停”的控制权；Deep Agent 提供
“哪些 Tool 必须审、允许怎样处理”的现成协议。

### 2. LangGraph `interrupt()` 可以暂停任意业务位置

Graph 中断不要求模型正在调用 Tool。它可以放在任何节点内，并由任意业务条件触发：

```ts
const decision = interrupt({
  kind: "release_approval",
  releaseId: state.releaseId,
  question: `是否批准发布 ${state.releaseId}？`
});

return { approved: decision.approved };
```

适合的场景包括：

- 进入付款、部署或理赔阶段之前请求审批；
- 缺少业务资料时向用户收集字段；
- 让人工检查并修改 Graph State 中的草稿；
- 风险分数超过阈值时暂停；
- 在固定 Workflow 的某个阶段等待外部系统结果。

`interrupt(value)` 的 `value` 只需可 JSON 序列化；恢复值可以由应用自行设计，并会成为
`interrupt()` 的返回值。Graph 负责暂停机制，但审批界面、权限校验和恢复数据结构由业务应用负责。

### 3. Deep Agent `interruptOn` 默认拦截敏感 Tool

Deep Agent 通常不需要手写审批节点，只需按 Tool 名称声明策略：

```ts
const agent = createDeepAgent({
  model,
  tools: [sendReleaseEmail],
  checkpointer,
  interruptOn: {
    send_release_email: {
      allowedDecisions: ["approve", "edit", "reject"]
    },
    read_release_notes: false
  }
});
```

模型提出 `send_release_email` 后，Middleware 会在 Tool 真正执行前暂停，并生成标准化的：

- `actionRequests`：待执行 Tool 的名称、参数和描述；
- `reviewConfigs`：每个动作允许的人工决策；
- `decisions`：恢复时按动作顺序提交的处理结果。

它最适合“Agent 可以自主计划，但发邮件、删除文件、写数据库等副作用必须人工确认”的场景。对于没有
列入策略或配置为 `false` 的 Tool，不会因为这个 Middleware 自动暂停。

### 4. 核心差异对照

| 维度 | LangGraph 中断 | Deep Agent 中断 |
| --- | --- | --- |
| 抽象层 | Runtime 原语 | Agent Harness / Middleware 策略 |
| 触发位置 | 任意节点中的任意代码位置 | 通常在命中的 Tool Call 执行前 |
| 触发依据 | 应用自定义条件 | Tool 名称及 `interruptOn` 配置 |
| 暂停数据 | 任意可序列化 Payload | 标准 `actionRequests`、`reviewConfigs` |
| 恢复数据 | 应用自定义值 | 标准 `decisions` 数组 |
| 常见用途 | 阶段审批、补充信息、审阅状态 | 批准、编辑或拒绝敏感 Tool |
| 谁设计流程 | 应用开发者 | Agent 动态选 Tool，Middleware 执行政策 |
| 灵活度 | 高，但需要自己设计协议 | 更省代码，但边界主要围绕 Tool |

一句话判断：如果要表达“流程走到这里必须停”，优先考虑 Graph；如果要表达“Agent 无论何时调用这个
Tool 都必须停”，优先考虑 Deep Agent 的 `interruptOn`。

### 5. 两者使用相同的暂停与恢复底座

无论哪种入口，可靠中断都需要三样东西：

```ts
const checkpointer = new MemorySaver();
const config = { configurable: { thread_id: "release-REL-2026-12" } };

const paused = await runnable.invoke(input, config);
const resumed = await runnable.invoke(
  new Command({ resume: humanResponse }),
  config // 必须使用同一 thread_id
);
```

执行过程是：

```text
invoke(input, thread_id)
  → 命中 interrupt
  → Checkpointer 保存状态
  → 调用方从 __interrupt__ 读取待处理请求
  → 人工或外部系统作出决定
  → Command({ resume }) + 相同 thread_id
  → 从对应 Checkpoint 恢复
```

`thread_id` 是找到同一条执行线程的游标。换一个 ID 会被当成新任务。`MemorySaver` 适合本地实验；生产
环境应使用数据库支持的持久化 Checkpointer，否则进程重启后无法可靠恢复。

### 6. 恢复不是从下一行继续，而是从节点开头重放

LangGraph 恢复中断时，会重新执行包含 `interrupt()` 的整个节点；之前已经提供的 Resume 值会与对应
中断匹配。配套实验因此观察到 Review 节点运行两次：第一次暂停，第二次从头执行并取得审批值。

错误写法：

```ts
await chargeCreditCard();       // 第一次执行
const approved = interrupt(...);
// 恢复后 chargeCreditCard() 可能再次执行
```

更安全的结构：

```text
approval_node: interrupt()
       ↓ approved
execute_node: 使用幂等键执行副作用
```

规则是：中断前的代码必须无副作用或可幂等重放；真正的付款、发信、部署等操作放到中断之后，并继续
使用幂等键防止超时重试造成重复执行。也不要用普通 `try/catch` 吞掉 `interrupt()` 产生的特殊暂停信号。

### 7. Deep Agent 的决策是 Tool Call 协议

本实验安装版本支持三种决策：

| 决策 | 行为 |
| --- | --- |
| `approve` | 使用模型提出的原参数执行 Tool |
| `edit` | 使用人工修改后的 Tool 名称或参数执行 |
| `reject` | 不执行 Tool，并把拒绝信息作为 Tool 结果交还 Agent |

编辑参数的恢复代码：

```ts
new Command({
  resume: {
    decisions: [{
      type: "edit",
      editedAction: {
        name: "send_release_email",
        args: { ...originalArgs, to: "release-owners@example.com" }
      }
    }]
  }
});
```

如果模型一次提出多个需要审批的 Tool，它们会被批量放进同一个中断；应用必须为每个
`actionRequest` 按原顺序提供一个 Decision。不要依赖 UI 显示顺序之外的猜测，也不要漏掉某个动作。

> 版本提示：本工程锁定的 `deepagents@1.12.2` / `langchain@1.5.5` 类型支持
> `approve`、`edit`、`reject`。升级依赖时应重新核对官方文档和本地类型定义，而不是照搬旧决策集合。

### 8. 子 Agent 和 Hybrid 系统只应保留一道明确门禁

子 Agent 可以为自己的 Tool 配置 `interruptOn`，也可以在自定义 Tool 内直接调用 `interrupt()`；中断
最终仍通过外层调用结果返回，并使用同一恢复机制处理。

Hybrid 系统中要先决定审批属于哪一层：

```text
方案 A：外层 Graph 审批整个“发布阶段”
方案 B：Deep Agent interruptOn 审批 send_email Tool
```

不要让同一次发信先在 Graph 审一次、又在 Agent Tool 前审一次。双重门禁会让 Resume Payload、Thread
ID、审计记录和用户体验变得混乱。推荐由离副作用最近、拥有最终授权信息的一层负责；外层 Graph 记录
最终审批结果，Agent 不得把“模型决定调用 Tool”当作业务授权。

### 9. 用离线实验观察差异

运行：

```bash
cd deepagents-planning-lab
nvm use
pnpm lesson:15
```

实验并排执行两条路径：

```text
LangGraph
业务审批节点 → interrupt() → 人工批准 → 部署节点

Deep Agent
模型提出 send_release_email → interruptOn → 人工 edit 收件人 → Tool 执行
```

关键验收结果：

- Graph 在部署前暂停，恢复后 Review 节点共运行两次，但部署只执行一次；
- Deep Agent 在发信 Tool 前暂停，原收件人为 `all@example.com`；
- 人工把收件人修改为 `release-owners@example.com` 后，Tool 才执行一次；
- 两条路径都使用 `MemorySaver`、相同 Thread ID 和 `Command({ resume })`；
- Fake Model 不调用任何真实模型 API。

### 本节结论

```text
Graph 中断：控制“流程何时暂停”
Deep Agent 中断：控制“哪些 Tool 必须审批”

底层机制相同，抽象层和输入输出协议不同。
```

### 自测

1. 为什么 Deep Agent 中断不是独立于 LangGraph 的另一套引擎？
2. “进入付款阶段前审批”和“调用退款 Tool 前审批”分别适合哪种方式？
3. 两种中断共同依赖哪三个恢复要素？
4. 为什么恢复时必须复用相同的 `thread_id`？
5. 为什么不能在 `interrupt()` 前执行非幂等付款？
6. `approve`、`edit`、`reject` 对 Tool Call 分别做什么？
7. 多个敏感 Tool 同时中断时，Decision 应怎样对应？
8. Hybrid 系统为什么不应为同一个副作用设置两道重复门禁？
