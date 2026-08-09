import { createDeepAgent } from "deepagents";
import { FakeToolCallingModel, tool } from "langchain";
import { z } from "zod";
import { getToolObservations } from "../offload.js";

const ORDER_ID = "ORD-1001";
const IDEMPOTENCY_KEY = "refund:ORD-1001:case-20260809";

type Order = {
  orderId: string;
  paidAmountCents: number;
  currency: "CNY";
  status: "paid" | "refunded";
};

type Refund = {
  refundId: string;
  orderId: string;
  amountCents: number;
  reason: string;
  status: "pending";
};

type ToolResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: string; message: string; retryable: boolean };
    };

class InMemoryOrderGateway {
  private readonly orders = new Map<string, Order>([
    [
      ORDER_ID,
      {
        orderId: ORDER_ID,
        paidAmountCents: 25_900,
        currency: "CNY",
        status: "paid"
      }
    ]
  ]);

  private readonly refundsByIdempotencyKey = new Map<string, Refund>();

  findOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  createRefund(input: {
    order: Order;
    amountCents: number;
    reason: string;
    idempotencyKey: string;
  }): Refund & { replayed: boolean } {
    const existing = this.refundsByIdempotencyKey.get(input.idempotencyKey);
    if (existing) return { ...existing, replayed: true };

    const refund: Refund = {
      refundId: "RFND-0001",
      orderId: input.order.orderId,
      amountCents: input.amountCents,
      reason: input.reason,
      status: "pending"
    };
    this.refundsByIdempotencyKey.set(input.idempotencyKey, refund);
    return { ...refund, replayed: false };
  }

  countRefunds(): number {
    return this.refundsByIdempotencyKey.size;
  }
}

class RefundApprovalStore {
  private readonly approvedOrderIds = new Set<string>();

  approve(orderId: string): void {
    this.approvedOrderIds.add(orderId);
  }

  isApproved(orderId: string): boolean {
    return this.approvedOrderIds.has(orderId);
  }
}

function jsonResult<T>(result: ToolResult<T>): string {
  return JSON.stringify(result);
}

function createOrderTools(
  gateway: InMemoryOrderGateway,
  approvals: RefundApprovalStore
) {
  const getOrder = tool(
    async ({ orderId }) => {
      const order = gateway.findOrder(orderId);
      if (!order) {
        return jsonResult({
          ok: false,
          error: {
            code: "ORDER_NOT_FOUND",
            message: `订单 ${orderId} 不存在。`,
            retryable: false
          }
        });
      }

      return jsonResult({ ok: true, data: order });
    },
    {
      name: "get_order",
      description:
        "按订单号读取实付金额、币种和状态。这是只读工具，创建退款申请前必须先调用它核对订单。",
      schema: z.object({
        orderId: z
          .string()
          .regex(/^ORD-\d{4}$/)
          .describe("订单编号，格式为 ORD- 加四位数字，例如 ORD-1001")
      })
    }
  );

  const createRefundRequest = tool(
    async ({ orderId, amountCents, reason, idempotencyKey }) => {
      const order = gateway.findOrder(orderId);
      if (!order) {
        return jsonResult({
          ok: false,
          error: {
            code: "ORDER_NOT_FOUND",
            message: `订单 ${orderId} 不存在，退款申请未创建。`,
            retryable: false
          }
        });
      }
      if (order.status !== "paid") {
        return jsonResult({
          ok: false,
          error: {
            code: "ORDER_NOT_REFUNDABLE",
            message: `订单 ${orderId} 当前状态不可退款。`,
            retryable: false
          }
        });
      }
      if (!approvals.isApproved(orderId)) {
        return jsonResult({
          ok: false,
          error: {
            code: "REFUND_NOT_APPROVED",
            message: `订单 ${orderId} 尚未通过应用层退款确认。`,
            retryable: false
          }
        });
      }
      if (amountCents > order.paidAmountCents) {
        return jsonResult({
          ok: false,
          error: {
            code: "AMOUNT_EXCEEDS_PAYMENT",
            message: `退款金额不能超过实付 ${order.paidAmountCents} 分。`,
            retryable: false
          }
        });
      }

      const refund = gateway.createRefund({
        order,
        amountCents,
        reason,
        idempotencyKey
      });
      return jsonResult({ ok: true, data: refund });
    },
    {
      name: "create_refund_request",
      description:
        "创建退款申请，会产生业务写入。仅在用户明确确认退款、且已用 get_order 核对金额后调用；必须提供唯一幂等键。",
      schema: z.object({
        orderId: z
          .string()
          .regex(/^ORD-\d{4}$/)
          .describe("已通过 get_order 核对的订单编号"),
        amountCents: z
          .number()
          .int()
          .positive()
          .max(1_000_000)
          .describe("退款金额，单位为分，必须为正整数"),
        reason: z
          .string()
          .trim()
          .min(8)
          .max(200)
          .describe("8 到 200 字的退款原因"),
        confirmation: z
          .literal("CONFIRM_REFUND")
          .describe("用户明确确认后才可传入固定值 CONFIRM_REFUND"),
        idempotencyKey: z
          .string()
          .regex(/^refund:ORD-\d{4}:[a-z0-9-]+$/)
          .describe("防止重复写入的稳定幂等键")
      })
    }
  );

  return { getOrder, createRefundRequest };
}

