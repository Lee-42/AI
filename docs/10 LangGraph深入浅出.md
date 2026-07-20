# 10 LangGraph 深入浅出

这一章开始学习 LangGraph。

从课程小节看，这一章主要会涉及：

- LangGraph 的最小入门案例。
- 条件判断和流程分支。
- `checkpointer` 与状态持久化。
- 中断、人工介入和恢复执行。
- `InMemoryStore` 和 `InMemorySaver` 的区别。
- SubGraph 子图。

所以第一节“LangGraph你好”不需要一开始就讲条件边、循环、记忆和中断。

先记住本节目标：

```text
看懂并能够写出一个：
START -> node -> END
的最小可执行图。
```

## 01 LangGraph你好

先用一句话理解 LangGraph：

```text
LangGraph 让多个处理步骤围绕同一份状态，按照一张明确的图运行。
```

### 1. 从 LangChain Agent 过渡到 LangGraph

上一章使用过：

```ts
const agent = createAgent({
  model,
  tools
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "你好" }]
});
```

`createAgent()` 已经帮我们组织好了常见的 Agent 执行循环：

```text
读取消息
  -> 调用模型
  -> 判断是否调用工具
  -> 执行工具
  -> 再次调用模型
  -> 返回最终结果
```

在 LangGraph 里，我们会把下面这些事显式写出来：

```text
流程中携带什么数据？
每一步做什么？
执行完去哪里？
什么时候结束？
```

可以先这样区分：

```text
LangChain Agent
  = 常见 Agent 架构的高层封装

LangGraph
  = 更底层、更显式、更可控的状态图编排
```

LangGraph 不是模型。

LangGraph 也不要求每个节点都必须调用 LLM。

一个节点可以是：

```text
普通 TypeScript 函数
LLM 调用
Tool 调用
数据库查询
HTTP API 请求
人工审批步骤
```

### 2. 最小图里的五个核心概念

入门阶段先掌握五个词：

```text
State
Node
Edge
compile
invoke
```

#### State：状态

State 是整个流程共享的数据。

例如：

```ts
{
  name: "LangGraph",
  greeting: "LangGraph你好"
}
```

可以把 State 想象成一张跟着流程不断往后传递的表格。

每个节点都可以：

```text
读取当前 State
执行自己的任务
返回对 State 的更新
```

#### Node：节点

Node 就是实际干活的步骤。

在 JavaScript/TypeScript 中，节点通常就是一个函数：

```ts
const sayHello = (state) => {
  return {
    greeting: `${state.name}你好`
  };
};
```

#### Edge：边

Edge 用来表示节点之间的执行方向。

```text
say_hello -> END
```

它表示：

```text
say_hello 执行完后，流程到达 END。
```

#### compile()：编译图

定义 State、Node 和 Edge 时，我们还只是在搭建图。

```ts
const graph = builder.compile();
```

`compile()` 会把图构建成可执行对象，并检查基本的图结构。

`compile()` 不会真正执行业务流程。

#### invoke()：执行图

```ts
const result = await graph.invoke({
  name: "LangGraph"
});
```

`invoke()` 才会把初始状态交给图，然后按照边定义的路线执行节点。

### 3. 先看最小执行流程

这一节的图只有一个业务节点：

```text
START -> say_hello -> END
```

完整的状态流转过程是：

```text
初始状态
{
  name: "LangGraph"
}
        |
        v
START -> say_hello -> END
             |
             v
最终状态
{
  name: "LangGraph",
  greeting: "LangGraph你好"
}
```

`START` 和 `END` 是 LangGraph 提供的特殊标记：

```text
START：指出图从哪个节点开始执行。
END：指出流程在哪里结束。
```

它们不是我们自己编写的业务函数。

### 4. 最小完整代码

当前项目已经在 `package.json` 中声明：

```text
@langchain/langgraph
@langchain/core
zod
```

如果本地还没有 `node_modules`，先在 `langgraph-system-lab` 目录中执行：

```bash
pnpm install
```

最小案例如下：

```ts
import {
  END,
  START,
  StateGraph,
  StateSchema
} from "@langchain/langgraph";
import { z } from "zod";

// 1. 定义图在执行期间携带的状态
const HelloState = new StateSchema({
  name: z.string(),
  greeting: z.string().default("")
});

// 2. 定义一个节点
const sayHello: typeof HelloState.Node = (state) => {
  return {
    greeting: `${state.name}你好`
  };
};

// 3. 添加节点和边，然后编译成可执行图
const graph = new StateGraph(HelloState)
  .addNode("say_hello", sayHello)
  .addEdge(START, "say_hello")
  .addEdge("say_hello", END)
  .compile();

// 4. 给图提供初始状态并执行
const result = await graph.invoke({
  name: "LangGraph"
});

console.log(result);
```

预期结果：

```ts
{
  name: "LangGraph",
  greeting: "LangGraph你好"
}
```

这个案例完全没有调用 LLM，因此也不需要 API Key。

这样做是为了先单独看清 LangGraph 的图结构和状态更新机制。

### 5. 逐段解读代码

#### 第一步：定义 State

```ts
const HelloState = new StateSchema({
  name: z.string(),
  greeting: z.string().default("")
});
```

这段代码规定了图中状态的结构：

```text
name：输入的名字。
greeting：节点生成的问候语。
```

`z.string()` 表示字段必须是字符串。

`greeting` 设置了默认值，所以调用图时可以只提供：

```ts
{
  name: "LangGraph"
}
```

网上的一些旧示例可能会使用：

```ts
Annotation.Root(...)
```

当前官方文档更推荐使用 `StateSchema`。

两种写法的核心目的是一样的：

```text
定义图中有哪些状态字段，以及这些字段如何更新。
```

#### 第二步：定义 Node

```ts
const sayHello: typeof HelloState.Node = (state) => {
  return {
    greeting: `${state.name}你好`
  };
};
```

`typeof HelloState.Node` 让 TypeScript 按照 `HelloState` 检查节点的输入和输出。

这个节点做了两件事：

```text
1. 读取 state.name。
2. 返回 greeting 字段的新值。
```

注意，节点返回的是：

```text
本次对 State 的更新
```

它不必手动返回完整 State：

```ts
// 推荐：只返回需要更新的字段
return {
  greeting: `${state.name}你好`
};
```

LangGraph 会把这个更新合并回当前状态。

#### 第三步：把 Node 加入图

```ts
.addNode("say_hello", sayHello)
```

这里同时传入了：

```text
节点名称：say_hello
节点函数：sayHello
```

后面连接边时，使用的是节点名称：

```ts
.addEdge(START, "say_hello")
```

而不是函数变量 `sayHello`。

#### 第四步：连接 Edge

```ts
.addEdge(START, "say_hello")
.addEdge("say_hello", END)
```

第一条边表示：

```text
图启动后，第一个执行 say_hello。
```

第二条边表示：

```text
say_hello 执行完后，流程结束。
```

#### 第五步：编译图

```ts
.compile();
```

一个 `StateGraph` 必须编译后才能执行。

后续学习的 checkpointer、中断点等配置，也会在编译阶段传入。

本节暂时只使用最简单的：

```ts
.compile()
```

#### 第六步：调用图

```ts
const result = await graph.invoke({
  name: "LangGraph"
});
```

这和上一章的 `agent.invoke()` 很像。

区别是：

```text
agent.invoke()
  -> 运行框架已经组装好的 Agent 流程

graph.invoke()
  -> 运行我们自己定义的图
```

### 6. 一次 invoke() 到底发生了什么？

执行：

```ts
await graph.invoke({
  name: "LangGraph"
});
```

内部可以先简化理解为：

```text
1. 接收初始状态
   { name: "LangGraph" }

2. 从 START 出发

3. 根据 Edge 找到 say_hello

4. 把当前 State 交给 sayHello()

5. 节点返回状态更新
   { greeting: "LangGraph你好" }

6. 把更新合并到 State
   {
     name: "LangGraph",
     greeting: "LangGraph你好"
   }

7. 根据 Edge 到达 END

8. 返回最终 State
```

所以，`invoke()` 返回的不是某个节点函数的裸返回值。

它返回的是：

```text
整张图执行结束时的最终状态。
```

### 7. 为什么第一个案例不调用 LLM？

因为 LangGraph 的核心不是“调用模型的 API”。

它的核心是：

```text
如何表示状态
如何把任务拆成节点
如何连接节点
如何控制执行路线
如何中断、恢复和持久化流程
```

如果一开始就加入 LLM、Tools 和 API Key，容易把注意力放在模型调用上。

现在用普通函数作为节点，可以单独观察：

```text
输入 State
  -> 图调度 Node
  -> Node 返回更新
  -> 得到最终 State
```

后面只需要把普通节点替换成模型节点或工具节点，图的基本思想不会变。

### 8. 再增加一个节点

现在增加一个 `add_emoji` 节点：

```ts
const addEmoji: typeof HelloState.Node = (state) => {
  return {
    greeting: `${state.greeting} 👋`
  };
};
```

图改成：

```text
START -> say_hello -> add_emoji -> END
```

建图代码：

```ts
const graph = new StateGraph(HelloState)
  .addNode("say_hello", sayHello)
  .addNode("add_emoji", addEmoji)
  .addEdge(START, "say_hello")
  .addEdge("say_hello", "add_emoji")
  .addEdge("add_emoji", END)
  .compile();
```

当输入是：

```ts
{
  name: "小李"
}
```

状态变化过程是：

```text
初始：
{
  name: "小李",
  greeting: ""
}

say_hello 执行后：
{
  name: "小李",
  greeting: "小李你好"
}

add_emoji 执行后：
{
  name: "小李",
  greeting: "小李你好 👋"
}
```

这就是一个最小的多节点工作流。

每个节点只关心自己的任务，LangGraph 负责按照 Edge 调度它们。

### 9. 几个容易混淆的点

#### compile() 不等于执行

```ts
const graph = builder.compile();
```

这只是得到一张可执行图。

真正执行的是：

```ts
await graph.invoke(initialState);
```

#### START 和 END 不是业务节点

它们只是图中的特殊边界标记。

#### Node 不等于 LLM

节点是“一个处理步骤”。

LLM 只是节点可能执行的任务之一。

#### State 不是一个永久数据库

本节的 State 只是一次图执行期间携带的数据。

如果需要跨多次调用保存状态，还需要后面学习的 checkpointer。

#### Node 通常返回 State 更新

不要先把节点理解成：

```text
返回一个完全新的状态对象
```

更准确的理解是：

```text
返回本节点对 State 产生的局部更新
```

### 10. 本节小练习

#### 练习 1：修改输入

把：

```ts
name: "LangGraph"
```

改成：

```ts
name: "Agent"
```

思考最终状态是什么。

答案：

```ts
{
  name: "Agent",
  greeting: "Agent你好"
}
```

#### 练习 2：判断执行顺序

如果图是：

```text
START -> say_hello -> add_emoji -> END
```

输入是：

```ts
{
  name: "小李"
}
```

最终 `greeting` 是：

```text
小李你好 👋
```

#### 练习 3：思考节点顺序

