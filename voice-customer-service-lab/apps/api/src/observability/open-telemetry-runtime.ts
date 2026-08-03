import type { Tracer } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

import type { ServerConfig } from "../core/config.js";

export interface OpenTelemetryRuntime {
  readonly configured: boolean;
  readonly tracer: Tracer;
  shutdown(): Promise<void>;
}

export function startOpenTelemetry(config: ServerConfig): OpenTelemetryRuntime {
  const endpoint = config.telemetry.otlpEndpoint;
  if (!endpoint) {
    return {
      configured: false,
      tracer: trace.getTracer("voice-customer-service-api", "0.1.0"),
      shutdown: async () => undefined,
    };
  }

  const exporter = new OTLPTraceExporter({
    url: traceEndpoint(endpoint),
    headers: parseOtlpHeaders(config.telemetry.otlpHeaders?.reveal()),
    timeoutMillis: 5_000,
  });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "voice-customer-service-api",
      [ATTR_SERVICE_VERSION]: "0.1.0",
      "deployment.environment.name": config.appEnv,
    }),
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 512,
        maxExportBatchSize: 128,
        scheduledDelayMillis: 2_000,
        exportTimeoutMillis: 5_000,
      }),
    ],
  });
  provider.register();
  return {
    configured: true,
    tracer: provider.getTracer("voice-customer-service-api", "0.1.0"),
    shutdown: () => provider.shutdown(),
  };
}

export function parseOtlpHeaders(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }
  return Object.fromEntries(
    value.split(",").map((entry) => {
      const separator = entry.indexOf("=");
      if (separator <= 0) {
        throw new Error("OTEL_EXPORTER_OTLP_HEADERS must use comma-separated key=value pairs.");
      }
      const key = decodeURIComponent(entry.slice(0, separator).trim());
      const headerValue = decodeURIComponent(entry.slice(separator + 1).trim());
      if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/u.test(key) || !headerValue) {
        throw new Error("OTEL_EXPORTER_OTLP_HEADERS contains an invalid header.");
      }
      return [key, headerValue];
    }),
  );
}

function traceEndpoint(value: string): string {
  const endpoint = new URL(value);
  if (endpoint.pathname.endsWith("/v1/traces")) {
    return endpoint.toString();
  }
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/u, "")}/v1/traces`;
  return endpoint.toString();
}