function parseResult<T>(value: unknown): ToolResult<T> {
  if (typeof value !== "string") throw new Error("工具没有返回 JSON 字符串。");
  return JSON.parse(value) as ToolResult<T>;
}

async function main() {
  const gateway = new InMemoryOrderGateway();
  const approvals = new RefundApprovalStore();
  const { getOrder, createRefundRequest } = createOrderTools(
    gateway,
    approvals
  );

  // Tool 应先脱离 Agent 独立测试：Schema 错误必须在业务实现运行前失败。
  let schemaRejected = false;
  try {
    await createRefundRequest.invoke({
      orderId: ORDER_ID,
      amountCents: -1,
      reason: "用户确认商品未收到，非法金额测试",
      confirmation: "CONFIRM_REFUND",
      idempotencyKey: IDEMPOTENCY_KEY
    });
  } catch {
    schemaRejected = true;
  }
  if (!schemaRejected || gateway.countRefunds() !== 0) {
    throw new Error("Schema 验收失败：非法参数没有在写入前被拒绝。");
  }

  // 可预期的业务失败返回稳定错误对象，让模型能够修正参数或停止操作。
  const notFound = parseResult<Order>(
    await getOrder.invoke({ orderId: "ORD-9999" })
  );
  if (notFound.ok || notFound.error.code !== "ORDER_NOT_FOUND") {
    throw new Error("业务错误验收失败：缺少稳定错误码。");
  }

  const refundArgs = {
    orderId: ORDER_ID,
    amountCents: 25_900,
    reason: "用户确认商品未收到，申请全额退款",
    confirmation: "CONFIRM_REFUND" as const,
    idempotencyKey: IDEMPOTENCY_KEY
  };

  // 模型可以填写 confirmation 字段，但真正授权必须来自不受模型控制的应用层。
  const unauthorized = parseResult<Refund>(
    await createRefundRequest.invoke(refundArgs)
  );
  if (
    unauthorized.ok ||
    unauthorized.error.code !== "REFUND_NOT_APPROVED" ||
    gateway.countRefunds() !== 0
  ) {
    throw new Error("授权边界验收失败：模型参数绕过了应用层确认。");
  }
  approvals.approve(ORDER_ID);

  const model = new FakeToolCallingModel({
    toolCalls: [
      [
        {
          name: "get_order",
          args: { orderId: ORDER_ID },
          id: "get-order-1"
        }
      ],
      [
        {
          name: "create_refund_request",
          args: refundArgs,
          id: "create-refund-1"
        }
      ],
      []
    ]
  });
  const agent = createDeepAgent({
    model,
    tools: [getOrder, createRefundRequest],
    systemPrompt:
      "你是退款助手。先用只读工具核对订单；写操作必须有用户确认，并使用稳定幂等键。"
  });
  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: `我确认对 ${ORDER_ID} 全额退款，原因是商品未收到。`
      }
    ]
  });

  const observations = getToolObservations(result.messages);
  const toolNames = observations.map((observation) => observation.name);
  if (toolNames.join(" → ") !== "get_order → create_refund_request") {
    throw new Error(`工具调用顺序错误：${toolNames.join(" → ")}`);
  }
  const created = parseResult<Refund & { replayed: boolean }>(
    observations[1]?.content
  );
  if (!created.ok || created.data.replayed || gateway.countRefunds() !== 1) {
    throw new Error("退款写入验收失败。");
  }

  // 模拟网络重试：相同幂等键只能得到原结果，不能创建第二条退款记录。
  const replay = parseResult<Refund & { replayed: boolean }>(
    await createRefundRequest.invoke(refundArgs)
  );
  if (!replay.ok || !replay.data.replayed || gateway.countRefunds() !== 1) {
    throw new Error("幂等验收失败：重试产生了重复写入。");
  }

  console.log("10 自定义 Tools 离线实验");
  console.log(`Schema 拒绝非法金额：${schemaRejected ? "通过" : "失败"}`);
  console.log(`业务错误码：${notFound.ok ? "缺失" : notFound.error.code}`);
  console.log(
    `模型参数不能代替应用授权：${unauthorized.ok ? "失败" : unauthorized.error.code}`
  );
  console.log(`Agent 工具轨迹：${toolNames.join(" → ")}`);
  console.log(`首次退款申请：${created.ok ? created.data.refundId : "创建失败"}`);
  console.log(`相同幂等键重试：${replay.ok && replay.data.replayed ? "复用原结果" : "重复写入"}`);
  console.log(`实际退款记录数：${gateway.countRefunds()}`);
  console.log("模型 API 调用：0（FakeToolCallingModel）");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
