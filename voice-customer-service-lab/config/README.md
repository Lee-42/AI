# Voice Agent local configuration

`StartVoiceChat` requires the current AI audio/video solution's full `Config` object. Copy it
from the Volcengine console's API integration view into:

```text
config/voice-agent.local.json
```

The file shape is:

```json
{
  "Config": {
    "...": "Paste the complete console-generated Config object here"
  }
}
```

The local file is ignored by Git because it may contain model or provider credentials. The
server supplies `AppId`, `RoomId`, `TaskId`, target user, Bot user and `IdleTimeout`; do not put
those identity-bound fields in this file.

The gateway also guarantees the automatic turn-detection fields required by this client:

```json
{
  "ASRConfig": {
    "VADConfig": {
      "SilenceTime": 600,
      "AIVAD": false
    },
    "TurnDetectionMode": 0
  }
}
```

It also enables speech barge-in:

```json
{
  "InterruptMode": 0,
  "ASRConfig": {
    "InterruptConfig": {
      "InterruptSpeechDuration": 300
    }
  }
}
```

An explicit positive `SilenceTime` and boolean `AIVAD` in the local Config are preserved.
`TurnDetectionMode` is fixed to Provider-side automatic triggering because the Web client does not
send a manual input-end command. Invalid field shapes fail before `StartVoiceChat` is called.

An explicit interruption duration of `0`, or an integer from 200 through 3000 milliseconds, is
preserved. Optional `InterruptKeywords` are also preserved, but they make interruption
keyword-only. See
[`VAD_AND_TURN_DETECTION.md`](../docs/architecture/VAD_AND_TURN_DETECTION.md) and
[`BARGE_IN_CANCELLATION_AND_RACES.md`](../docs/architecture/BARGE_IN_CANCELLATION_AND_RACES.md)
before tuning.

## Versioned customer-service policy

Do not manage the reviewed customer-service Prompt in this ignored local file. The server loads
the non-secret, version-controlled policy from:

```text
config/customer-service-policy.v1.json
```

`CUSTOMER_SERVICE_POLICY_PATH` may select another reviewed file during a staged rollout. At
startup, the server validates and compiles that policy, then replaces `LLMConfig.SystemMessages`,
legacy `UserMessages`, `UserPrompts`, and selected generation settings from the console Config.
Model selection, Endpoint IDs and provider credentials remain local.

The policy file must never contain credentials or real customer data. Its version is returned in
the Agent snapshot for audit and rollback. See
[`PROMPT_POLICY_AND_SAFETY_BOUNDARIES.md`](../docs/architecture/PROMPT_POLICY_AND_SAFETY_BOUNDARIES.md).

## Reviewed business tools

Do not treat `Tools`, `MCP`, `WebSearchAgentConfig` or `FunctionCallingConfig` copied from the
console as approved production capabilities. The gateway removes those fields and, only when
`VOLCENGINE_FUNCTION_CALLING_ENABLED=true`, injects the version-controlled tool catalog plus the
server callback URL and shared callback signature.

The callback must be a public HTTPS endpoint. Its shared signature is a secret and must remain in
the API environment or secret manager; it is never browser configuration. Keep Function Calling
disabled while using the local Mock tool exercise. See
[`BUSINESS_TOOLS_AUTHORIZATION_AND_IDEMPOTENCY.md`](../docs/architecture/BUSINESS_TOOLS_AUTHORIZATION_AND_IDEMPOTENCY.md).

## Session privacy retention

`SESSION_SUMMARY_RETENTION_DAYS` controls the maximum lifetime of the structured Session summary
and demo Handoff ticket. It does not enable raw audio or full-transcript storage. The checked-in
default is 7 days and configuration is bounded to 1–30 days.

The lab uses process memory, so a restart can delete records earlier. Production needs a reviewed
retention purpose, durable TTL enforcement, backup deletion and deletion-failure alerts. See
[`SESSION_DATA_PRIVACY_AND_HANDOFF.md`](../docs/architecture/SESSION_DATA_PRIVACY_AND_HANDOFF.md).

## Observability and local SLO window

`OBSERVABILITY_WINDOW_SECONDS` controls only the in-memory rolling SLO exercise. It defaults to one
hour and is bounded to 60–86400 seconds. Prometheus counters remain cumulative for the process
lifetime; they must not decrease when the SLO window advances. Production should calculate an
approved long rolling window in a durable metrics backend.

Leaving `OTEL_EXPORTER_OTLP_ENDPOINT` empty disables all external Trace export. When configured,
the API sends batched server spans over OTLP/HTTP and appends `/v1/traces` to a base endpoint.
`OTEL_EXPORTER_OTLP_HEADERS` uses comma-separated, URL-encoded `key=value` pairs and is always a
server secret. See [`OBSERVABILITY_AND_SLO.md`](../docs/architecture/OBSERVABILITY_AND_SLO.md).
