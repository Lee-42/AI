# AI Agent lifecycle

## Goal

Lesson 09 adds an explicit, server-controlled lifecycle around Volcengine
`StartVoiceChat` and `StopVoiceChat`:

```text
Browser joined RTC
  -> user explicitly starts Agent
  -> API creates TaskId and Bot UserId
  -> provider accepts StartVoiceChat
  -> Agent is "dispatched", not yet "active"
  -> user/timeout/error requests StopVoiceChat
  -> browser leaves RTC and destroys the engine
```

Starting an Agent and joining RTC are deliberately separate paid-resource
operations.

## HTTP contract

| Command | Endpoint | Idempotency |
| --- | --- | --- |
| Start Agent | `POST /api/v1/sessions/:session_id/agent` | Required header |
| Stop Agent | `DELETE /api/v1/sessions/:session_id/agent` | Required header |
| End Session | `DELETE /api/v1/sessions/:session_id` | Stops Agent first |

The browser never submits `AppId`, `RoomId`, `TaskId`, `BotUserId`, target user
or Provider configuration. The API derives all of them from the server-owned
Session and configuration.

## State model

```text
starting -> dispatched -> active
    |            |          |
    v            v          v
  failed      stopping -> stopped
                   |
                   v
                orphaned -> stopping -> stopped
```

`StartVoiceChat` returning HTTP 200 only changes the local state to
`dispatched`. It means the cloud accepted the task request; it does not prove
the Bot joined RTC or is ready to speak. A signed task callback or RTC remote
user event is required before changing to `active` (lesson 10).

## Stable cloud identity

For each start attempt, the server creates and stores:

- `TaskId`: identifies this VoiceChat task and must be reused by Stop.
- `BotUserId`: globally unique Bot RTC identity under the AppId.
- `RoomId`: copied from the server-owned Session.
- `TargetUserId`: exactly the Session's human RTC user.

`StopVoiceChat` reuses the original `AppId + RoomId + TaskId`. Generating a new
TaskId during cleanup would target a different resource and leak the old one.

## Idempotency and concurrency

The service writes a `starting` record before awaiting the provider:

1. Duplicate start requests share the existing task.
2. A failed start must be retried with its original `Idempotency-Key`.
3. Duplicate stop requests return the same stopped Agent.
4. Stop waits for an in-flight start and then uses the same TaskId.

The lab uses an in-memory map. Production must persist Agent records and
idempotency results in a shared durable store before running multiple API
replicas.

## Three cleanup layers

1. **Explicit stop:** leaving RTC or ending the Session calls Stop first.
2. **Provider idle timeout:** `VOLCENGINE_AGENT_IDLE_TIMEOUT_SECONDS=30` limits
   idle billing if the browser disappears.
3. **Server reaper:** every 15 seconds it checks `deadline_at`; failed cleanup
   becomes `orphaned` and is retried.

Server shutdown also calls the same idempotent stop path. A production reaper
must run from durable state because an in-memory timer cannot recover after a
process or machine crash.

## Provider request boundary

The real adapter sends only:

```text
POST https://rtc.volcengineapi.com/
  ?Action=StartVoiceChat|StopVoiceChat
  &Version=2025-06-01
```

Requests use the official HMAC-SHA256 OpenAPI signing algorithm with
`host;x-content-sha256;x-date`. The implementation uses Node's built-in
`crypto` instead of the broad OpenAPI SDK package: a dependency audit found
known critical/high vulnerabilities in that package's unused transitive
dependencies. A fixed-time golden test protects the local signature
implementation.

The endpoint, region and service name are constants. Upstream error messages,
Authorization, AK/SK and the Voice `Config` body are never logged.

Official references:

- [StartVoiceChat (2025-06-01)](https://www.volcengine.com/docs/6348/2123348)
- [StopVoiceChat (2025-06-01)](https://www.volcengine.com/docs/6348/2123349)
- [Volcengine OpenAPI signature](https://www.volcengine.com/docs/6392/1272450)
- [RTC release notes](https://www.volcengine.com/docs/6348/1544162)

## Safe configuration

The complete evolving provider `Config` is exported from the current
Volcengine console and stored in ignored file:

```text
config/voice-agent.local.json
```

The API owns the identity-bound `AgentConfig`; the browser cannot override it.
Real mode needs all of:

```dotenv
VOICE_PROVIDER=volcengine
VOLCENGINE_PAID_CALLS_ENABLED=true
VOLCENGINE_VOICE_CONFIG_PATH=config/voice-agent.local.json
VOLCENGINE_AGENT_IDLE_TIMEOUT_SECONDS=30
```

Credentials alone never enable paid calls. The checked-in default remains:

```dotenv
VOICE_PROVIDER=mock
VOLCENGINE_PAID_CALLS_ENABLED=false
```

## Local verification

With the safe defaults, create a Session, join RTC and click **启动 AI
Agent（可能计费）**. The returned Agent has provider `mock` and state
`dispatched`, so no cloud Agent or AI Tokens are used.

Automated tests verify:

- duplicate start creates one task;
- Stop reuses the exact RoomId and TaskId;
- deadline cleanup and orphan retry;
- HMAC signature and request body;
- upstream detail redaction;
- HTTP/OpenAPI contracts;
- no known production dependency vulnerabilities.