如果把流程错写成：

```text
START -> add_emoji -> say_hello -> END
```

`add_emoji` 会先在空字符串后面添加 emoji。

但 `say_hello` 后执行，又会用新的问候语覆盖 `greeting`。

所以最终结果会是：

```text
小李你好
```

这说明：

```text
Node 决定每一步做什么。
Edge 决定这些步骤按什么顺序执行。
```

### 11. 本节小结

这一节先记住下面几句话：

```text
1. LangGraph 是一个低层的状态图和工作流编排框架。

2. State 是整个图在执行期间共享的数据。

3. Node 负责完成具体任务，并返回 State 更新。

4. Edge 决定节点之间的执行路线。

5. START 和 END 表示图的起点和终点。

6. compile() 把图构建成可执行对象。

7. invoke() 接收初始状态，执行图并返回最终状态。

8. LangGraph 本身不等于 LLM，节点可以只是普通函数。
```

用一条公式收尾：

```text
LangGraph 最小图
  = State + Node + Edge + compile() + invoke()
```

官方参考：

- [LangGraph JavaScript Overview](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangGraph JavaScript Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api)

## 02 LangGraph条件判断

上一节的图只有一条固定路线：

```text
START -> say_hello -> END
```

不管输入是什么，图都按照同一条路线执行。

但真实业务经常需要判断：

```text
成绩及格 -> 进入通过分支
成绩未及格 -> 进入未通过分支

需要调用工具 -> 执行 Tool Node
不需要调用工具 -> 直接结束

内容审核通过 -> 继续发布
内容审核失败 -> 返回修改
```

LangGraph 使用条件边表达这种动态路线。

本节先记住目标：

```text
用 addConditionalEdges() 读取当前 State，
并且只选择一条分支继续执行。
```

### 1. 从直线流程变成分支流程

本节使用“判断成绩是否及格”作为案例。

判断规则：

```text
score >= 60 -> pass
score < 60  -> fail
```

图结构：

```text
START -> evaluate_score
              |
              | passed === true
              +-----------------> pass_feedback -> END
              |
              | passed === false
              +-----------------> fail_feedback -> END
```

更简洁地表示：

```text
                         /-> pass_feedback -> END
START -> evaluate_score
                         \-> fail_feedback -> END
```

这张图里有三个业务节点：

```text
evaluate_score：计算是否及格。
pass_feedback：生成及格提示。
fail_feedback：生成未及格提示。
```

条件判断发生在 `evaluate_score` 执行完之后。

### 2. 条件边的三个组成部分

本节需要新掌握三个概念：

```text
source node
routing function
path map
```

#### source node：从哪个节点开始判断

本节的 source node 是：

```text
evaluate_score
```

它表示：

```text
evaluate_score 执行完后，不要立即走向某个固定节点，
而是先调用路由函数做判断。
```

#### routing function：选择路线的函数

本节的路由函数是：

```ts
function routeByResult(state: typeof ScoreState.State): "pass" | "fail" {
  return state.passed ? "pass" : "fail";
}
```

它读取当前 State，然后返回一个路由结果。

```text
passed === true  -> 返回 "pass"
passed === false -> 返回 "fail"
```

#### path map：路由结果对应哪个节点

```ts
{
  pass: "pass_feedback",
  fail: "fail_feedback"
}
```

它表示：

```text
路由函数返回 "pass"
  -> 下一个执行 pass_feedback

路由函数返回 "fail"
  -> 下一个执行 fail_feedback
```

三部分合起来就是：

```ts
.addConditionalEdges("evaluate_score", routeByResult, {
  pass: "pass_feedback",
  fail: "fail_feedback"
})
```

### 3. 本节完整代码

对应示例文件：

```text
langgraph-system-lab/src/examples/02-conditional-graph.ts
```

完整代码：

```ts
import {
  END,
  START,
  StateGraph,
  StateSchema
} from "@langchain/langgraph";
import { z } from "zod";

const ScoreState = new StateSchema({
  score: z.number().min(0).max(100),
  passed: z.boolean().default(false),
  feedback: z.string().default("")
});

const evaluateScore: typeof ScoreState.Node = (state) => {
  return {
    passed: state.score >= 60
  };
};

const passFeedback: typeof ScoreState.Node = (state) => {
  return {
    feedback: `${state.score} 分，成绩及格。`
  };
};

const failFeedback: typeof ScoreState.Node = (state) => {
  return {
    feedback: `${state.score} 分，成绩未及格，请继续加油。`
  };
};

type ScoreRoute = "pass" | "fail";

function routeByResult(state: typeof ScoreState.State): ScoreRoute {
  return state.passed ? "pass" : "fail";
}

const graph = new StateGraph(ScoreState)
  .addNode("evaluate_score", evaluateScore)
  .addNode("pass_feedback", passFeedback)
  .addNode("fail_feedback", failFeedback)
  .addEdge(START, "evaluate_score")
  .addConditionalEdges("evaluate_score", routeByResult, {
    pass: "pass_feedback",
    fail: "fail_feedback"
  })
  .addEdge("pass_feedback", END)
  .addEdge("fail_feedback", END)
  .compile();

async function runCase(score: number) {
  const result = await graph.invoke({ score });

  console.log(`\nInput score: ${score}`);
  console.log(`Selected branch: ${result.passed ? "pass" : "fail"}`);
  console.log("Result:", result);
}

async function main() {
  console.log("Graph:");
  console.log("START -> evaluate_score -> pass_feedback -> END");
  console.log("                        \\-> fail_feedback -> END");

  await runCase(85);
  await runCase(45);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

运行：

```bash
cd langgraph-system-lab
nvm use
pnpm example:conditional
```

实际运行结果：

```text
Graph:
START -> evaluate_score -> pass_feedback -> END
                        \-> fail_feedback -> END

Input score: 85
Selected branch: pass
Result: { score: 85, passed: true, feedback: '85 分，成绩及格。' }

Input score: 45
Selected branch: fail
Result: { score: 45, passed: false, feedback: '45 分，成绩未及格，请继续加油。' }
```

### 4. 第一步：定义条件判断需要的 State

```ts
const ScoreState = new StateSchema({
  score: z.number().min(0).max(100),
  passed: z.boolean().default(false),
  feedback: z.string().default("")
});
```

三个字段的含义：

```text
score：输入的分数，范围是 0 到 100。
passed：是否及格，默认为 false。
feedback：最终的反馈文本，默认为空字符串。
```

初始输入只需要提供：

```ts
{
  score: 85
}
```

图会在执行过程中逐步填充：

```text
passed
feedback
```

这是 LangGraph 中很常见的设计：

```text
上游节点把判断依据写入 State，
条件边再根据 State 决定下一步。
```

### 5. 第二步：计算判断结果

```ts
const evaluateScore: typeof ScoreState.Node = (state) => {
  return {
    passed: state.score >= 60
  };
};
```

这个节点只做一件事：

```text
把 score 和 60 比较，然后更新 passed。
```

例如：

```text
score = 85 -> passed = true
score = 45 -> passed = false
score = 60 -> passed = true
```

这个节点不决定下一个节点的名字。

它只负责业务计算和 State 更新。

### 6. 第三步：定义两个分支节点

及格分支：

```ts
const passFeedback: typeof ScoreState.Node = (state) => {
  return {
    feedback: `${state.score} 分，成绩及格。`
  };
};
```

未及格分支：

```ts
const failFeedback: typeof ScoreState.Node = (state) => {
  return {
    feedback: `${state.score} 分，成绩未及格，请继续加油。`
  };
};
```

这两个节点不会在同一次 invoke 中都执行。

路由函数会根据 `passed` 只选择其中一个。

### 7. 第四步：编写路由函数

```ts
type ScoreRoute = "pass" | "fail";

function routeByResult(state: typeof ScoreState.State): ScoreRoute {
  return state.passed ? "pass" : "fail";
}
```

`typeof ScoreState.State` 表示路由函数读取的是完整 State。

`ScoreRoute` 把可能的返回值限定为：

```text
"pass"
"fail"
```

如果不小心写成：

```ts
return "success";
```

TypeScript 会在编译阶段报错。

这比让错误路由一直留到运行时更安全。

路由函数的职责是：

```text
读取 State
  -> 做判断
  -> 返回路由标签或节点名称
```

它不是普通 Node，也不应返回：

```ts
{
  passed: true
}
```

那是 Node 的 State 更新格式，不是路由结果。

### 8. 第五步：使用 addConditionalEdges()

```ts
.addConditionalEdges("evaluate_score", routeByResult, {
  pass: "pass_feedback",
  fail: "fail_feedback"
})
```

`addConditionalEdges()` 的三个参数可以这样记：

```text
第 1 个参数：从哪个节点出发。
第 2 个参数：用哪个函数选择路线。
第 3 个参数：路由结果如何映射到下一个节点。
```

用一条公式表示：

```text
addConditionalEdges(
  源节点,
  路由函数,
  路由标签到节点的映射
)
```

path map 是可选的。

如果路由函数直接返回真实节点名，也可以写成：

```ts
function routeByResult(state: typeof ScoreState.State) {
  return state.passed ? "pass_feedback" : "fail_feedback";
}

.addConditionalEdges("evaluate_score", routeByResult)
```

但本节使用 path map，因为它能把两个概念分开：

```text
业务判断结果：pass / fail
实际节点名：pass_feedback / fail_feedback
```

以后修改节点名时，路由函数不一定需要跟着改。

### 9. 路由函数看到的是哪份 State？

这是本节最关键的执行顺序：

```text
1. evaluate_score 先执行。
2. evaluate_score 返回 { passed: ... }。
3. LangGraph 先把 passed 合并进 State。
4. routeByResult 再读取更新后的 State。
5. 根据 passed 选择 pass 或 fail。
```

所以当输入是：

```ts
{
  score: 85
}
```

`evaluate_score` 执行后的 State 是：

```ts
{
  score: 85,
  passed: true,
  feedback: ""
}
```

路由函数看到的是这份已经包含 `passed: true` 的 State。

因此它返回：

```text
pass
```

### 10. 85 分的完整执行过程

初始输入：

```ts
{
  score: 85
}
```

执行过程：

```text
START
  |
  v
evaluate_score
  |
  | 返回 { passed: true }
  v
routeByResult
  |
  | 返回 "pass"
  v
path map
  |
  | pass -> pass_feedback
  v
pass_feedback
  |
  | 返回 { feedback: "85 分，成绩及格。" }
  v
END
```

最终 State：

```ts
{
  score: 85,
  passed: true,
  feedback: "85 分，成绩及格。"
}
```

`fail_feedback` 在这次调用中不会执行。

### 11. 45 分的完整执行过程

初始输入：

```ts
{
  score: 45
}
```

执行过程：

```text
START
  |
  v
evaluate_score
  |
  | 返回 { passed: false }
  v
routeByResult
  |
  | 返回 "fail"
  v
path map
  |
  | fail -> fail_feedback
  v
fail_feedback
  |
  | 返回 { feedback: "45 分，成绩未及格，请继续加油。" }
  v
