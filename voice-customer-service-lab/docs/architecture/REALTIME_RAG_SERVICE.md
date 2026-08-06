# Realtime RAG Service

## Purpose

`RealtimeRagService` is the application boundary between trusted Session scope and transport
adapters. It owns one turn's validation, bounded History, idempotency, safe fallback, memory write
and cleanup. `DefaultAiOrchestrator` remains stateless and owns only Router → Retriever → LLM
coordination.

This lesson connects the service to Mock Voice events, synchronous debug HTTP and debug SSE. It does
not publish RAG audio into a real RTC room.

## Turn boundary

```text
trusted tenant + active session + text + idempotency key
                         │
                         ▼
                RealtimeRagService
       validate → replay/single-flight → read memory
                         │
                         ▼
 System Instruction → bounded History → current QUESTION + EVIDENCE
                         │
                         ▼
       validated AiTurnResponse → one complete memory write
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
        Mock events   debug JSON   debug SSE
```

Tenant, Session, Round and idempotency fields never enter model messages. History is an untrusted aid
for resolving references; only the current turn's allow-listed Evidence can support a policy fact.

## Idempotency and memory lifecycle

The replay key is scoped by `tenantId + sessionId + idempotencyKey`; a SHA-256 fingerprint compares
normalized text without storing it in an error response.

- The in-flight Promise is stored before it is awaited, so concurrent retries share one orchestration
  and one memory write.
- Same key and same text replays the original response and Round ID.
- Same key with different text fails with `RAG_IDEMPOTENCY_KEY_REUSED` before another model call.
- Completed normal and fixed degraded results are replayable. Cancellation is silent and removes the
  incomplete replay record so an explicit retry can start a new turn.
- Only complete answer pairs are offered to memory. Sensitive or oversized pairs are excluded, and
  provider/internal failures are not recorded.
- The first accepted request owns the underlying AbortSignal in this lesson. Waiter-aware shared
  cancellation belongs to the next streaming lesson.

The process-local Map and memory are suitable for the course and a single replica. Production with
multiple replicas needs a distributed single-flight/idempotency store with TTL plus an encrypted,
tenant-scoped memory store; the Port should remain unchanged.

## Adapter responsibilities

| Adapter | Responsibility | Explicit non-responsibility |
| --- | --- | --- |
| Mock Voice | Convert a validated response into normalized user/assistant events | Does not invent an answer or emulate real ASR/TTS latency |
| Debug HTTP | Return the complete response, citations and execution metadata | Disabled outside the local/test debug gate |
| Debug SSE | Emit an early stable Round ID, text chunks and one terminal event | Does not send text or audio through RTC |

The fixed welcome is injected into the Mock Provider and emitted after `session.ready`; it bypasses
Router, Retriever, model and memory. Mock turn event replay remains in the Provider, while model and
memory replay belongs to `RealtimeRagService`.

The SSE route prefetches `stream.started` before committing headers. This keeps synchronous input or
idempotency conflicts as ordinary JSON HTTP errors, while later cancellation becomes exactly one
`stream.cancelled` event.

## Closure, privacy and observability

After Provider Session closure succeeds, `SessionClosureService` calls `clearSession()` for the exact
server-resolved Tenant and Session. Cleanup does not run when Provider closure fails. The clear
operation removes both bounded memory and application replay records; another Tenant with the same
Session ID is unaffected. In-flight records are also marked invalid, so a model response that arrives
after cleanup cannot recreate Session memory.

Logs and inspector output must not contain Prompt bodies, History, Evidence bodies, user text,
fingerprints or credentials. Safe operational fields include policy version, provider names, route
reason, outcome, latency and low-cardinality error code.

## Real RTC handoff

The existing Volcengine AI Agent still owns the real audio/LLM path. The current Mock normalized events
prove the application integration shape only. A later lesson must add verified ASR final input,
interruptible RAG streaming, TTS publication, RTC cancellation and latency budgets before this can be
called a real `ASR → RAG → TTS → RTC` implementation.
