import assert from "node:assert/strict";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const ShippingState = new StateSchema({
  destination: z.string(),
  weightKg: z.number(),
  zone: z.enum(["local", "remote"]).default("local"),
  shippingFee: z.number().default(0)
});

const classifyZone: typeof ShippingState.Node = (state) => {
  console.log("[子图] 判断配送区域");
  const zone = ["上海", "杭州"].includes(state.destination)
    ? "local"
    : "remote";
  return { zone };
};

const calculateShipping: typeof ShippingState.Node = (state) => {
  console.log("[子图] 计算运费");
  const baseFee = state.zone === "local" ? 8 : 15;
  return { shippingFee: baseFee + state.weightKg * 2 };
};

const shippingSubgraph = new StateGraph(ShippingState)
  .addNode("classify_zone", classifyZone)
  .addNode("calculate_shipping", calculateShipping)
  .addEdge(START, "classify_zone")
  .addEdge("classify_zone", "calculate_shipping")
  .addEdge("calculate_shipping", END)
  .compile();

const OrderState = new StateSchema({
  orderId: z.string(),
  destination: z.string(),
  weightKg: z.number(),
  shippingFee: z.number().default(0),
  summary: z.string().default("")
});

const prepareOrder: typeof OrderState.Node = (state) => {
  console.log(`[父图] 准备订单 ${state.orderId}`);
  return {};
};

const finishOrder: typeof OrderState.Node = (state) => {
  console.log("[父图] 汇总结果");
  return {
    summary: `${state.orderId} 发往${state.destination}，运费 ${state.shippingFee} 元`
  };
};

const orderGraph = new StateGraph(OrderState)
  .addNode("prepare_order", prepareOrder)
  .addNode("shipping", shippingSubgraph)
  .addNode("finish_order", finishOrder)
  .addEdge(START, "prepare_order")
  .addEdge("prepare_order", "shipping")
  .addEdge("shipping", "finish_order")
  .addEdge("finish_order", END)
  .compile();

async function main() {
  const result = await orderGraph.invoke({
    orderId: "ORDER-001",
    destination: "成都",
    weightKg: 3
  });

  assert.equal(result.shippingFee, 21);
  assert.equal(result.summary, "ORDER-001 发往成都，运费 21 元");
  assert.equal("zone" in result, false);

  console.log("\n最终结果：", result.summary);
  console.log("子图私有字段 zone 是否进入父图：", "zone" in result);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
