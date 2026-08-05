# Realtime RAG Service Vertical Slice Design

**Date:** 2026-08-05
**Status:** Approved for implementation
**Course:** 16 项目 1：RAG 实时接入与质量治理 / 02 RAG Service 接入 Mock、调试 API 与实时语音

## 1. Goal

Create one provider-neutral `RealtimeRagService` that owns turn idempotency, bounded Session
history, Grounded context creation, orchestration, safe degradation and exactly-once memory writes.
The existing Mock voice turn, synchronous debug API and debug SSE stream must call this same
service.

The Mock vertical slice must show the fixed welcome and RAG-backed answers through the existing
normalized conversation events and Web transcript without calling any cloud service. A future RTC
adapter Port is frozen in this lesson, but real `ASR -> RAG -> TTS -> RTC` audio return remains lesson
03 work.

## 2. Non-goals

- Do not publish RAG audio into a real RTC room.
- Do not forward browser-observed RTC subtitles back to the server as trusted ASR.
- Do not implement real token streaming; `AiTurnStreamService` still chunks one validated answer.
- Do not add multi-document spoken citation UX; debug HTTP/SSE retain structured citations.
- Do not add distributed memory or distributed idempotency storage.
- Do not change Tenant identity, order authorization or business-tool boundaries.
- Do not run Volcengine, Chroma Cloud, RTC or other paid calls in lesson verification.

## 3. Chosen architecture

```text
Mock turn route -----------+
Debug turn route ----------+---> RealtimeRagTurnPort
Debug SSE route -----------+              |
Future final-ASR adapter --+              v
                                  RealtimeRagService
                                  - validation
                                  - single-flight idempotency
                                  - Session memory read
                                  - Grounded context
                                  - AiOrchestrator
                                  - safe fallback
                                  - memory write
```

Transport adapters resolve the trusted Tenant and active Session, then pass only a normalized turn
command. They do not build Prompts, select fallbacks or write memory.

### 3.1 Application Port

```ts
export interface RealtimeRagTurnCommand {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
}

export interface RealtimeRagTurnResult {
  readonly response: AiTurnResponse;
  readonly replayed: boolean;
  readonly completion: "answered" | "degraded";
  readonly memoryOutcome:
    | ConversationMemoryWriteOutcome
    | "not_recorded_failure";
}

export interface RealtimeRagTurnHandle {
  readonly roundId: string;
  readonly replayed: boolean;
  readonly result: Promise<RealtimeRagTurnResult>;
}

export interface RealtimeRagTurnPort {
  readonly welcomeMessage: string;
  openTurn(command: RealtimeRagTurnCommand): RealtimeRagTurnHandle;
  answer(command: RealtimeRagTurnCommand): Promise<RealtimeRagTurnResult>;
  clearSession(scope: ConversationMemoryScope): void;
}
```

The future RTC adapter consumes this Port. No RTC-specific type, credential or SDK object enters the
application service.

### 3.2 Component responsibilities

`RealtimeRagService` owns application lifecycle policy. `DefaultAiOrchestrator` remains stateless and
owns route, retrieval, generation and output/citation validation. `SessionConversationMemory` owns
only scoped storage and budget enforcement. `SafeFallbackPolicy` owns only deterministic mapping from
evidence/failure conditions to speak/silent decisions.

This separation prevents the Mock Provider, HTTP routes and SSE writer from becoming alternate RAG
implementations.

## 4. Turn data flow

For a new command:

1. Validate and normalize text, trusted scope and idempotency key.
2. Build a replay key from `tenantId + sessionId + idempotencyKey` and a SHA-256 text fingerprint.
3. `openTurn()` reserves a stable `rnd_<uuid>` Round ID and stores the in-flight Promise before
   awaiting. It returns both immediately so streaming adapters can emit `stream.started` first.
4. Read the bounded Session snapshot.
5. Build System Instruction and separate History messages with `RealtimeConversationPolicy`.
6. Call `DefaultAiOrchestrator` with the current question and trusted Grounded context.
7. Validate model output and citations in the Orchestrator before exposing a response.
8. Replace the execution policy version with the stable customer-policy + RAG-policy composite.
9. Record the complete user/assistant pair once when the response is recordable.
10. Cache and return the completed result.

The welcome is obtained from `RealtimeRagTurnPort.welcomeMessage`. It is emitted by the Mock session
bootstrap and is already supplied to the real Volcengine Agent gateway. It never enters conversation
memory.

## 5. Grounded model context

The internal `AiTurnRequest` gains a required Grounded context. The model Port gains explicit History:

```ts
export interface GenerateGroundedAnswerRequest {
  readonly systemInstruction: string;
  readonly history: readonly GroundedHistoryMessage[];
  readonly question: string;
  readonly evidence: readonly GroundedModelEvidence[];
  // existing generation fields and signal
}
```

The Ark adapter sends messages in this order:

```text
system instruction
bounded user/assistant history
current QUESTION + current EVIDENCE
```

History is never copied into `EVIDENCE`. Tenant ID, Session ID, Round ID and idempotency key never
enter a model request. Non-grounded routes do not call the model.

## 6. Idempotency and concurrency

- Same scoped key and same normalized text share one in-flight/completed result.
- Same scoped key with different text fails closed with `RAG_IDEMPOTENCY_KEY_REUSED`.
- The Round ID, model call, final response and memory write remain stable on replay.
- Completed normal and degraded responses are cached so a lost HTTP response cannot trigger a second
  paid call.
- A cancelled first execution is removed from the replay map because no response or memory side effect
  completed; the caller may retry with the same key.
