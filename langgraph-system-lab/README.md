# LangGraph System Lab

用 TypeScript 逐步学习 LangGraph 的独立实验项目。

项目参考 `langchain-system-lab` 的 provider 设计，同时支持：

- OpenAI。
- DeepSeek OpenAI-compatible API。
- 根据 `LLM_PROVIDER` 显式选择 provider。
- 根据已配置的 API Key 自动选择 provider。
- 可选的 LangSmith tracing 环境变量。

## Setup

项目要求 Node.js 20+。如果使用 nvm，先运行：

```bash
cd langgraph-system-lab
nvm use
```

然后安装依赖：

```bash
pnpm install
```

纯 LangGraph 示例不需要 API Key：

```bash
pnpm example:hello
```

运行调用模型的示例前，先创建本地环境文件：

```bash
cp .env.example .env
```

然后至少填写一个 provider 的 API Key：

```bash
OPENAI_API_KEY=your_openai_api_key
# or
DEEPSEEK_API_KEY=your_deepseek_api_key
```

## Provider 选择规则

```text
1. LLM_PROVIDER=openai|deepseek 时，使用指定 provider。
2. 未指定 LLM_PROVIDER 时，优先选择已配置的 OpenAI Key。
3. 只配置 DeepSeek Key 时，自动选择 DeepSeek。
4. 两个 Key 都未配置时，默认为 OpenAI，并在模型示例中提示缺少 Key。
```

DeepSeek 通过 `@langchain/openai` 的 OpenAI-compatible 配置使用，`src/provider.ts` 会统一处理 `baseURL`。

## Scripts

```bash
pnpm dev
pnpm example:env
pnpm example:hello
pnpm example:conditional
pnpm example:state:reducer
pnpm example:super-step
pnpm example:stream:state
pnpm example:llm
pnpm check
```

## Structure

```text
src/
  config.ts                 provider 环境变量与选择规则
  provider.ts               统一创建 ChatOpenAI/DeepSeek-compatible model
  index.ts                  项目入口与命令提示
  examples/
    00-env-check.ts         检查 Node.js 和 provider 配置
    01-hello-graph.ts       START -> say_hello -> END
    02-conditional-graph.ts 根据 State 选择 pass/fail 分支
    03a-state-update-reducer.ts 对比覆盖更新、自定义 reducer 和 MessagesValue
    03b-super-step.ts       观察 fan-out/fan-in 的 super-step 执行边界
    03c-stream-state.ts     使用 updates/values 观察 State 变化
    provider-llm-node.ts    START -> call_model -> END
```

编号以 `01`、`02`、`03a`、`03b`、`03c` 依次对应当前课程小节。

## Learning order

1. 运行 `example:hello`，观察普通节点如何更新 State。
2. 运行 `example:conditional`，观察路由函数如何选择下一个 Node。
3. 运行 `example:state:reducer`，对比普通字段覆盖、自定义 reducer 累积和消息合并。
4. 运行 `example:super-step`，观察同一步并行执行与下一步的更新边界。
5. 运行 `example:stream:state`，对比 Node 的局部 Update 与边界后的完整 State。
6. 运行 `example:env`，检查 provider 选择结果。
7. 配置 API Key 后运行 `example:llm`，观察 LLM 如何成为图中的一个 Node。
