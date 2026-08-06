import { randomBytes } from "node:crypto";

import {
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  type Tracer,
  trace,
} from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
} from "@opentelemetry/semantic-conventions";

export interface HttpTraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly traceFlags: string;
  readonly traceparent: string;
  readonly span: Span;
}

export interface StartHttpTraceInput {
  readonly tracer: Tracer;
  readonly incomingTraceparent: string | undefined;
  readonly operation: string;
  readonly method: string;
  readonly route: string;
  readonly correlationId: string;
  readonly randomHex?: (bytes: number) => string;
}

export function startHttpTrace(input: StartHttpTraceInput): HttpTraceContext {
  const incoming = parseTraceparent(input.incomingTraceparent);
  const parentContext = incoming
    ? trace.setSpanContext(ROOT_CONTEXT, {
        traceId: incoming.traceId,
        spanId: incoming.spanId,
        traceFlags: Number.parseInt(incoming.traceFlags, 16) & TraceFlags.SAMPLED,
        isRemote: true,
      })
    : ROOT_CONTEXT;
  const span = input.tracer.startSpan(
    input.operation,
    {
      kind: SpanKind.SERVER,
      attributes: {
        [ATTR_HTTP_REQUEST_METHOD]: input.method,
        [ATTR_HTTP_ROUTE]: input.route,
        "voice.operation": input.operation,
        "voice.correlation_id": input.correlationId,
      },
    },
    parentContext,
  );
  const generated = span.spanContext();
  const randomHex = input.randomHex ?? ((bytes) => randomBytes(bytes).toString("hex"));
  const traceId = validTraceId(generated.traceId)
    ? generated.traceId
    : (incoming?.traceId ?? randomHex(16));
  const spanId =
    span.isRecording() && validSpanId(generated.spanId) ? generated.spanId : randomHex(8);
  const traceFlags = generated.traceFlags
    ? generated.traceFlags.toString(16).padStart(2, "0")
    : (incoming?.traceFlags ?? "00");

  return {
    traceId,
    spanId,
    parentSpanId: incoming?.spanId ?? null,
    traceFlags,
    traceparent: `00-${traceId}-${spanId}-${traceFlags}`,
    span,
  };
}

export function finishHttpTrace(context: HttpTraceContext, statusCode: number): void {
  context.span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, statusCode);
  if (statusCode >= 500) {
    context.span.setStatus({ code: SpanStatusCode.ERROR });
  }
  context.span.end();
}

export function parseTraceparent(
  value: string | undefined,
): { traceId: string; spanId: string; traceFlags: string } | null {
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/u.exec(value ?? "");
  if (!match) {
    return null;
  }
  const [, traceId = "", spanId = "", traceFlags = ""] = match;
  if (!validTraceId(traceId) || !validSpanId(spanId)) {
    return null;
  }
  return { traceId, spanId, traceFlags };
}

function validTraceId(value: string): boolean {
  return /^[0-9a-f]{32}$/u.test(value) && value !== "0".repeat(32);
}

function validSpanId(value: string): boolean {
  return /^[0-9a-f]{16}$/u.test(value) && value !== "0".repeat(16);
}
