export const ORDER_STATUS_TOOL_NAME = "get_order_status" as const;

export const ORDER_STATUS_TOOL_DEFINITION = Object.freeze({
  type: "function" as const,
  function: {
    name: ORDER_STATUS_TOOL_NAME,
    description:
      "查询当前已登录客户自己的订单履约状态。仅在用户明确提供订单号并询问订单或物流状态时调用；不要猜测订单号，也不要传入客户ID。",
    parameters: {
      type: "object",
      properties: {
        order_reference: {
          type: "string",
          minLength: 6,
          maxLength: 32,
          pattern: "^[A-Za-z0-9-]+$",
          description: "用户明确提供的订单号，例如 DEMO-1001。",
        },
      },
      required: ["order_reference"],
      additionalProperties: false,
    },
  },
});

export const APPROVED_BUSINESS_TOOLS = Object.freeze([ORDER_STATUS_TOOL_DEFINITION]);