END
```

最终 State：

```ts
{
  score: 45,
  passed: false,
  feedback: "45 分，成绩未及格，请继续加油。"
}
```

`pass_feedback` 在这次调用中不会执行。

### 12. addEdge() 和 addConditionalEdges() 的区别

#### addEdge()

```ts
.addEdge("a", "b")
```

含义：

```text
a 执行完以后，始终执行 b。
```

这是固定路线。

#### addConditionalEdges()

```ts
.addConditionalEdges("a", route, {
  yes: "b",
  no: "c"
})
```

含义：

```text
a 执行完以后，先调用 route(state)。

route 返回 yes -> 执行 b。
route 返回 no  -> 执行 c。
```

这是动态路线。

可以先用一句话区分：

```text
addEdge() 表示“一定去哪里”。
addConditionalEdges() 表示“根据 State 决定去哪里”。
```

### 13. 一个很容易写错的图

不要用两条普通边模拟 if/else：

```ts
.addEdge("evaluate_score", "pass_feedback")
.addEdge("evaluate_score", "fail_feedback")
```

这不表示：

```text
二选一
```

它表示 `evaluate_score` 执行完后，两个节点都可能在下一个 super-step 中执行。

也就是：

```text
evaluate_score
  |\
  | \-> pass_feedback
  |
  \----> fail_feedback

两条路径都被激活。
```

如果两个节点同时更新 `feedback`，还可能因为同一个状态字段在同一步收到多个值而报错。

所以：

```text
要实现 if/else，使用 addConditionalEdges()。

要实现并行 fan-out，才会从同一节点连多条普通边。
```

### 14. 路由标签必须和 path map 对应

路由函数：

```ts
return "pass";
```

path map 必须包含：

```ts
{
  pass: "pass_feedback"
}
```

如果路由函数返回了 path map 中不存在的值，LangGraph 就不知道下一步应该去哪里。

本节通过字面量联合类型限制返回值：

```ts
type ScoreRoute = "pass" | "fail";
```

这可以尽量把路由拼写错误提前到 TypeScript 编译阶段。

### 15. 条件判断不一定需要 LLM

本节的规则是：

```ts
state.score >= 60
```

这是确定性业务规则，使用普通 TypeScript 判断更直接、稳定、快速。

如果以后要根据自然语言意图分支，可以这样设计：

```text
用户输入
  -> LLM 分类节点
  -> 把 category 写入 State
  -> 路由函数读取 category
  -> 选择不同分支
```

关键思想仍然不变：

```text
先把判断依据写入 State，
再让条件边选择路径。
```

### 16. 本节小练习

#### 练习 1：边界值

输入：

```ts
{
  score: 60
}
```

会走哪条分支？

根据：

```ts
state.score >= 60
```

答案是：

```text
pass
```

#### 练习 2：差一分

输入：

```ts
{
  score: 59
}
```

答案：

```text
fail
```

#### 练习 3：增加优秀分支

可以把规则扩展成：

```text
score >= 90 -> excellent
score >= 60 -> pass
score < 60  -> fail
```

需要同时修改：

```text
1. ScoreRoute 类型。
2. routeByResult() 路由函数。
3. 新增 excellent_feedback 节点。
4. addConditionalEdges() 的 path map。
5. excellent_feedback -> END 的普通边。
```

可以先自己尝试，后续再对照答案。

### 17. 本节小结

这一节先记住：

```text
1. addEdge() 定义固定路线。

2. addConditionalEdges() 根据当前 State 选择动态路线。

3. source node 会先执行并更新 State。

4. routing function 随后读取更新后的 State。

5. routing function 返回路由标签或下一个节点名称，不返回 State 更新。

6. path map 把路由标签映射到真正的节点。

7. 两条普通 addEdge() 不是 if/else，而是两条路径都会被激活。
```

用一条公式收尾：

```text
条件分支
  = 上游 Node 更新 State
  + routing function 读取 State
  + addConditionalEdges() 选择下一个 Node
```

官方参考：

- [LangGraph JavaScript Conditional Branching](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api#conditional-branching)
- [LangGraph JavaScript Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api#conditional-edges)

## 03A State更新规则与reducer

前两节已经使用 Node 更新过 State：

```text
say_hello 更新 greeting
evaluate_score 更新 passed
pass_feedback / fail_feedback 更新 feedback
```

这些字段都只有一个节点负责写入，所以暂时看不出一个关键问题：

```text
如果多个节点先后更新同一个字段，
新值应该覆盖旧值，还是与旧值合并？
```

这一节只解决这个问题。

先记住本节目标：

```text
理解 Node 返回的是局部 State Update，
并能为不同字段选择“覆盖”或“reducer 合并”规则。
```

### 1. State 和 State Update 不是一回事

Node 接收到的是当前完整 State：

```ts
{
  task: "学习 State 更新规则",
  status: "validated",
  completedSteps: 1,
  history: ["validate_task"]
}
```

Node 返回的通常只是局部更新：

```ts
return {
  status: "completed",
  completedSteps: 1,
  history: "execute_task"
};
```

这里没有返回 `task`，不代表 `task` 会被删除。

LangGraph 会保留未更新的字段，并逐字段处理本次更新：

```text
当前完整 State
  + Node 返回的局部 State Update
  + 每个字段自己的更新规则
  = 下一份完整 State
```

所以要区分：

```text
State：
  Node 当前读取的完整状态。

State Update：
  Node 本次准备提交的局部变化。
```

### 2. 更新规则属于字段

更新规则不是整张图只能选一种。

同一个 State 可以让不同字段采用不同规则：

| 字段 | Node 提交的更新 | 规则 | 最终效果 |
|---|---|---|---|
| `task` | 后续节点不提交 | 保留 | 一直保存输入任务 |
| `status` | `validated`、`completed` | 覆盖 | 最终为 `completed` |
| `completedSteps` | `1`、`1` | 求和 reducer | 最终为 `2` |
| `history` | 两个步骤名称 | 追加 reducer | 最终保存两个名称 |

可以把本节案例理解成：

```text
START -> validate_task -> execute_task -> END
```

两个节点都会更新 `status`、`completedSteps` 和 `history`，但三个字段会得到三种不同结果。

### 3. 默认规则：普通字段使用新值

普通 Zod 字段：

```ts
status: z.string().default("pending")
```

没有声明 reducer。

在本节的顺序执行中，它的变化是：

```text
初始值 pending
  -> validate_task 提交 validated
  -> execute_task 提交 completed
  -> 最终值 completed
```

可以先把它记成：

```text
普通字段：
nextValue = update
```

`default("pending")` 只负责在没有输入时提供初始值，并不表示累加或追加。

底层通常把这种字段作为 last-value 字段处理。

这里有一个需要暂时记住的边界：

```text
顺序步骤先后写普通字段：后一次更新覆盖前一次更新。

同一执行边界内的并行节点同时写普通字段：
LangGraph 不会随机挑一个，而会报告并发更新冲突。
```

并行执行和执行边界会在 03B 单独学习，本节先使用直线流程。

### 4. 需要合并时使用 ReducedValue

如果新值不能直接覆盖旧值，就可以使用 `ReducedValue`。

它的核心形式是：

```ts
new ReducedValue(valueSchema, {
  inputSchema,
  reducer: (current, next) => updated
})
```

三个值分别表示：

```text
current：
  State 当前已经保存的值。

next：
  Node 本次提交的更新值。

updated：
  reducer 合并后重新保存到 State 的值。
```

核心公式：

```text
带 reducer 的字段：
nextStateValue = reducer(currentStateValue, nodeUpdate)
```

reducer 只决定某个字段怎样合并。

它不会：

```text
选择下一个 Node
调用 LLM
执行 Tool
保存 checkpoint
```

### 5. 本节 State 定义

先看完整的 State：

```ts
const TaskState = new StateSchema({
  task: z.string(),
  status: z.string().default("pending"),
  completedSteps: new ReducedValue(z.number().default(0), {
    reducer: (current, increment) => current + increment
  }),
  history: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.string(),
      reducer: (current, step) => [...current, step]
    }
  )
});
```

四个字段的完整 State 类型可以概念性地写成：

```ts
type State = {
  task: string;
  status: string;
  completedSteps: number;
  history: string[];
};
```

但 Node 允许返回的 Update 类型更接近：

```ts
type Update = {
  task?: string;
  status?: string;
  completedSteps?: number;
  history?: string;
};
```

注意 `history`：

```text
State 中保存的是 string[]
Node 每次提交的却可以只是 string
```

这是 `inputSchema` 带来的能力。

### 6. 求和 reducer：节点提交增量

`completedSteps` 的定义：

```ts
completedSteps: new ReducedValue(z.number().default(0), {
  reducer: (current, increment) => current + increment
})
```

这里：

```text
保存类型：number
更新类型：number
初始值：0
合并规则：相加
```

两个节点都返回：

```ts
{
  completedSteps: 1
}
```

执行过程：

```text
初始：0

validate_task 提交 1：
0 + 1 = 1

execute_task 提交 1：
1 + 1 = 2
```

这里的 `1` 表示“本次完成了一个步骤”，是增量。

不要这样写：

```ts
return {
  completedSteps: state.completedSteps + 1
};
```

假设当前值已经是 `1`，上面的 Node 会提交 `2`，reducer 又会执行：

```text
current + update
= 1 + 2
= 3
```

这就重复累计了。

使用求和 reducer 时应先问：

```text
Node 返回的是“本次增量”，
还是“计算后的完整总数”？
```

本例必须返回本次增量。

### 7. inputSchema：保存类型可以不同于更新类型

`history` 的定义：

```ts
history: new ReducedValue(
  z.array(z.string()).default(() => []),
  {
    inputSchema: z.string(),
    reducer: (current, step) => [...current, step]
  }
)
```

第一个 schema 描述最终保存在 State 中的值：

```ts
z.array(z.string()).default(() => [])
```

也就是：

```text
Value = string[]
```

`inputSchema` 描述 Node 每次允许提交的更新：

```ts
inputSchema: z.string()
```

也就是：

```text
Input = string
```

因此 reducer 的含义是：

```ts
(current: string[], step: string) => string[]
```

Node 不需要读取完整数组、自己追加后再返回。

它只提交本次新产生的步骤名：

```ts
return {
  history: "validate_task"
};
```

reducer 负责形成：

```ts
["validate_task"]
```

下一次 Node 再提交：

```ts
{
  history: "execute_task"
}
```

reducer 得到：

```ts
["validate_task", "execute_task"]
```

如果 Value 和 Input 类型相同，`inputSchema` 可以省略。

如果二者不同，就应该显式声明 `inputSchema`。

### 8. 默认值最好是 reducer 的空值

本例使用：

```text
求和的空值：0
数组追加的空值：[]
```

它们满足：

```text
0 + x = x
[] 追加 x = [x]
```

这样第一次更新也能自然地使用同一套 reducer 规则。

所以常见写法是：

```ts
z.number().default(0)
z.array(z.string()).default(() => [])
```

数组默认值使用函数：

```ts
.default(() => [])
```

每次创建 State 时都会得到新的数组。

### 9. 两个 Node 只返回局部更新

第一个 Node：

```ts
const validateTask: typeof TaskState.Node = (state) => {
  console.log("validate_task sees:", state);

  return {
    status: "validated",
    completedSteps: 1,
    history: "validate_task"
  };
};
```

第二个 Node：

```ts
const executeTask: typeof TaskState.Node = (state) => {
  console.log("execute_task sees:", state);

  return {
    status: "completed",
    completedSteps: 1,
    history: "execute_task"
  };
};
```

两者都没有返回 `task`。

`task` 会继续保留在 State 中。

`typeof TaskState.Node` 同时约束：

```text
Node 读到的完整 State 类型
Node 可以返回的 Update 类型
```

因此 `history` 在 State 中会被推断为数组，但在 Node 返回值中会被约束为单个字符串。

### 10. 构建直线图

本节暂时不使用条件边：

```ts
const taskGraph = new StateGraph(TaskState)
  .addNode("validate_task", validateTask)
  .addNode("execute_task", executeTask)
  .addEdge(START, "validate_task")
  .addEdge("validate_task", "execute_task")
  .addEdge("execute_task", END)
  .compile();
