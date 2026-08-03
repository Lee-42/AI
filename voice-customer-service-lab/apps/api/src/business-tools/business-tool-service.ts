import { createHash } from "node:crypto";

import type { MockBusinessToolCallResponse, OrderStatusToolResult } from "@voice/contracts";
import { z } from "zod";

import type { OrderRecord, OrderRepository } from "./demo-order-repository.js";
import { ORDER_STATUS_TOOL_NAME } from "./order-tool-definition.js";

const orderStatusArgumentsSchema = z
  .object({
    order_reference: z
      .string()
      .trim()
      .min(6)
      .max(32)
      .regex(/^[A-Za-z0-9-]+$/),
  })
  .strict();

export interface BusinessPrincipal {
  readonly tenantId: string;
  readonly customerId: string;
}

export interface BusinessToolInvocation {
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: unknown;
}

export interface BusinessToolServiceOptions {
  readonly orderRepository: OrderRepository;
  // The principal comes from a trusted server-side Session binding, never from model arguments.
  readonly resolvePrincipal: (sessionId: string) => BusinessPrincipal;
}

interface ReplayRecord {
  readonly fingerprint: string;
  readonly result: Promise<MockBusinessToolCallResponse>;
}

export class BusinessToolService {
  readonly #orderRepository: OrderRepository;
  readonly #resolvePrincipal: (sessionId: string) => BusinessPrincipal;
  readonly #replays = new Map<string, ReplayRecord>();

  constructor(options: BusinessToolServiceOptions) {
    this.#orderRepository = options.orderRepository;
    this.#resolvePrincipal = options.resolvePrincipal;
  }

  async invoke(invocation: BusinessToolInvocation): Promise<MockBusinessToolCallResponse> {
    if (invocation.name !== ORDER_STATUS_TOOL_NAME) {
      throw new BusinessToolError(
        "TOOL_NOT_ALLOWED",
        "The requested business tool is not allow-listed.",
        400,
      );
    }

    const parsed = orderStatusArgumentsSchema.safeParse(invocation.arguments);
    if (!parsed.success) {
      throw new BusinessToolError(
        "INVALID_TOOL_ARGUMENTS",
        "The business tool arguments do not match the approved schema.",
        400,
      );
    }

    const replayKey = `${invocation.sessionId}:${invocation.toolCallId}`;
    const fingerprint = createFingerprint(invocation.name, parsed.data);
    const existing = this.#replays.get(replayKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new BusinessToolError(
          "TOOL_CALL_ID_REUSED",
          "The tool call ID was already used with different arguments.",
          409,
        );
      }
      const result = await existing.result;
      return { ...result, replayed: true };
    }

    // Store the in-flight Promise before executing so concurrent callback retries share one execution.
    const result = this.#executeOrderStatus(invocation, parsed.data.order_reference);
    this.#replays.set(replayKey, { fingerprint, result });
    return result;
  }

  async #executeOrderStatus(
    invocation: BusinessToolInvocation,
    orderReference: string,
  ): Promise<MockBusinessToolCallResponse> {
    const principal = this.#resolvePrincipal(invocation.sessionId);
    const order = await this.#orderRepository.findVisibleOrder({
      tenantId: principal.tenantId,
      customerId: principal.customerId,
      orderReference,
    });
    if (!order) {
      // Missing and unauthorized orders deliberately have the same response.
      throw new BusinessToolError(
        "ORDER_NOT_FOUND",
        "No visible order matches the supplied reference.",
        404,
      );
    }

    return {
      tool_call_id: invocation.toolCallId,
      name: ORDER_STATUS_TOOL_NAME,
      replayed: false,
      result: toPublicOrderStatus(order),
    };
  }
}

function createFingerprint(name: string, args: { order_reference: string }): string {
  return createHash("sha256")
    .update(JSON.stringify({ name, order_reference: args.order_reference }))
    .digest("hex");
}

function toPublicOrderStatus(order: OrderRecord): OrderStatusToolResult {
  return {
    order_reference: order.orderReference,
    fulfillment_status: order.fulfillmentStatus,
    status_text: statusText(order.fulfillmentStatus),
    estimated_delivery_date: order.estimatedDeliveryDate,
    latest_event: order.latestEvent,
  };
}

function statusText(status: OrderRecord["fulfillmentStatus"]): string {
  return {
    processing: "正在处理",
    shipped: "已发货",
    delivered: "已送达",
    cancelled: "已取消",
  }[status];
}

export class BusinessToolError extends Error {
  constructor(
    readonly code:
      | "TOOL_NOT_ALLOWED"
      | "INVALID_TOOL_ARGUMENTS"
      | "TOOL_CALL_ID_REUSED"
      | "ORDER_NOT_FOUND"
      | "FUNCTION_CALLBACK_DISABLED"
      | "FUNCTION_CALLBACK_UNAUTHORIZED"
      | "INVALID_PROVIDER_TOOL_MESSAGE",
    message: string,
    readonly statusCode: 400 | 401 | 404 | 409 | 503,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "BusinessToolError";
  }
}

export function toModelToolError(error: BusinessToolError): string {
  const message =
    error.code === "ORDER_NOT_FOUND"
      ? "没有找到当前客户可查询的该订单，请核对订单号或转人工处理。"
      : "工具请求未能安全执行，请核对信息或转人工处理。";
  return JSON.stringify({ ok: false, error: { code: error.code, message } });
}

export function toModelToolResult(result: MockBusinessToolCallResponse): string {
  return JSON.stringify({ ok: true, result: result.result });
}
