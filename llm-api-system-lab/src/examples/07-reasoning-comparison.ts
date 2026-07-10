import { generateText, getActiveProviderName } from "../llm/client.js";

const puzzle = [
  "一个球拍和一个球一共 11 元。",
  "球拍比球贵 10 元。",
  "请问球多少钱？"
].join("\n");

async function ask(label: string, prompt: string) {
  const response = await generateText({
    temperature: 0,
    maxOutputTokens: 500,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  console.log(`\n=== ${label} ===`);
  console.log(`[${response.provider}/${response.model}]`);
  console.log(response.text);
}

const quickPrompt = [
  "请快速直接回答，不要展开过程。",
  "只输出最终答案。",
  "",
  puzzle
].join("\n");

const carefulPrompt = [
  "请谨慎解题，不要只凭直觉。",
  "按以下格式输出：",
  "1. 设未知数",
  "2. 列方程",
  "3. 计算",
  "4. 验算",
  "5. 最终答案",
  "",
  puzzle
].join("\n");

console.log(`Active provider: ${getActiveProviderName()}`);
console.log("标准答案：球是 0.5 元，球拍是 10.5 元。");
console.log("说明：这个示例演示 prompt 层面的快答/审慎对比，不等同于 Codex UI 的 Reasoning 推理预算。");

// 快答提示更容易暴露“模式匹配式回答”的风险。
await ask("非深度思考：快速直接回答", quickPrompt);

// 审慎提示要求模型显式拆解和验算，便于观察可解释的检查过程。
await ask("深度思考：拆解、计算、验算", carefulPrompt);