```

图结构：

```text
START -> validate_task -> execute_task -> END
```

这样可以只观察 State Update，不让条件分支干扰理解。

### 11. 手工推演 State 的变化

调用图：

```ts
const result = await taskGraph.invoke({
  task: "学习 State 更新规则"
});
```

#### 初始 State

```ts
{
  task: "学习 State 更新规则",
  status: "pending",
  completedSteps: 0,
  history: []
}
```

#### validate_task 提交的 Update

```ts
{
  status: "validated",
  completedSteps: 1,
  history: "validate_task"
}
```

逐字段应用规则后：

```ts
{
  task: "学习 State 更新规则",
  status: "validated",
  completedSteps: 1,
  history: ["validate_task"]
}
```

#### execute_task 提交的 Update

```ts
{
  status: "completed",
  completedSteps: 1,
  history: "execute_task"
}
```

最终 State：

```ts
{
  task: "学习 State 更新规则",
  status: "completed",
  completedSteps: 2,
  history: ["validate_task", "execute_task"]
}
```

用三条公式概括：

```text
status:
  "validated" -> "completed"

completedSteps:
  1 + 1 -> 2

history:
  ["validate_task"] + "execute_task"
  -> ["validate_task", "execute_task"]
```

### 12. 本节可运行代码

对应示例文件：

```text
langgraph-system-lab/src/examples/03a-state-update-reducer.ts
```

运行：

```bash
cd langgraph-system-lab
nvm use
pnpm example:state:reducer
```

自定义 reducer 部分的实际输出：

```text
validate_task sees: {
  task: "学习 State 更新规则",
  status: "pending",
  completedSteps: 0,
  history: []
}

execute_task sees: {
  task: "学习 State 更新规则",
  status: "validated",
  completedSteps: 1,
  history: ["validate_task"]
}

Final state: {
  task: "学习 State 更新规则",
  status: "completed",
  completedSteps: 2,
  history: ["validate_task", "execute_task"]
}
```

这个输出证明：

```text
后一个 Node 能读到前一个 Node 更新后的完整 State。
```

下一节再继续解释这些更新位于哪些执行边界中。

### 13. reducer 应保持纯粹

推荐这样追加数组：

```ts
reducer: (current, step) => [...current, step]
```

它根据输入返回一个新数组。

不推荐原地修改：

```ts
reducer: (current, step) => {
  current.push(step);
  return current;
}
```

reducer 最好具备这些特点：

```text
1. 只负责合并字段值。
2. 不修改传入的 current。
3. 不调用外部 API。
4. 不写数据库。
5. 相同输入产生相同输出。
6. 返回值始终满足 valueSchema。
```

以后涉及并行、重试和持久化时，纯 reducer 更容易推理和测试。

### 14. ReducedValue 不等于只能相加

“reduce”的含义是：

```text
用一条明确规则，把当前值和新更新合成下一值。
```

它可以实现：

#### 求和

```ts
reducer: (current, next) => current + next
```

#### 追加

```ts
reducer: (current, next) => [...current, next]
```

#### 取最大值

```ts
reducer: (current, next) => Math.max(current, next)
```

#### 去重集合

```ts
reducer: (current, next) =>
  current.includes(next) ? current : [...current, next]
```

应该根据字段的业务语义选择规则，而不是看到 State 字段就全部添加 reducer。

常见选择：

| 字段 | 常见规则 |
|---|---|
| `currentStep` | 覆盖 |
| `approved` | 覆盖 |
| `category` | 覆盖 |
| `errors` | 追加 |
| `totalTokens` | 求和 |
| `tags` | 追加或去重 |
| `messages` | 使用 `MessagesValue` |

### 15. MessagesValue：预置的消息 reducer

Agent 最常见的 State 字段之一是 `messages`：

```ts
const ConversationState = new StateSchema({
  messages: MessagesValue
});
```

`MessagesValue` 是 LangGraph 已经配置好的特殊 `ReducedValue`。

不要写成：

```ts
MessagesValue()
new MessagesValue()
```

它应直接作为字段值使用：

```ts
messages: MessagesValue
```

它并不只是简单执行数组拼接，而是理解消息 ID：

```text
新 ID：
  把新消息追加到消息列表。

已有 ID：
  用新消息更新原位置的消息。
```

它还会把支持的 message-like 输入转换为 LangChain 消息对象。

### 16. 消息 ID 更新示例

本节示例的第二张图：

```text
START -> write_draft -> revise_draft -> END
```

初始输入是一条 HumanMessage：

```ts
const input = {
  messages: [
    new HumanMessage({
      id: "user-message",
      content: "你好"
    })
  ]
};
```

`write_draft` 新增一条 AIMessage：

```ts
const writeDraft: typeof ConversationState.Node = () => {
  return {
    messages: [
      new AIMessage({
        id: "assistant-reply",
        content: "（草稿）你好，我收到了你的消息。"
      })
    ]
  };
};
```

这个 ID 之前不存在，所以消息会被追加。

此时 State 中有两条消息：

```text
user-message
assistant-reply
```

`revise_draft` 返回相同 ID 的 AIMessage：

```ts
const reviseDraft: typeof ConversationState.Node = () => {
  return {
    messages: [
      new AIMessage({
        id: "assistant-reply",
        content: "你好！我已经收到你的消息。"
      })
    ]
  };
};
```

`assistant-reply` 已经存在，因此它会更新原来的草稿，而不是再追加一条。

最终输出：

```text
[
  {
    id: "user-message",
    type: "human",
    content: "你好"
  },
  {
    id: "assistant-reply",
    type: "ai",
    content: "你好！我已经收到你的消息。"
  }
]

Message count: 2
```

虽然一共提交过：

```text
1 条用户消息
1 条 AI 草稿
1 条 AI 修订
```

最终仍是两条消息，因为草稿和修订使用了相同 ID。

### 17. 三种字段放在一起对比

| 定义方式 | Node 更新的含义 | 顺序更新结果 |
|---|---|---|
| `field: z.string()` | 新的完整字段值 | 新值覆盖旧值 |
| `field: new ReducedValue(...)` | 交给自定义 reducer 的增量 | 按 reducer 合并 |
| `messages: MessagesValue` | 新消息或消息更新 | 按消息 ID 追加或更新 |

一句话区分：

```text
普通字段关心“最新值是什么”。

ReducedValue 字段关心“旧值和新更新怎样合并”。

MessagesValue 关心“消息列表怎样按消息语义合并”。
```

### 18. 常见错误

#### 错误 1：以为普通数组会自动追加

```ts
history: z.array(z.string()).default(() => [])
```

这仍然是普通字段。

两个顺序 Node 分别返回数组时，后面的数组会覆盖前面的数组。

需要累积时应使用 `ReducedValue`。

#### 错误 2：把完整总数再次提交给求和 reducer

错误：

```ts
return {
  completedSteps: state.completedSteps + 1
};
```

本例正确写法：

```ts
return {
  completedSteps: 1
};
```

#### 错误 3：Value 和 Input 不同，却没有 inputSchema

本例最终保存 `string[]`，每次更新 `string`。

所以需要：

```ts
inputSchema: z.string()
```

#### 错误 4：直接修改 current

避免：

```ts
current.push(next);
return current;
```

推荐：

```ts
return [...current, next];
```

#### 错误 5：把 default 当作更新规则

```ts
.default(0)
.default(() => [])
```

它们只提供初始值。

真正的合并行为来自：

```ts
reducer: (current, next) => ...
```

#### 错误 6：所有字段都使用 reducer

如果字段只需要保存最新状态：

```text
status
approved
currentStep
selectedRoute
```

普通覆盖规则往往更合适。

#### 错误 7：把 reducer 当成路由函数

```text
reducer：
  决定字段值怎样合并。

routing function：
  决定下一步执行哪个 Node。
```

两者解决的问题不同。

### 19. 本节练习

#### 练习 1：预测第三个节点

新增：

```ts
const archiveTask: typeof TaskState.Node = () => {
  return {
    status: "archived",
    completedSteps: 1,
    history: "archive_task"
  };
};
```

预测最终结果：

```text
status = "archived"
completedSteps = 3
history.length = 3
```

#### 练习 2：把求和改成最大值

把 reducer 改成：

```ts
reducer: (current, next) => Math.max(current, next)
```

让两个节点分别提交 `3` 和 `7`。

最终值应该是：

```text
7
```

这可以帮助理解：

```text
ReducedValue 表示自定义合并规则，
并不等于固定的加法。
```

#### 练习 3：实现去重标签

节点依次提交：

```text
"typescript"
"langgraph"
"typescript"
```

目标结果：

```ts
["typescript", "langgraph"]
```

可以尝试 reducer：

```ts
reducer: (current, next) =>
  current.includes(next) ? current : [...current, next]
```

#### 练习 4：修改消息 ID

把修订消息的 ID 从：

```text
assistant-reply
```

改成：

```text
assistant-reply-v2
```

再次运行后，最终消息数量会从 `2` 变成 `3`。

思考原因：

```text
新 ID 表示新消息，所以 MessagesValue 会追加它。
```

### 20. 本节小结

这一节先记住：

```text
1. Node 读取完整 State，但通常只返回局部 State Update。

2. 未出现在 Update 中的字段会被保留。

3. 普通字段在顺序更新中使用新值覆盖旧值。

4. ReducedValue 使用 reducer(current, next) 合并更新。

5. valueSchema 描述最终保存的值。

6. inputSchema 描述 Node 每次提交的更新值。

7. 求和 reducer 的 Node 通常提交本次增量，不提交完整总数。

8. reducer 应保持纯粹，不原地修改 current。

9. MessagesValue 是预置的消息 reducer，会按消息 ID 追加或更新。
```

用一条公式收尾：

```text
下一份 State
  = 当前 State
  + Node 的局部 Update
  + 每个字段自己的更新规则
