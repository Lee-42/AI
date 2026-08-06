import { type Static, Type } from "typebox";

export const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal("ok"),
  },
  {
    $id: "HealthResponse",
    additionalProperties: false,
  },
);
export type HealthResponse = Static<typeof HealthResponseSchema>;

export const PublicRuntimeConfigSchema = Type.Object(
  {
    api_version: Type.Literal("v1"),
    environment: Type.Union([
      Type.Literal("local"),
      Type.Literal("test"),
      Type.Literal("staging"),
      Type.Literal("production"),
    ]),
    max_session_seconds: Type.Integer({ minimum: 60, maximum: 3600 }),
  },
  {
    $id: "PublicRuntimeConfig",
    additionalProperties: false,
  },
);
export type PublicRuntimeConfig = Static<typeof PublicRuntimeConfigSchema>;

export const ApiErrorDetailSchema = Type.Object(
  {
    code: Type.String({ pattern: "^[A-Z][A-Z0-9_]*$" }),
    message: Type.String(),
    retryable: Type.Boolean(),
    correlation_id: Type.String(),
  },
  {
    $id: "ApiErrorDetail",
    additionalProperties: false,
  },
);
export type ApiErrorDetail = Static<typeof ApiErrorDetailSchema>;

export const ApiErrorResponseSchema = Type.Object(
  {
    error: ApiErrorDetailSchema,
  },
  {
    $id: "ApiErrorResponse",
    additionalProperties: false,
  },
);
export type ApiErrorResponse = Static<typeof ApiErrorResponseSchema>;
