import { type Static, Type } from "typebox";

const ToolCallIdSchema = Type.String({
  minLength: 6,
  maxLength: 128,
  pattern: "^call_[A-Za-z0-9_-]+$",
});

export const OrderReferenceSchema = Type.String({
  minLength: 6,
  maxLength: 32,
  pattern: "^[A-Za-z0-9-]+$",
});

export const MockBusinessToolCallRequestSchema = Type.Object(
  {
    tool_call_id: ToolCallIdSchema,
    name: Type.Literal("get_order_status"),
    arguments: Type.Object(
      {
        order_reference: OrderReferenceSchema,
      },
      { additionalProperties: false },
    ),
  },
  { $id: "MockBusinessToolCallRequest", additionalProperties: false },
);
export type MockBusinessToolCallRequest = Static<typeof MockBusinessToolCallRequestSchema>;

export const OrderStatusToolResultSchema = Type.Object(
  {
    order_reference: OrderReferenceSchema,
    fulfillment_status: Type.Union([
      Type.Literal("processing"),
      Type.Literal("shipped"),
      Type.Literal("delivered"),
      Type.Literal("cancelled"),
    ]),
    status_text: Type.String({ minLength: 1, maxLength: 80 }),
    estimated_delivery_date: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    latest_event: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { $id: "OrderStatusToolResult", additionalProperties: false },
);
export type OrderStatusToolResult = Static<typeof OrderStatusToolResultSchema>;

export const MockBusinessToolCallResponseSchema = Type.Object(
  {
    tool_call_id: ToolCallIdSchema,
    name: Type.Literal("get_order_status"),
    replayed: Type.Boolean(),
    result: Type.Ref("OrderStatusToolResult"),
  },
  { $id: "MockBusinessToolCallResponse", additionalProperties: false },
);
export type MockBusinessToolCallResponse = Static<typeof MockBusinessToolCallResponseSchema>;

// This casing follows the Volcengine server-side Function Calling callback contract.
export const VolcengineFunctionCallCallbackRequestSchema = Type.Object(
  {
    Message: Type.String({ minLength: 2, maxLength: 32_768 }),
    Signature: Type.String({ minLength: 1, maxLength: 512 }),
    Type: Type.Literal("tool_calls"),
    RoomID: Type.String({ minLength: 1, maxLength: 128 }),
    TaskID: Type.String({ minLength: 1, maxLength: 128 }),
    TaskType: Type.Literal("voiceChat"),
    AppId: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { $id: "VolcengineFunctionCallCallbackRequest", additionalProperties: true },
);
export type VolcengineFunctionCallCallbackRequest = Static<
  typeof VolcengineFunctionCallCallbackRequestSchema
>;

export const FunctionCallCallbackAckSchema = Type.Object(
  {
    accepted: Type.Literal(true),
    tool_call_count: Type.Integer({ minimum: 1, maximum: 4 }),
    replayed_count: Type.Integer({ minimum: 0, maximum: 4 }),
  },
  { $id: "FunctionCallCallbackAck", additionalProperties: false },
);
export type FunctionCallCallbackAck = Static<typeof FunctionCallCallbackAckSchema>;