```

官方参考：

- [LangGraph JavaScript：Define and update state](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api#define-and-update-state)
- [LangGraph JavaScript：Graph API State](https://docs.langchain.com/oss/javascript/langgraph/graph-api#state)
- [LangGraph JavaScript：INVALID_CONCURRENT_GRAPH_UPDATE](https://docs.langchain.com/oss/javascript/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE)

## 03B super-step与图的执行边界

上一节已经知道：

```text
Node 返回局部 State Update。

普通字段使用新值。

ReducedValue 使用 reducer 合并当前值和新更新。
```

但还有一个问题没有解决：

```text
LangGraph 在什么时候合并这些 Update？

如果两个 Node 并行执行，
其中一个先完成，另一个能立即看到它的 Update 吗？
```

答案与 `super-step` 有关。

先记住本节目标：

```text
一个 super-step 内的 Node 读取同一份已提交 State；
它们的 Update 在执行边界统一合并；
下一 super-step 才能读取合并后的新 State。
```

### 1. super-step 不是“执行一个 Node”

可以先把 `super-step` 理解成：

```text
当前这一批可以执行的 Node。
```

一批中可能只有一个 Node：

```text
super-step A:
  prepare
```

一批中也可能有多个可并发执行的 Node：

```text
super-step B:
  research
  build_outline
```

所以：

```text
super-step != 单个 Node
```

顺序 Node 属于不同的 super-step。

同一批并行 Node 属于同一个 super-step。

### 2. 本节的 fan-out / fan-in 图

本节使用一张先分叉、再汇合的图：

```text
                         /-> research -------\
START -> prepare -------|                     |-> summarize -> END
                         \-> build_outline --/
```

这张图包含：

```text
prepare：
  整理输入主题。

research：
  生成学习资料。

build_outline：
  生成学习提纲。

summarize：
  等待资料和提纲都完成，再汇总。
```

`prepare` 有两条普通出边：

```ts
.addEdge("prepare", "research")
.addEdge("prepare", "build_outline")
```

这不是 if/else。

它表示：

```text
research 和 build_outline
都会在下一 super-step 被激活。
```

### 3. Pregel 执行模型的三个阶段

LangGraph 底层执行模型受到 Pregel 的启发。

每个 super-step 可以拆成三个阶段：

```text
Plan
  -> Execution
  -> Update
```

#### Plan：决定这一批执行谁

LangGraph 根据当前图状态和边，找出本轮被激活的 Node。

例如：

```text
prepare 完成后，
下一批选中 research 和 build_outline。
```

#### Execution：执行这一批 Node

当前批次选中的 Node 可以并发执行。

它们：

```text
读取当前已提交 State
执行自己的逻辑
返回各自的局部 Update
```

最重要的一点：

```text
Execution 阶段产生的 Update，
对同一 super-step 的其他 Node 不可见。
```

#### Update：统一应用这一批 Update

等当前批次结束后，LangGraph 才会：

```text
收集所有 Node 的 Update
按字段更新规则进行合并
形成下一份已提交 State
```

然后再进入下一轮 Plan。

完整循环：

```text
Plan
  -> Execution
  -> Update
  -> Plan
  -> Execution
  -> Update
  -> ...
```

直到没有新的 Node 需要执行。

### 4. 本节图包含三个业务 super-step

为了避免和以后 checkpoint 中的 `metadata.step` 编号混淆，本节使用字母标记业务节点批次。

#### 业务 super-step A

```text
prepare
```

#### 业务 super-step B

```text
research
build_outline
```

这两个 Node 属于同一批。

#### 业务 super-step C

```text
summarize
```

所以图的执行不是：

```text
prepare
  -> research
  -> build_outline
  -> summarize
```

而是：

```text
prepare
  -> [research + build_outline]
  -> summarize
```

方括号表示两个 Node 属于同一执行批次。

### 5. State 设计

本节 State：

```ts
const ParallelState = new StateSchema({
  topic: z.string(),
  preparedTopic: z.string().default(""),
  researchNotes: z.array(z.string()).default(() => []),
  outline: z.array(z.string()).default(() => []),
  summary: z.string().default(""),
  trace: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.string(),
      reducer: (current, event) => [...current, event]
    }
  )
});
```

各字段的写入者：

| 字段 | 写入 Node | 更新规则 |
|---|---|---|
| `preparedTopic` | `prepare` | 普通覆盖 |
| `researchNotes` | `research` | 普通覆盖 |
| `outline` | `build_outline` | 普通覆盖 |
| `summary` | `summarize` | 普通覆盖 |
| `trace` | 所有 Node | reducer 追加 |

`researchNotes` 和 `outline` 虽然都是数组，却不需要 reducer。

原因是：

```text
researchNotes 只有 research 写入。
outline 只有 build_outline 写入。
```

`trace` 需要 reducer，因为 `research` 和 `build_outline` 会在同一 super-step 共同写它。

这再次说明：

```text
是否需要 reducer，
取决于字段的更新语义和写入方式，
不取决于字段是不是数组。
```

### 6. prepare：单节点 super-step

`prepare`：

```ts
const prepare: typeof ParallelState.Node = (state) => {
  console.log("[prepare] sees trace:", state.trace);

  return {
    preparedTopic: state.topic.trim(),
    trace: "prepare"
  };
};
```

初始调用：

```ts
await graph.invoke({
  topic: "LangGraph super-step"
});
```

`prepare` 看到：

```ts
{
  topic: "LangGraph super-step",
  preparedTopic: "",
  researchNotes: [],
  outline: [],
  summary: "",
  trace: []
}
```

它提交：

```ts
{
  preparedTopic: "LangGraph super-step",
  trace: "prepare"
}
```

越过 super-step A 的 Update 边界后，新的已提交 State 包含：

```ts
{
  preparedTopic: "LangGraph super-step",
  trace: ["prepare"]
}
```

### 7. fan-out：一条路径分成多个并行分支

`prepare` 同时连接两个目标：

```ts
.addEdge("prepare", "research")
.addEdge("prepare", "build_outline")
```

这叫做 fan-out：

```text
一个上游节点
  -> 激活多个下游分支
```

到了业务 super-step B：

```text
research       读取 State S1
build_outline  也读取 State S1
```

它们读取的是同一份已经提交的 State。

### 8. 两个并行 Node 都看不到对方的 Update

`research`：

```ts
const research: typeof ParallelState.Node = async (state) => {
  console.log("[research:start] sees trace:", state.trace);
  await wait(80);
  console.log("[research:end]");

  return {
    researchNotes: [
      "LangGraph 使用离散的 super-step 执行图。",
      "同一步中的节点读取同一份已提交 State。"
    ],
    trace: "research"
  };
};
```

`build_outline`：

```ts
const buildOutline: typeof ParallelState.Node = async (state) => {
  console.log("[build_outline:start] sees trace:", state.trace);
  await wait(30);
  console.log("[build_outline:end]");

  return {
    outline: ["定义", "并行执行", "更新边界"],
    trace: "build_outline"
  };
};
```

两个 Node 启动时都打印：

```text
trace = ["prepare"]
```

`build_outline` 只等待 30ms，`research` 等待 80ms。

因此本次运行中：

```text
build_outline 先结束
research 后结束
```

但是 `research` 不会因为 `build_outline` 先结束，就突然看见：

```text
"build_outline"
```

原因是：

```text
Node 完成
  !=
Update 已经对同批其他 Node 可见
```

`build_outline` 返回的 Update 会先被当前 super-step 收集。

只有整个 super-step B 进入 Update 阶段后，才会统一合并。

### 9. 同一 super-step 共享的是起始快照

可以把 super-step B 画成：

```text
已提交 State S1
{
  trace: ["prepare"],
  researchNotes: [],
  outline: []
}
                 |
                 v
+--------------------------------------------------+
| super-step B                                     |
|                                                  |
| research                 build_outline           |
| 读取 S1                  读取 S1                 |
|                                                  |
| 返回：                    返回：                  |
| researchNotes: [...]     outline: [...]          |
| trace: "research"        trace: "build_outline"  |
|                                                  |
| 两边的 Update 在执行期间彼此不可见               |
+--------------------------------------------------+
                 |
                 | 等待本批任务结束
                 | 按字段规则统一合并
                 v
已提交 State S2
```

这就是本节最重要的执行边界。

一句话概括：

```text
同一 super-step 的 Node 共享起始 State，
不共享执行中的临时 Update。
```

### 10. Update 阶段怎样合并两个分支

`research` 提交：

```ts
{
  researchNotes: [
    "LangGraph 使用离散的 super-step 执行图。",
    "同一步中的节点读取同一份已提交 State。"
  ],
  trace: "research"
}
```

`build_outline` 提交：

```ts
{
  outline: ["定义", "并行执行", "更新边界"],
  trace: "build_outline"
}
```

逐字段处理：

```text
researchNotes：
  只有 research 写入，直接保存。

outline：
  只有 build_outline 写入，直接保存。

trace：
  两个并行 Node 都写入，
  使用 reducer 把两个事件合并进数组。
```

更新边界之后，`summarize` 才会看到类似：

```ts
{
  trace: ["prepare", "build_outline", "research"],
  researchNotes: [
    "LangGraph 使用离散的 super-step 执行图。",
    "同一步中的节点读取同一份已提交 State。"
  ],
  outline: ["定义", "并行执行", "更新边界"]
}
```

注意：这里展示的是本次实际运行顺序。

不要把并行分支的 reducer 数组顺序作为业务约定，后面会专门说明。

### 11. fan-in：等待多个分支汇合

本节使用数组形式的 `addEdge()`：

```ts
.addEdge(
  ["research", "build_outline"],
  "summarize"
)
```

它表达：

```text
等待 research 和 build_outline 都到达，
再激活 summarize。
```

这就是显式 fan-in，也可以称为 join 或汇合屏障。

`summarize`：

```ts
const summarize: typeof ParallelState.Node = (state) => {
  console.log("[summarize] sees trace:", state.trace);
  console.log("[summarize] sees researchNotes:", state.researchNotes);
  console.log("[summarize] sees outline:", state.outline);

  return {
    summary:
      "已汇合 " +
      state.researchNotes.length +
      " 条资料和 " +
      state.outline.length +
      " 个提纲。",
    trace: "summarize"
  };
};
```

它只会在两个分支都完成后执行。

所以它能同时读取：

```text
researchNotes
outline
两个分支合并后的 trace
```

### 12. 为什么推荐显式数组 barrier

在本节这种完全对称、同一层的分支里，也能看到官方示例写成：

```ts
.addEdge("research", "summarize")
.addEdge("build_outline", "summarize")
```

两个分支处在同一 super-step 时，`summarize` 会在下一步看到两边合并结果。

但如果以后分支长度不一样：

```text
                   /-> research ----------------\
prepare ----------|                              |-> summarize
                   \-> outline_part1
                         -> outline_part2 -------/
