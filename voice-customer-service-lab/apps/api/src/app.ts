import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ApiErrorResponseSchema,
  HealthResponseSchema,
  PublicRuntimeConfigSchema,
} from "@voice/contracts";
import Fastify from "fastify";

import type { ServerConfig } from "./core/config.js";

export interface BuildAppOptions {
  readonly logger?: boolean;
}

export function buildApp(config: ServerConfig, options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger
      ? {
          level: config.logLevel.toLowerCase(),
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "*.token",
              "*.secret",
              "*.appKey",
              "*.accessKey",
            ],
            censor: "[REDACTED]",
          },
        }
      : false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.register(swagger, {
    openapi: {
      info: {
        title: "Voice Customer Service API",
        version: "0.1.0",
      },
    },
  });

  app.register(cors, {
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "Traceparent"],
  });

  app.register(async (instance) => {
    const routes = instance.withTypeProvider<TypeBoxTypeProvider>();

    routes.get(
      "/healthz",
      {
        schema: {
          operationId: "getHealth",
          tags: ["health"],
          response: {
            200: HealthResponseSchema,
          },
        },
      },
      async () => ({ status: "ok" as const }),
    );

    routes.get(
      "/api/v1/config",
      {
        schema: {
          operationId: "getPublicRuntimeConfig",
          tags: ["public-config"],
          response: {
            200: PublicRuntimeConfigSchema,
            500: ApiErrorResponseSchema,
          },
        },
      },
      async () => ({
        api_version: "v1" as const,
        environment: config.appEnv,
        max_session_seconds: config.maxSessionSeconds,
      }),
    );
  });

  return app;
}