- The first accepted request owns the underlying AbortSignal in lesson 02. A later duplicate may stop
  waiting without changing the shared result. Waiter-aware multi-subscriber cancellation belongs to
  lesson 03.

The implementation is process-local for the course. Production multi-instance deployment must move
the replay record and memory to a store that supports atomic create-if-absent, TTL and result replay.

## 7. Response, fallback and memory rules

| Outcome | Public behavior | Memory | Idempotency result |
| --- | --- | --- | --- |
| Grounded/fixed successful response | Return validated response | Record unless sensitive/oversized | Cache |
| `none` / `conflicting` / `stale` | Return fixed evidence fallback | Record unless sensitive/oversized | Cache |
| Provider timeout/rate/unavailable | Return fixed service-unavailable response | Do not record | Cache as degraded |
| Auth/rejected/invalid/unknown error | Return fixed service-error response | Do not record | Cache as degraded |
| Cancellation | No spoken fallback; propagate `AI_TURN_ABORTED` | Do not record | Remove |

Degraded responses use `answerMode: "abstain"`, `evidenceStatus: "not_applicable"`, no citations, the
composite policy version and stable low-cardinality route reasons. They never contain an original
exception message or Provider response body.

## 8. Adapter changes

### 8.1 Mock voice

The Mock Session receives the fixed welcome through constructor injection and emits it as normalized
assistant response events during bootstrap. `submitMockTurn` receives a validated RAG response and
maps it to the existing user transcript, assistant transcript and simulated audio events. The current
hard-coded `createMockAnswer()` path is removed.

The Mock Provider keeps its event-level replay map because it owns sequence numbers and event IDs. It
uses the same idempotency key as `RealtimeRagService`; service replay prevents duplicate model/memory
work, while Provider replay prevents duplicate events.

Structured citations remain available on debug HTTP/SSE. Extending normalized RTC conversation events
with multi-document citation UX is lesson 03 scope.

### 8.2 Debug HTTP and SSE

The synchronous route calls `RealtimeRagTurnPort.answer` directly. Existing `AiDebugService` replay
logic is removed or reduced to a transport-only adapter because replay belongs to the application
service.

`AiTurnStreamService` depends on `RealtimeRagTurnPort`, not `AiOrchestrator`. Its command includes the
idempotency key, and the debug SSE route requires the existing debug idempotency header schema. It
calls `openTurn()`, emits `stream.started` with the returned stable Round ID, then awaits the shared
result. It continues to emit typed `answer.delta`, `answer.completed`, `stream.cancelled` and
`stream.failed` frames.

### 8.3 Session cleanup

`SessionClosureService` receives an `onSessionClosed` callback. After Provider session closure succeeds,
normal end and handoff both call `RealtimeRagTurnPort.clearSession` with the server-resolved Tenant and
Session ID. `clearSession` deletes both conversation memory and every application-level idempotency
record for that exact scope. Mock raw replay data, RAG replay data and RAG memory therefore end
together.

Process shutdown drops process-local memory naturally. Durable production memory requires an explicit
TTL/reaper in addition to the close callback.

## 9. Runtime assembly and cost boundary

`buildApp` constructs the policy, memory, Orchestrator and `RealtimeRagService` once. Mock voice turns
use it even when the local-only debug API is disabled. Debug route registration remains gated by
`LLM_DEBUG_API_ENABLED` and local/test environment rules.

Default `LLM_PROVIDER=mock`, in-memory knowledge and Mock voice produce zero cloud calls. Existing
Volcengine paid-call gates remain mandatory; merely constructing the runtime does not issue a request.
The real Volcengine Voice Agent continues its current managed LLM/audio path in this lesson.

## 10. Tests and acceptance

### Unit tests

- A second completed turn sends the first turn as separate user/assistant History messages.
- History never appears inside the current Evidence block or contains trusted scope identifiers.
- Concurrent same-key commands make one model call and one memory write.
- Same key/different text fails closed; a replay keeps the original Round ID.
- `openTurn()` exposes that Round ID before orchestration completes, and SSE uses it for every event.
- Sensitive and oversized pairs return the memory exclusion outcome.
- Evidence fallbacks record; Provider/internal fallbacks do not record.
- Cancellation produces no fallback, no memory and no retained replay entry.
- `clearSession` removes memory and replay records only for the selected Tenant + Session scope.

### Vertical-slice tests

- Mock Session bootstrap emits the fixed versioned welcome.
- A Mock public-policy turn displays the synthetic RAG answer instead of `createMockAnswer()` output.
- Mock event replay preserves event IDs/sequences and does not repeat model work.
- Debug HTTP and SSE expose the same composite policy version and citations.
- SSE disconnect propagates cancellation and produces no memory write.
- Normal end and handoff clear Session memory.
- Contract, type, lint, full test and build gates remain green.

### Offline learning commands

Add `pnpm inspect:realtime-rag-service` and `pnpm test:realtime-rag-service`. The inspector runs a fixed
welcome, two dependent turns, one replay and one Session clear using only deterministic Mock adapters.
It prints counts and stable policy metadata, not full Prompt, raw History or sensitive values.

## 11. Documentation

- Append lesson 02 to `docs/16 项目1：RAG实时接入与质量治理.md` and mark it complete.
- Add `voice-customer-service-lab/docs/architecture/REALTIME_RAG_SERVICE.md`.
- Update the project README with offline commands and an explicit real-RTC non-goal.
- Keep the lesson compact: architecture, one turn flow, idempotency/memory, three entry adapters,
  offline experiment and limitations.