```

两条独立入边可能在不同执行批次分别激活汇总节点。

显式写：

```ts
.addEdge(
  ["research", "outline_part2"],
  "summarize"
)
```

意图更明确：

```text
两个指定节点都完成后，
summarize 才能继续。
```

需要注意：

```text
barrier 中列出的节点必须都会到达。
```

如果条件分支可能跳过其中一个，静态 barrier 就无法凑齐，后续节点不会被激活。

动态汇合属于后续进阶内容。

### 13. 本节完整图代码

图的核心代码：

```ts
const parallelGraph = new StateGraph(ParallelState)
  .addNode("prepare", prepare)
  .addNode("research", research)
  .addNode("build_outline", buildOutline)
  .addNode("summarize", summarize)
  .addEdge(START, "prepare")
  .addEdge("prepare", "research")
  .addEdge("prepare", "build_outline")
  .addEdge(["research", "build_outline"], "summarize")
  .addEdge("summarize", END)
  .compile();
```

注意 Node 名称使用：

```text
build_outline
```

而 State 字段名称是：

```text
outline
```

Node 名不能和 State 字段名重复，否则 LangGraph 会认为同一个名称同时被用作 Node 和 State channel。

### 14. 本节可运行代码

对应文件：

```text
langgraph-system-lab/src/examples/03b-super-step.ts
```

运行：

```bash
cd langgraph-system-lab
nvm use
pnpm example:super-step
```

这一节不调用 LLM，因此不需要 API Key。

本次实际执行的关键日志：

```text
[prepare] sees trace: []

[build_outline:start] sees trace: ["prepare"]
[research:start] sees trace: ["prepare"]

[build_outline:end]
[research:end]

[summarize] sees trace:
["prepare", "build_outline", "research"]
```

观察三点：

```text
1. build_outline 和 research 都在另一个分支结束前启动。

2. 两个分支启动时都只看见 ["prepare"]。

3. summarize 才看见两个分支合并后的 trace。
```

最终 State：

```ts
{
  topic: "LangGraph super-step",
  preparedTopic: "LangGraph super-step",
  researchNotes: [
    "LangGraph super-step 使用离散的 super-step 执行图。",
    "同一步中的节点读取同一份已提交 State。"
  ],
  outline: ["定义", "并行执行", "更新边界"],
  summary: "已汇合 2 条资料和 3 个提纲。",
  trace: [
    "prepare",
    "build_outline",
    "research",
    "summarize"
  ]
}
```

### 15. 并行 Node 写不同普通字段不会冲突

本节两个并行分支分别写：

```text
research -> researchNotes
build_outline -> outline
```

虽然这两个字段都是普通字段，但没有问题。

原因是：

```text
同一个普通字段在当前 super-step 只收到一个 Update。
```

可以记成：

```text
并行 Node 写不同普通字段：
  可以。

并行 Node 写同一个普通字段：
  需要特殊处理。
```

### 16. 并行 Node 写同一个普通字段会冲突

示例中还构建了一张故意出错的图：

```text
       /-> left_branch  -> END
START
       \-> right_branch -> END
```

State：

```ts
const ConflictState = new StateSchema({
  sharedStatus: z.string()
});
```

两个 Node 在同一 super-step 都写 `sharedStatus`：

```ts
const leftBranch: typeof ConflictState.Node = () => {
  return {
    sharedStatus: "left finished"
  };
};

const rightBranch: typeof ConflictState.Node = () => {
  return {
    sharedStatus: "right finished"
  };
};
```

LangGraph 无法根据普通字段规则回答：

```text
这一轮结束后，
sharedStatus 应该选择 left finished，
还是 right finished？
```

它不会根据谁最后完成来随便覆盖。

实际错误：

```text
InvalidUpdateError

Invalid update for channel "sharedStatus"
with values ["left finished", "right finished"]:
LastValue can only receive one value per step.
```

诊断码是：

```text
INVALID_CONCURRENT_GRAPH_UPDATE
```

错误发生在当前 super-step 的 Update 阶段。

### 17. 共享字段为什么需要 reducer

如果两个并行分支确实需要更新同一个字段，就必须说明怎样合并。

本节的 `trace`：

```ts
trace: new ReducedValue(
  z.array(z.string()).default(() => []),
  {
    inputSchema: z.string(),
    reducer: (current, event) => [...current, event]
  }
)
```

在 super-step B 的 Update 阶段，LangGraph 可以执行类似：

```text
当前 trace:
  ["prepare"]

并行 Update:
  "research"
  "build_outline"

reducer 合并后:
  ["prepare", ...两个分支事件]
```

所以：

```text
reducer 不只是为了跨顺序步骤累计数据，
也用于定义同一执行边界里多个 Update 的合并规则。
```

### 18. 不要依赖并行分支的数组顺序

本次输出是：

```ts
["prepare", "build_outline", "research", "summarize"]
```

但不要写业务逻辑假设：

```text
build_outline 一定排在 research 前面
```

也不要假设：

```text
谁先执行完，谁就一定先被 reducer 合并
```

并行完成顺序和 State 合并顺序不是业务顺序。

如果结果必须稳定排序，可以让每个分支提交：

```ts
{
  order: 1,
  value: "..."
}
```

在汇总节点显式排序。

如果业务上必须先做 A 再做 B，应直接使用顺序边：

```text
A -> B
```

不要用异步延迟或执行快慢表达业务顺序。

对于会接收并行写入的 reducer，优先选择容易稳定合并的规则，例如：

```text
求和
集合并集
按 ID 合并
带显式排序键的数据收集
```

### 19. 一个 super-step 具有统一提交边界

同一 super-step 可以把 State 更新理解成一次统一提交：

```text
所有当前 Node 成功完成
  -> 收集 Update
  -> 统一应用到 State
  -> 进入下一 super-step
```

如果当前批次出现错误：

```text
当前 super-step 不会正常提交下一份 State，
下游 Node 也不会开始执行。
```

在冲突案例中：

```text
left_branch 完成
right_branch 完成
  -> Update 阶段发现 sharedStatus 冲突
  -> 当前 super-step 失败
  -> 没有继续进入下一批
```

这也是为什么 super-step 是重要的故障和恢复边界。

具体的保存、恢复和 pending writes 会在 checkpointer 章节继续学习。

### 20. super-step、Node 和 invoke() 的关系

三者不要混淆。

#### Node

```text
一个具体业务步骤。
```

例如：

```text
research
```

#### super-step

```text
一批当前可执行的 Node，
以及这一批结束后的统一 Update 边界。
```

例如：

```text
[research, build_outline]
```

#### invoke()

```text
启动并等待整张图的一次运行。
```

一次 `invoke()` 通常包含多个 super-step：

```text
invoke()
  -> super-step A
  -> super-step B
  -> super-step C
  -> 返回最终 State
```

所以：

```text
一次 invoke() != 一个 Node
一次 invoke() != 一个 super-step
```

### 21. START 和 END 不要当作普通业务 Node

图中：

```text
START -> prepare -> ... -> summarize -> END
```

`START` 和 `END` 是虚拟边界标记。

它们没有我们自己编写的业务函数。

本节说“业务 super-step A/B/C”，只计算：

```text
prepare
research + build_outline
summarize
```

运行时还会处理输入边界。

以后查看 checkpoint 的 `metadata.step` 时，不要直接拿本节的 A/B/C 去对应固定数字。

### 22. 常见错误

#### 错误 1：认为 super-step 等于一个 Node

同一 super-step 可以包含多个并行 Node。

#### 错误 2：认为先结束的 Node 会立即修改共享 State

Node 返回的是 Update。

Update 要到当前 super-step 的更新边界才会统一应用。

#### 错误 3：认为同批 Node 能看到彼此的返回值

同批 Node 读取同一份起始 State。

只有下一批 Node 能看见合并结果。

#### 错误 4：把两条普通出边理解成 if/else

```ts
.addEdge("prepare", "research")
.addEdge("prepare", "build_outline")
```

表示两个目标都会被激活。

if/else 应使用条件边。

#### 错误 5：让并行 Node 共同写一个普通字段

这不会产生“最后完成者覆盖”，而会产生并发更新错误。

#### 错误 6：假设 reducer 数组顺序固定

并行结果如果需要固定顺序，应提交排序键并显式排序。

#### 错误 7：忘记表达 fan-in

需要汇总多个固定分支时，可以使用：

```ts
.addEdge(["research", "build_outline"], "summarize")
```

#### 错误 8：barrier 等待了不一定执行的 Node

数组中列出的 Node 必须都能到达，否则后续节点可能无法被激活。

#### 错误 9：Node 名和 State 字段同名

例如已经存在：

```ts
outline: z.array(z.string())
```

就不要再注册：

```ts
.addNode("outline", ...)
```

可以改为：

```ts
.addNode("build_outline", ...)
```

#### 错误 10：认为一次 invoke() 只有一个执行边界

图每推进一批 Node，就会形成新的 super-step。

### 23. 本节练习

#### 练习 1：预测各 Node 看到的 trace

回答：

```text
prepare 看到：
[]

research 看到：
["prepare"]

build_outline 看到：
["prepare"]

summarize 看到：
["prepare", 两个并行分支事件]
```

#### 练习 2：交换等待时间

把：

```text
research: 80ms
build_outline: 30ms
```

改成：

```text
research: 10ms
build_outline: 100ms
```

预测：

```text
结束日志顺序会改变。

两个分支读到的起始 trace 不会改变。

summarize 仍要等两个分支完成。
```

#### 练习 3：移除 trace reducer

把 `trace` 改成普通数组字段：

```ts
trace: z.array(z.string()).default(() => [])
```

同时让两个并行 Node 继续写 `trace`。

观察并解释：

```text
为什么在 Update 阶段出现并发更新错误？
```

#### 练习 4：改成顺序图

把图改为：

```text
prepare
  -> research
  -> build_outline
  -> summarize
```

此时 `build_outline` 可以看到：

```text
trace 中已经包含 research
```

对比：

```text
并行同批：看不到 sibling Update。
顺序下一批：能看到上一步 Update。
```

#### 练习 5：增加第三个并行分支

新增：

```text
collect_examples
```

把 fan-in 改成：

```ts
.addEdge(
  ["research", "build_outline", "collect_examples"],
  "summarize"
)
```

验证 `summarize` 会等待三个分支。

### 24. 本节小结

这一节先记住：

```text
1. super-step 是一批当前可执行 Node，不一定只有一个 Node。

2. 同一 super-step 的 Node 读取同一份已提交 State。

3. 同批 Node 产生的 Update 在执行期间彼此不可见。

4. 当前批次结束后，LangGraph 才统一合并所有 Update。

5. 下一 super-step 才能读取合并后的新 State。

6. 多条普通出边会激活多个并行分支，不是 if/else。

7. 并行 Node 写不同普通字段没有冲突。

8. 并行 Node 写同一个普通字段会产生并发更新错误。

9. 共享字段需要用 reducer 明确定义合并规则。

10. addEdge([...], target) 可以显式表达等待多个固定分支。

11. 不要依赖并行分支的执行完成顺序或 reducer 数组顺序。

12. 一次 invoke() 可以包含多个 super-step。
```

用一条公式收尾：

```text
super-step
  = 选出当前可执行 Node
  + 读取同一份已提交 State
  + 各自产生局部 Update
  + 在边界统一合并
