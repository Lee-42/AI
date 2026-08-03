import { describe, expect, it, vi } from "vitest";

import {
  BusinessToolError,
  BusinessToolService,
} from "../src/business-tools/business-tool-service.js";
import {
  DemoOrderRepository,
  type OrderRepository,
} from "../src/business-tools/demo-order-repository.js";

const primaryPrincipal = {
  tenantId: "tenant_demo_store",
  customerId: "customer_demo_primary",
};

describe("BusinessToolService", () => {
  it("returns only the allow-listed fields for the session-bound customer", async () => {
    const service = createService(new DemoOrderRepository());

    const response = await service.invoke({
      sessionId: "ses_primary",
      toolCallId: "call_order_001",
      name: "get_order_status",
      arguments: { order_reference: "DEMO-1001" },
    });

    expect(response.result).toEqual({
      order_reference: "DEMO-1001",
      fulfillment_status: "shipped",
      status_text: "已发货",
      estimated_delivery_date: "2026-08-05",
      latest_event: "包裹已从演示分拨中心发出。",
    });
    expect(JSON.stringify(response)).not.toMatch(/address|phone|13800000001/i);
  });

  it("does not reveal whether another customer's order exists", async () => {
    const service = createService(new DemoOrderRepository());

    await expect(
      service.invoke({
        sessionId: "ses_primary",
        toolCallId: "call_order_002",
        name: "get_order_status",
        arguments: { order_reference: "DEMO-9009" },
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });

    await expect(
      service.invoke({
        sessionId: "ses_primary",
        toolCallId: "call_order_003",
        name: "get_order_status",
        arguments: { order_reference: "DEMO-4040" },
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });
  });

  it("shares one execution across concurrent retries and rejects changed arguments", async () => {
    const repository: OrderRepository = {
      findVisibleOrder: vi.fn(
        new DemoOrderRepository().findVisibleOrder.bind(new DemoOrderRepository()),
      ),
    };
    const service = createService(repository);
    const invocation = {
      sessionId: "ses_primary",
      toolCallId: "call_order_004",
      name: "get_order_status",
      arguments: { order_reference: "DEMO-1001" },
    };

    const [first, replay] = await Promise.all([
      service.invoke(invocation),
      service.invoke(invocation),
    ]);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(repository.findVisibleOrder).toHaveBeenCalledTimes(1);

    await expect(
      service.invoke({
        ...invocation,
        arguments: { order_reference: "DEMO-9009" },
      }),
    ).rejects.toMatchObject({ code: "TOOL_CALL_ID_REUSED", statusCode: 409 });
  });

  it("rejects unapproved tools and additional arguments", async () => {
    const service = createService(new DemoOrderRepository());

    await expect(
      service.invoke({
        sessionId: "ses_primary",
        toolCallId: "call_order_005",
        name: "refund_order",
        arguments: { order_reference: "DEMO-1001" },
      }),
    ).rejects.toBeInstanceOf(BusinessToolError);

    await expect(
      service.invoke({
        sessionId: "ses_primary",
        toolCallId: "call_order_006",
        name: "get_order_status",
        arguments: { order_reference: "DEMO-1001", customer_id: "customer_demo_other" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_TOOL_ARGUMENTS" });
  });
});

function createService(orderRepository: OrderRepository) {
  return new BusinessToolService({
    orderRepository,
    resolvePrincipal: () => primaryPrincipal,
  });
}
