export type FulfillmentStatus = "processing" | "shipped" | "delivered" | "cancelled";

export interface OrderRecord {
  readonly tenantId: string;
  readonly customerId: string;
  readonly orderReference: string;
  readonly fulfillmentStatus: FulfillmentStatus;
  readonly estimatedDeliveryDate: string | null;
  readonly latestEvent: string;
  // These fake fields prove that the tool must select an allow-list before returning data.
  readonly shippingAddress: string;
  readonly customerPhone: string;
}

export interface OrderRepository {
  findVisibleOrder(query: {
    tenantId: string;
    customerId: string;
    orderReference: string;
  }): Promise<OrderRecord | null>;
}

const DEMO_ORDERS: readonly OrderRecord[] = [
  {
    tenantId: "tenant_demo_store",
    customerId: "customer_demo_primary",
    orderReference: "DEMO-1001",
    fulfillmentStatus: "shipped",
    estimatedDeliveryDate: "2026-08-05",
    latestEvent: "包裹已从演示分拨中心发出。",
    shippingAddress: "演示地址一号",
    customerPhone: "13800000001",
  },
  {
    tenantId: "tenant_demo_store",
    customerId: "customer_demo_other",
    orderReference: "DEMO-9009",
    fulfillmentStatus: "processing",
    estimatedDeliveryDate: null,
    latestEvent: "订单正在备货。",
    shippingAddress: "演示地址九号",
    customerPhone: "13800000009",
  },
];

export class DemoOrderRepository implements OrderRepository {
  async findVisibleOrder(query: {
    tenantId: string;
    customerId: string;
    orderReference: string;
  }): Promise<OrderRecord | null> {
    // Tenant, customer and order are filtered in one query to prevent object-level authorization gaps.
    return (
      DEMO_ORDERS.find(
        (order) =>
          order.tenantId === query.tenantId &&
          order.customerId === query.customerId &&
          order.orderReference === query.orderReference,
      ) ?? null
    );
  }
}