```

官方参考：

- [LangGraph JavaScript Runtime：Pregel](https://docs.langchain.com/oss/javascript/langgraph/pregel)
- [LangGraph JavaScript Graph API：Graph execution](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
- [LangGraph JavaScript：Run graph nodes in parallel](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api#run-graph-nodes-in-parallel)
- [LangGraph JavaScript：INVALID_CONCURRENT_GRAPH_UPDATE](https://docs.langchain.com/oss/javascript/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE)

## 03C 用stream观察State变化

前两节已经建立了两个关键认知。

03A：

```text
Node 返回局部 State Update。

普通字段覆盖。

ReducedValue 使用 reducer 合并。
```

03B：

```text
同一 super-step 的 Node 读取同一份已提交 State。

它们的 Update 在执行边界统一合并。

下一 super-step 才读取合并后的完整 State。
```

现在的问题是：

```text
怎样从 Node 外部，
观察每个 Node 提交的 Update，
以及每个执行边界后的完整 State？
```

答案是使用：

```ts
graph.stream()
```

本节只学习 State streaming，不调用 LLM。

先记住目标：

```text
updates：
  看“哪个 Node 刚刚提交了什么”。

values：
  看“Update 合并后，完整 State 变成了什么”。
```

### 1. 为什么不能只看 invoke()

前面一直使用：

```ts
const result = await graph.invoke(input);
```

`invoke()` 会等待整张图执行结束，再返回最终 State。

它适合回答：

```text
这次运行最终得到什么结果？
```

但只看最终结果，很难直接回答：

```text
哪个 Node 更新了哪些字段？

某个 Node 返回的是增量还是完整值？

reducer 在什么时候完成合并？

两个并行 Node 分别提交了什么？

super-step 边界后的完整 State 是什么？
```

例如最终只看到：

```ts
{
  phase: "completed",
  trace: [
    "prepare",
    "build_outline",
    "research",
    "summarize"
  ]
}
```

我们无法仅凭这份最终 State，直接看见中间每一次 Update。

### 2. stream() 返回异步执行流

基本写法：

```ts
const stream = await graph.stream(input, {
  streamMode: "updates"
});

for await (const chunk of stream) {
  console.log(chunk);
}
```

这里有两个 `await` 概念：

```text
await graph.stream(...)：
  等待得到可异步迭代的 stream。

for await...of：
  随着图的执行，逐个读取 chunk。
```

`stream` 不是普通数组。

不要写：

```ts
for (const chunk of stream) {
  // ...
}
```

应该写：

```ts
for await (const chunk of stream) {
  // ...
}
```

也可以缩写成：

```ts
for await (
  const chunk of await graph.stream(input, {
    streamMode: "updates"
  })
) {
  console.log(chunk);
}
```

### 3. streamMode 决定观察视角

LangGraph 提供多种 stream mode。

这一节只学习两个：

```text
updates
values
```

对比：

| 模式 | 每个 chunk 主要包含什么 | 回答的问题 |
|---|---|---|
| `updates` | Node 名和该 Node 的局部 Update | 谁刚刚提交了什么？ |
| `values` | 当前完整 State | 合并后 State 变成了什么？ |

注意拼写是复数：

```ts
"updates"
"values"
```

不是：

```ts
"update"
"value"
```

建议始终显式指定 `streamMode`，不要依赖默认模式。

### 4. 本节继续使用 fan-out / fan-in 图

继续沿用上一节的结构：

```text
                         /-> research -------\
START -> prepare -------|                     |-> summarize -> END
                         \-> build_outline --/
```

业务 super-step：

```text
A:
  prepare

B:
  research
  build_outline

C:
  summarize
```

这样可以直接观察：

```text
同一 super-step 的多个 Node，
在 updates 中怎样分别出现，
在 values 中又怎样形成一个合并边界。
```

### 5. 本节 State

```ts
const StreamState = new StateSchema({
  topic: z.string(),
  phase: z.string().default("received"),
  researchNotes: z.array(z.string()).default(() => []),
  outlineSections: z.array(z.string()).default(() => []),
  summary: z.string().default(""),
  trace: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.string(),
      reducer: (current, event) => [...current, event]
    }
  )
});
```

`trace` 最终保存在 State 中的类型：

```ts
string[]
```

但每个 Node 提交给 reducer 的类型：

```ts
string
```

因此这一字段特别适合对比：

```text
updates 看到 reducer 的输入增量。

values 看到 reducer 合并后的完整数组。
```

### 6. 四个 Node 返回什么

#### prepare

```ts
const prepare: typeof StreamState.Node = () => {
  return {
    phase: "prepared",
    trace: "prepare"
  };
};
```

#### research

```ts
const research: typeof StreamState.Node = async (state) => {
  await wait(50);

  return {
    researchNotes: [
      state.topic + " 可以使用 updates 观察节点增量。",
      state.topic + " 可以使用 values 观察完整 State。"
    ],
    trace: "research"
  };
};
```

#### build_outline

```ts
const buildOutline: typeof StreamState.Node = async () => {
  await wait(10);

  return {
    outlineSections: ["updates", "values", "执行边界"],
    trace: "build_outline"
  };
};
```

#### summarize

```ts
const summarize: typeof StreamState.Node = (state) => {
  return {
    phase: "completed",
    summary:
      "已汇合 " +
      state.researchNotes.length +
      " 条资料和 " +
      state.outlineSections.length +
      " 个章节。",
    trace: "summarize"
  };
};
```

图的连接：

```ts
const graph = new StateGraph(StreamState)
  .addNode("prepare", prepare)
  .addNode("research", research)
  .addNode("build_outline", buildOutline)
  .addNode("summarize", summarize)
  .addEdge(START, "prepare")
  .addEdge("prepare", "research")
  .addEdge("prepare", "build_outline")
  .addEdge(["research", "build_outline"], "summarize")
  .addEdge("summarize", END)
  .compile();
```

### 7. updates 模式：观察局部 Update

只订阅 `updates`：

```ts
const stream = await graph.stream(
  {
    topic: "LangGraph State stream"
  },
  {
    streamMode: "updates"
  }
);

for await (const chunk of stream) {
  console.dir(chunk, { depth: null });
}
```

每个 chunk 的外层 key 是 Node 名：

```ts
{
  prepare: {
    phase: "prepared",
    trace: "prepare"
  }
}
```

它可以回答：

```text
哪个 Node 刚完成？

它本次返回了哪些字段？

它提交给 reducer 的增量是什么？
```

### 8. updates 不是完整 State

`prepare` 的 updates chunk：

```ts
{
  prepare: {
    phase: "prepared",
    trace: "prepare"
  }
}
```

其中没有：

```text
topic
researchNotes
outlineSections
summary
```

这不表示这些 State 字段被删除了。

它只表示：

```text
prepare 本次没有更新这些字段。
```

所以 `updates` 不是完整 State。

### 9. updates 也不是自动计算的对象 diff

可以把 `updates` 理解成：

```text
Node 实际返回的局部 State Update。
```

它不是 LangGraph 拿两份完整 State 自动计算出的 JavaScript diff。

例如 `research` 返回：

```ts
{
  researchNotes: [...],
  trace: "research"
}
```

`updates` 就会保留这个形状：

```ts
{
  research: {
    researchNotes: [...],
    trace: "research"
  }
}
```

`trace` 仍是字符串：

```ts
"research"
```

因为它是 Node 提交给 reducer 的本次增量。

### 10. 同一 super-step 的多个 Update 分别输出

`research` 和 `build_outline` 属于同一 super-step。

`build_outline` 只等待 10ms，所以本次先得到：

```ts
{
  build_outline: {
    outlineSections: [
      "updates",
      "values",
      "执行边界"
    ],
    trace: "build_outline"
  }
}
```

随后得到：

```ts
{
  research: {
    researchNotes: [
      "LangGraph State stream 可以使用 updates 观察节点增量。",
      "LangGraph State stream 可以使用 values 观察完整 State。"
    ],
    trace: "research"
  }
}
```

这两个 Node 虽然在同一 super-step，但产生两个独立 `updates` chunk。

非常重要：

```text
先收到 build_outline 的 updates，
不表示完整 State 已经单独提交了 build_outline。
```

LangGraph 仍要等待当前 super-step 的 `research` 完成，再统一合并。

如果交换两个 Node 的等待时间，两个并行 `updates` chunk 的到达顺序可能改变。

不要依赖这个顺序表达业务先后。

### 11. values 模式：观察完整 State

只订阅 `values`：

```ts
const stream = await graph.stream(
  {
    topic: "LangGraph State stream"
  },
  {
    streamMode: "values"
  }
);

for await (const state of stream) {
  console.dir(state, { depth: null });
}
```

每个 chunk 直接是一份完整 State。

它可以回答：

```text
当前完整 State 是什么？

默认值是否已经填充？

reducer 合并后的字段是什么？

当前 super-step 是否已经越过更新边界？
```

### 12. 第一个 values chunk：初始完整 State

本项目当前版本的第一个 `values` chunk：

```ts
{
  topic: "LangGraph State stream",
  phase: "received",
  researchNotes: [],
  outlineSections: [],
  summary: "",
  trace: []
}
```

这时：

```text
输入 topic 已经进入 State。

StateSchema 中的默认值已经填充。

业务 Node 还没有产生 Update。
```

所以不要认为：

```text
一个 values chunk 一定对应一个业务 Node。
```

初始输入也会形成一份可以观察到的完整 State。

### 13. prepare 后的 values chunk

`prepare` 提交：

```ts
{
  phase: "prepared",
  trace: "prepare"
}
```

reducer 和普通字段规则应用后，`values` 输出：

```ts
{
  topic: "LangGraph State stream",
  phase: "prepared",
  researchNotes: [],
  outlineSections: [],
  summary: "",
  trace: ["prepare"]
}
```

对比：

```text
updates 中：
  trace 是 "prepare"

values 中：
  trace 是 ["prepare"]
```

这正是 reducer 输入和 reducer 结果的区别。

### 14. 并行 super-step 后只有一个 values chunk

业务 super-step B 中有：

```text
research
build_outline
```

`updates` 会分别输出两个 Node 的局部更新。

但 `values` 不会输出：

```text
一份只有 build_outline 结果的完整 State
再输出一份加入 research 结果的完整 State
```

它会等当前 super-step 完成并统一合并，然后只输出一份完整 State：

```ts
{
  topic: "LangGraph State stream",
  phase: "prepared",
  researchNotes: [
    "LangGraph State stream 可以使用 updates 观察节点增量。",
    "LangGraph State stream 可以使用 values 观察完整 State。"
  ],
  outlineSections: [
    "updates",
    "values",
    "执行边界"
  ],
  summary: "",
  trace: [
    "prepare",
    "build_outline",
    "research"
  ]
}
```

这份 `values` chunk 表示：

```text
super-step B 已经越过 Update 边界。
```

下一步的 `summarize` 可以读取两边合并后的结果。

### 15. 最后一个 values chunk

`summarize` 的 Update：

```ts
{
  phase: "completed",
  summary: "已汇合 2 条资料和 3 个章节。",
  trace: "summarize"
}
```

应用更新规则后，最后一个 `values` chunk：

```ts
{
  topic: "LangGraph State stream",
  phase: "completed",
  researchNotes: [
    "LangGraph State stream 可以使用 updates 观察节点增量。",
    "LangGraph State stream 可以使用 values 观察完整 State。"
  ],
  outlineSections: [
    "updates",
    "values",
    "执行边界"
  ],
  summary: "已汇合 2 条资料和 3 个章节。",
  trace: [
    "prepare",
    "build_outline",
    "research",
    "summarize"
  ]
}
```

如果图正常执行完成：

```text
最后一个 values chunk
就是本次运行的最终完整 State。
```

### 16. values 和 updates 的核心对照

| 问题 | `values` | `updates` |
|---|---|---|
| 是否是完整 State | 是 | 否 |
| 是否显示 Node 名 | 通常不直接显示 | 显示 |
| 是否包含未变化字段 | 是 | 否 |
| reducer 字段 | 合并后的完整值 | Node 提交的增量 |
| 并行 super-step | 边界后一个合并 State | 每个 Node 独立 chunk |
| 数据量 | 通常较大 | 通常较小 |
| 适合回答 | 现在 State 是什么？ | 谁刚刚改了什么？ |

一句话区分：

```text
updates 看 Node 的提交。

values 看 LangGraph 的提交结果。
```

### 17. 同一次运行同时观察两种模式

如果先调用：

```ts
await runUpdates();
await runValues();
```

这会把整张图运行两次。

它不是从两个视角观察同一次运行。

本节示例使用：

```ts
const stream = await graph.stream(
  {
    topic: "LangGraph State stream"
  },
  {
    streamMode: ["updates", "values"]
  }
);
```

传入多个模式后，每个 chunk 变成：

```ts
[mode, payload]
```

消费：

```ts
for await (const [mode, payload] of stream) {
  console.log(mode);
  console.dir(payload, { depth: null });
}
```

此时：

```text
mode === "updates"
  -> payload 是 Node 局部 Update。

mode === "values"
  -> payload 是完整 State。
```

这样可以在同一次图执行中同时观察两种视角。

### 18. 本节完整事件顺序

本次运行共输出 8 个 chunk：

```text
chunk 0: values
  初始完整 State S0

chunk 1: updates
  prepare 提交 Update P

chunk 2: values
  prepare 边界后的完整 State S1

chunk 3: updates
  build_outline 提交 Update O

chunk 4: updates
  research 提交 Update R

chunk 5: values
  并行 super-step 合并后的完整 State S2

chunk 6: updates
  summarize 提交 Update S

chunk 7: values
  summarize 边界后的最终 State S3
```

用一张图表示：

```text
输入
  |
  v
values S0
  |
  v
prepare
  |
updates P
  |
values S1
  |
  +-----------------------+
  |                       |
  v                       v
research              build_outline
  |                       |
updates R             updates O
  |                       |
  +----------+------------+
             |
             | super-step 统一合并
             v
          values S2
             |
             v
         summarize
             |
         updates S
             |
         values S3
```

并行的 `updates R` 和 `updates O` 到达顺序可能互换。

但 `values S2` 一定表示这个并行边界已经完成合并。

### 19. 收到 updates 不等于同批 State 已提交

假设先收到：

```ts
{
  build_outline: {
    outlineSections: [...],
    trace: "build_outline"
  }
}
```

它只表示：

```text
build_outline 已经返回自己的 Update。
```

它不表示：

```text
research 已经能看到 outlineSections。

summarize 已经可以开始。

当前 super-step 已经完成。
```

只有看到并行边界后的 `values`，才说明两边的 Update 已经合并进新的完整 State。

这正好对应 03B 的：

```text
Execution
  -> Update boundary
  -> next super-step
```

### 20. 不要用浅合并手工重建 State

看到 updates 后，可能会想：

```ts
currentState = {
  ...currentState,
  ...nodeUpdate
};
```

这不一定正确。

本节 `trace` 的 Node Update 是：

```ts
{
  trace: "research"
}
```

直接浅合并会让：

```ts
trace: string[]
```

错误地变成：

```ts
trace: string
```

因为真正的 State 更新必须经过 reducer：

```ts
reducer(currentTrace, "research")
```

如果需要可靠的完整 State，直接消费 `values`。

不要在图外自己猜测 reducer 规则。

### 21. stream() 会真正执行图

`stream()` 不是对之前一次 `invoke()` 的录像回放。

调用：

```ts
await graph.stream(input, options)
```

会启动一次新的图执行。

因此：

```ts
await graph.stream(input, {
  streamMode: "updates"
});

await graph.stream(input, {
  streamMode: "values"
});
```

代表两次独立运行。

所有 Node 都会执行两次。

本地纯函数案例重复运行没有问题。

但真实 Node 可能会：

```text
发送消息
写数据库
创建订单
调用收费 API
```

不能为了比较日志而随意运行两次。

需要同一次运行观察多个视角时，使用多模式数组。

### 22. streamMode 不改变图的执行语义

选择 `updates` 或 `values` 只改变观察方式。

它不会改变：

```text
Node 的业务逻辑
Edge 的连接关系
条件路由
reducer
super-step
fan-out / fan-in
最终 State
```

可以理解成：

```text
同一张图，
选择不同的观察窗口。
```

### 23. invoke()、updates、values 的选择

#### 只需要最终结果

```ts
const result = await graph.invoke(input);
```

#### 需要展示节点进度

```ts
streamMode: "updates"
```

例如 UI 显示：

```text
prepare 已完成
research 已完成
build_outline 已完成
summarize 已完成
```

#### 需要观察完整 State 演进

```ts
streamMode: "values"
```

适合：

```text
学习 State 更新
调试 reducer
查看每个执行边界
保存最新完整 State 到界面
```

#### 两种信息都需要

```ts
streamMode: ["updates", "values"]
```

### 24. State streaming 不是 LLM token streaming

本节的：

```ts
streamMode: "updates"
streamMode: "values"
```

观察的是图的 State。

它不是逐 token 输出模型文字。

以后调用 LLM 时，常见的 token streaming 会涉及：

```text
messages
```

还可以进一步学习：

```text
custom
tools
debug
```

这些模式本节暂不展开。

### 25. 本节可运行代码

对应文件：

```text
langgraph-system-lab/src/examples/03c-stream-state.ts
```

运行：

```bash
cd langgraph-system-lab
nvm use
pnpm example:stream:state
```

这个案例不调用 LLM，因此不需要 API Key。

### 26. 常见错误

#### 错误 1：忘记 await graph.stream()

错误理解：

```text
graph.stream() 立即就是可迭代数组。
```

推荐：

```ts
const stream = await graph.stream(input, options);
```

#### 错误 2：使用普通 for...of

应该使用：

```ts
for await (const chunk of stream) {
  // ...
}
```

#### 错误 3：只打印 stream 对象

```ts
console.log(stream);
```

只能看到流对象本身，不能消费后续 chunk。

#### 错误 4：把 updates 当成完整 State

updates 只包含 Node 本次返回的局部更新。

#### 错误 5：把 updates 当成自动 diff

它保留 Node Update 的结构，不是两份 State 的通用 diff。

#### 错误 6：认为每个并行 Node 都产生一个 values

同一 super-step 的并行 Update 会在边界合并，然后产生一份完整 values。

#### 错误 7：认为先收到的 updates 已对 sibling 可见

updates 到达顺序不改变 super-step 的 State 可见性。

#### 错误 8：依赖并行 updates 的先后顺序

Node 耗时变化后，到达顺序可能改变。

#### 错误 9：用浅合并自己重建 reducer State

这会绕过字段的 reducer 规则。

#### 错误 10：为了对比模式重复执行有副作用的图

两次 `stream()` 调用就是两次图执行。

#### 错误 11：认为 values 和 updates 数量永远一样

本例恰好：

```text
values：
  初始 State + 3 个业务执行边界 = 4

updates：
  4 个业务 Node = 4
```

如果增加第三个并行 Node：

```text
updates 会多一个 Node chunk。

values 的并行执行边界仍只有一个。
```

#### 错误 12：把 State stream 当成 token stream

它们是不同的观察维度。

### 27. 本节练习

#### 练习 1：判断 chunk 类型

看到：

```ts
{
  research: {
    researchNotes: ["A", "B"],
    trace: "research"
  }
}
```

答案：

```text
updates chunk
```

看到：

```ts
{
  topic: "...",
  phase: "prepared",
  researchNotes: ["A", "B"],
  outlineSections: ["..."],
  summary: "",
  trace: ["prepare", "research", "build_outline"]
}
```

答案：

```text
values chunk
```

#### 练习 2：预测 reducer 字段

`research` 返回：

```ts
{
  trace: "research"
}
```

问题：

```text
updates 中 trace 是什么？
values 合并后 trace 是什么？
```

答案：

```text
updates：
  "research"

values：
  包含历史事件的 string[]
```

#### 练习 3：增加第三个并行 Node

新增：

```text
collect_examples
```

预测：

```text
updates：
  多一个 collect_examples chunk。

values：
  并行边界后仍只出现一份合并 State。
```

#### 练习 4：交换异步等待时间

把：

```text
research: 50ms
build_outline: 10ms
```

交换。

预测：

```text
两个并行 updates 的到达顺序可能改变。

完整 State 的业务内容不应改变。
```

#### 练习 5：保存最终 State

```ts
let finalState: typeof StreamState.State | undefined;

const stream = await graph.stream(input, {
  streamMode: "values"
});

for await (const state of stream) {
  finalState = state;
}

console.log(finalState);
```

正常结束时，`finalState` 就是最后一个完整 State。

### 28. 本节小结

这一节先记住：

```text
1. graph.stream() 会启动并流式观察一次图执行。

2. stream 需要通过 for await...of 异步消费。

3. updates 返回 Node 名和局部 State Update。

4. values 返回当前完整 State。

5. updates 展示 Node 提交给 reducer 的增量。

6. values 展示 reducer 合并后的完整字段值。

7. 同一 super-step 的多个 Node 会分别产生 updates chunk。

8. values 在该 super-step 越过更新边界后只产生一份合并 State。

9. 收到一个并行 updates，不表示当前 State 已经单独提交它。

10. streamMode 改变观察视角，不改变图的执行语义。

11. 多模式数组可以在同一次运行中同时观察 updates 和 values。

12. 两次 graph.stream() 调用代表两次独立图执行。
```

用一句话收尾：

```text
updates 让我们看见 Node 提交了什么；
values 让我们看见这些 Update 合并后，State 变成了什么。
```

官方参考：

- [LangGraph JavaScript Streaming](https://docs.langchain.com/oss/javascript/langgraph/streaming)
- [LangGraph JavaScript Streaming：Graph state](https://docs.langchain.com/oss/javascript/langgraph/streaming#graph-state)
- [LangGraph JavaScript Streaming：Multiple modes](https://docs.langchain.com/oss/javascript/langgraph/streaming#multiple-modes-at-once)
- [LangGraph JavaScript Runtime：Pregel](https://docs.langchain.com/oss/javascript/langgraph/pregel)
