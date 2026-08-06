# Realtime RAG Service Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Mock voice turns, synchronous debug turns and debug SSE through one idempotent, memory-aware `RealtimeRagService` while preserving a provider-neutral future RTC Port.

**Architecture:** `RealtimeRagService` wraps the stateless `DefaultAiOrchestrator`, owns scoped replay and memory lifecycle, and exposes both `answer()` and a streaming-friendly `openTurn()` handle. Transport adapters resolve trusted Session scope and map the shared result into HTTP, SSE or normalized Mock conversation events.

**Tech Stack:** TypeScript 5.9, Node.js 22, Fastify 5, TypeBox, Vitest 4, React 19, pnpm workspace.

## Global Constraints

- Write lesson 02 to `docs/16 项目1：RAG实时接入与质量治理.md` and keep the lesson compact.
- No verification command may call Volcengine, Chroma Cloud, RTC or another paid service.
- Do not publish RAG audio into a real RTC room or trust browser-forwarded RTC subtitles as ASR.
- Default Mock voice, Mock LLM and in-memory knowledge must remain zero-cloud-cost.
- Only current `EVIDENCE` supports policy facts; History remains separate untrusted context.
- Welcome is fixed, versioned and excluded from conversation memory.
- Same scoped idempotency key performs at most one model call and one memory write.
- Sensitive, oversized, failed and cancelled turns are not written as normal memory.
- Cancellation is silent and removes an incomplete replay record.
- Session closure clears both RAG memory and application replay records for that exact Tenant + Session.
- Preserve the dirty worktree, the user's deleted old spec files, and untracked `course2.json`.
- Do not commit or push implementation files until the user requests a checkpoint.

---

## File Structure

### Create

- `voice-customer-service-lab/apps/api/src/ai/realtime-rag-service.ts`: application Port, single-flight replay, memory and fallback lifecycle.
- `voice-customer-service-lab/apps/api/src/ai/create-realtime-rag-service.ts`: one runtime composition root.
- `voice-customer-service-lab/apps/api/src/ai/inspect-realtime-rag-service.ts`: deterministic offline two-turn experiment.
- `voice-customer-service-lab/apps/api/test/realtime-rag-service.test.ts`: service history, replay, fallback, cancellation and cleanup tests.
- `voice-customer-service-lab/apps/api/test/session-closure-service.test.ts`: memory/replay cleanup callback tests.
- `voice-customer-service-lab/docs/architecture/REALTIME_RAG_SERVICE.md`: application and adapter boundary.

### Modify

- `voice-customer-service-lab/apps/api/src/ai/ai-types.ts`: shared Grounded context types and required turn context.
- `voice-customer-service-lab/apps/api/src/ai/ai-ports.ts`: model History field.
- `voice-customer-service-lab/apps/api/src/ai/grounded-prompt-builder.ts`: consume shared context types.
- `voice-customer-service-lab/apps/api/src/ai/default-ai-orchestrator.ts`: forward supplied context.
- `voice-customer-service-lab/apps/api/src/ai/volcengine-ark-language-model.ts`: serialize System, History, then current question/evidence.
- `voice-customer-service-lab/apps/api/src/ai/mock-language-model.ts`: retain History in deterministic calls.
- `voice-customer-service-lab/apps/api/src/ai/create-debug-ai-orchestrator.ts`: expose an ungated reusable Orchestrator factory while preserving the debug guard wrapper.
- `voice-customer-service-lab/apps/api/src/ai/ai-debug-service.ts`: delegate replay to `RealtimeRagTurnPort`.
- `voice-customer-service-lab/apps/api/src/ai/ai-turn-stream-service.ts`: use `openTurn()` and stable Round ID.
- `voice-customer-service-lab/apps/api/src/providers/voice-agent-provider.ts`: carry a validated RAG response into a Mock turn.
- `voice-customer-service-lab/apps/api/src/providers/mock-voice-agent-provider.ts`: fixed welcome and RAG response event mapping.
- `voice-customer-service-lab/apps/api/src/providers/create-voice-agent-provider.ts`: inject the welcome.
- `voice-customer-service-lab/apps/api/src/routes/session-routes.ts`: call RAG before Mock event mapping.
- `voice-customer-service-lab/apps/api/src/routes/ai-debug-routes.ts`: require stream idempotency and use shared service results.
- `voice-customer-service-lab/apps/api/src/session-data/session-closure-service.ts`: call the scoped cleanup hook.
- `voice-customer-service-lab/apps/api/src/app.ts`: assemble one runtime and inject it into every adapter.
- `voice-customer-service-lab/packages/contracts/src/ai.ts`: add completion `policy_version`.
- `voice-customer-service-lab/apps/api/test/ai-orchestrator.test.ts`: Grounded context forwarding.
- `voice-customer-service-lab/apps/api/test/volcengine-ark-language-model.test.ts`: exact Provider message order.
- `voice-customer-service-lab/apps/api/test/mock-voice-agent-provider.test.ts`: welcome and validated response events.
- `voice-customer-service-lab/apps/api/test/ai-debug-api.test.ts`: shared policy version, replay and stream header.
- `voice-customer-service-lab/apps/api/test/ai-turn-stream-service.test.ts`: stable early Round ID and cancellation.
- `voice-customer-service-lab/apps/api/test/voice-journey.e2e.test.ts`: default Mock RAG vertical slice.
- `voice-customer-service-lab/apps/api/package.json`: focused inspect/test scripts.
- `voice-customer-service-lab/package.json`: workspace command delegation.
- `voice-customer-service-lab/README.md`: zero-cost lesson commands and RTC limitation.
- `docs/16 项目1：RAG实时接入与质量治理.md`: lesson 02 teaching material.

Generated by `pnpm contract:generate` after contract changes:

- `voice-customer-service-lab/packages/contracts/openapi/voice-api.v1.json`
- `voice-customer-service-lab/packages/contracts/src/api.generated.ts`

---

### Task 1: Carry bounded History through the stateless Orchestrator

**Files:**

- Modify: `voice-customer-service-lab/apps/api/src/ai/ai-types.ts`
- Modify: `voice-customer-service-lab/apps/api/src/ai/ai-ports.ts`
- Modify: `voice-customer-service-lab/apps/api/src/ai/grounded-prompt-builder.ts`
- Modify: `voice-customer-service-lab/apps/api/src/ai/default-ai-orchestrator.ts`
- Modify: `voice-customer-service-lab/apps/api/src/ai/volcengine-ark-language-model.ts`
- Modify: `voice-customer-service-lab/apps/api/test/ai-orchestrator.test.ts`
- Modify: `voice-customer-service-lab/apps/api/test/volcengine-ark-language-model.test.ts`

**Interfaces:**

```ts
export interface GroundedHistoryMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface GroundedConversationContext {
  readonly systemInstruction: string;
  readonly history: readonly GroundedHistoryMessage[];
}

export interface AiTurnRequest {
  // existing trusted scope, round, locale, text and signal
  readonly groundedContext: GroundedConversationContext;
}

export interface GenerateGroundedAnswerRequest {
  readonly systemInstruction: string;
  readonly history: readonly GroundedHistoryMessage[];
  // existing question, evidence, generation fields and signal
}
```

- [ ] **Step 1: Write failing Orchestrator and Ark serialization assertions**

Add a literal context to the Orchestrator base request:

```ts
groundedContext: {
  systemInstruction: "组合后的系统策略",
  history: [
    { role: "user", content: "上一轮问题" },
    { role: "assistant", content: "上一轮回答" },
  ],
},
```

Assert the Mock model call receives the same context. In the Ark adapter test, add History to the
request and assert exact role order:

```ts
expect(body.messages.map(({ role }: { role: string }) => role)).toEqual([
  "system",
  "user",
  "assistant",
  "user",
]);
expect(body.messages[0].content).toBe("组合后的系统策略");
expect(body.messages[1]).toEqual({ role: "user", content: "上一轮问题" });
expect(body.messages[3].content).toContain("EVIDENCE:");
expect(JSON.stringify(body.messages)).not.toContain("tenant_demo_store");
```

- [ ] **Step 2: Run the focused tests and observe RED**

```bash
cd voice-customer-service-lab
pnpm --filter @voice/api exec vitest run test/ai-orchestrator.test.ts test/volcengine-ark-language-model.test.ts
```

Expected: History assertions fail because the current model request only serializes System and the
current user message.

- [ ] **Step 3: Add the shared types and minimal forwarding**

Move `GroundedHistoryMessage` and `GroundedConversationContext` from
`grounded-prompt-builder.ts` to `ai-types.ts`, then import those types from both the builder and Port.
In `DefaultAiOrchestrator`, replace the policy-only instruction with the trusted request context:

```ts
const generated = await this.#model.generateGroundedAnswer({
  locale: request.locale,
  systemInstruction: request.groundedContext.systemInstruction,
  history: request.groundedContext.history.map((message) => ({ ...message })),
  question: request.text,
  evidence: retrieval.evidence.map(({ sourceId, title, content }) => ({
    sourceId,
    title,
    content,
  })),
  maxOutputTokens: this.#answerPolicy.maxOutputTokens,
  temperature: this.#answerPolicy.temperature,
  topP: this.#answerPolicy.topP,
  ...(request.signal ? { signal: request.signal } : {}),
});
```

In Ark serialization, use:

```ts
messages: [
  { role: "system", content: request.systemInstruction },
  ...request.history.map(({ role, content }) => ({ role, content })),
  { role: "user", content: buildGroundedUserMessage(request) },
],
```

- [ ] **Step 4: Run focused and policy regressions**

```bash
pnpm --filter @voice/api exec vitest run \
  test/ai-orchestrator.test.ts \
  test/volcengine-ark-language-model.test.ts \
  test/realtime-conversation-policy.test.ts
```

Expected: PASS. History remains separate from the current Evidence wrapper.

- [ ] **Step 5: Review the trust boundary**

Run `git diff --check` on Task 1 files. Confirm no model request contains Tenant, Session, Round or
idempotency fields, and non-grounded routes still skip the model.

---

### Task 2: Implement `RealtimeRagService`

**Files:**

- Create: `voice-customer-service-lab/apps/api/src/ai/realtime-rag-service.ts`
- Create: `voice-customer-service-lab/apps/api/test/realtime-rag-service.test.ts`

**Interfaces:**

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
  readonly memoryOutcome: ConversationMemoryWriteOutcome | "not_recorded_failure";
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

```ts
export class RealtimeRagServiceError extends Error {
  readonly code = "RAG_IDEMPOTENCY_KEY_REUSED";
  readonly statusCode = 409;
  readonly retryable = false;
}
```

- [ ] **Step 1: Write failing service behavior tests**

Use real `RealtimeConversationPolicy`, `SessionConversationMemory`, `SafeFallbackPolicy` and a
recording Orchestrator. Cover separate test cases:

```ts
const handle = service.openTurn(command("turn-key-0001", "退货规则是什么？"));
expect(handle.roundId).toMatch(/^rnd_[a-f0-9]{32}$/u);
expect(handle.result).toBeInstanceOf(Promise);
```

- First answer stores one complete pair; the second Orchestrator request receives two History
  messages in order.
- Two concurrent same-key calls share one Orchestrator Promise, return one Round ID, and create one
  memory turn.
- Same key with different normalized text throws `RAG_IDEMPOTENCY_KEY_REUSED`.
- Replay returns `replayed: true` and the original response Round ID.
- Sensitive and oversized pairs report `excluded_sensitive` / `excluded_oversized`.
- Provider unavailable produces `completion: "degraded"`, fixed service text and
  `not_recorded_failure`.
- `AI_TURN_ABORTED` rejects without a spoken result and allows the same key to start again.
- `clearSession(scope)` removes both memory and replay for only that scope.

- [ ] **Step 2: Run the service test and observe RED**

```bash
pnpm --filter @voice/api exec vitest run test/realtime-rag-service.test.ts
```

Expected: FAIL because `realtime-rag-service.ts` does not exist.

- [ ] **Step 3: Implement validation, single-flight and lifecycle**

Store replay records as:

```ts
interface ReplayRecord {
  readonly fingerprint: string;
  readonly roundId: string;
  readonly pending: Promise<Omit<RealtimeRagTurnResult, "replayed">>;
}
```

`openTurn()` normalizes text, validates an 8-128 character `[A-Za-z0-9._:-]+` key, hashes the text,
and creates a scope-safe key using null delimiters. For a new record:

```ts
const roundId = this.#roundIdFactory();
const pending = this.#execute({ ...command, text, roundId }).catch((error) => {
  if (isCancellation(error, command.signal)) this.#replays.delete(replayKey);
  throw error;
});
this.#replays.set(replayKey, { fingerprint, roundId, pending });
return {
  roundId,
  replayed: false,
  result: pending.then((result) => ({ ...result, replayed: false })),
};
```

For an existing record, verify the fingerprint and map its pending result with `replayed: true`.
`answer()` returns `this.openTurn(command).result`.

`#execute()` reads memory, builds Grounded context, calls the Orchestrator, replaces
`execution.policyVersion` with the composite version, then records exactly one completed turn. Catch
exceptions once and use `SafeFallbackPolicy.forFailure()`; rethrow a silent cancellation and construct
this fixed degraded response for a spoken decision:

```ts
{
  sessionId: command.sessionId,
  roundId,
  answerMode: "abstain",
  evidenceStatus: "not_applicable",
  spokenText: decision.spokenText,
  citations: [],
  execution: {
    policyVersion: this.#conversationPolicy.version,
    router: "realtime-rag-service",
    retriever: null,
    model: null,
    routeReason: decision.reason,
    providerRequestId: null,
    modelUsage: null,
  },
}
```

`clearSession()` calls memory clear and deletes every replay key with the exact encoded scope prefix.

- [ ] **Step 4: Run the service test and observe GREEN**

Run the same test. Expected: all history, replay, fallback, cancellation and cleanup cases pass.

- [ ] **Step 5: Mutation review**

Confirm tests fail if Tenant is removed from replay keys, the pending Promise is stored after awaiting,
memory writes happen outside the single-flight Promise, cancellation is mapped to speech, or
`clearSession()` leaves replay entries behind.

---

### Task 3: Add one zero-cost runtime composition root

**Files:**

- Create: `voice-customer-service-lab/apps/api/src/ai/create-realtime-rag-service.ts`
- Modify: `voice-customer-service-lab/apps/api/src/ai/create-debug-ai-orchestrator.ts`
- Modify: `voice-customer-service-lab/apps/api/test/realtime-rag-service.test.ts`

**Interfaces:**

```ts
export function createAiOrchestrator(
  config: ServerConfig,
  answerPolicy?: VersionedRagAnswerPolicy,
): AiOrchestrator;

export function createDebugAiOrchestrator(config: ServerConfig): AiOrchestrator;

export function createRealtimeRagService(
  config: ServerConfig,
  options?: { readonly orchestrator?: AiOrchestrator },
): RealtimeRagService;
```

- [ ] **Step 1: Write failing factory assertions**

Create a service with `APP_ENV=test`, default Mock LLM and debug API disabled. Assert its welcome is
the versioned customer welcome and one public-policy answer completes without cloud configuration.
Also assert `createDebugAiOrchestrator` still rejects when the debug API flag is disabled.

- [ ] **Step 2: Run and observe RED**

```bash
pnpm --filter @voice/api exec vitest run test/realtime-rag-service.test.ts
```

Expected: factory export is missing.

- [ ] **Step 3: Implement the composition root**

Extract the current Orchestrator construction into ungated `createAiOrchestrator`; keep
`createDebugAiOrchestrator` as the guarded wrapper. The RAG factory loads each policy once and builds:

```ts
const customerPolicy = loadCustomerServicePromptPolicy(config.customerServicePolicyPath);
const ragPolicy = loadRagAnswerPolicy(config.ai.answerPolicyPath);
const conversationPolicy = new RealtimeConversationPolicy({ customerPolicy, ragPolicy });
const memory = new SessionConversationMemory({
  maxCompletedTurns: conversationPolicy.memory.max_completed_turns,
  maxTokens: conversationPolicy.memory.max_tokens,
  tokenCounter: new ConservativeTokenCounter(),
  sensitiveDetector: new BasicSensitiveConversationDetector(),
});
return new RealtimeRagService({
  orchestrator: options.orchestrator ?? createAiOrchestrator(config, ragPolicy),
  conversationPolicy,
  memory,
  fallbackPolicy: new SafeFallbackPolicy(ragPolicy),
});
```

- [ ] **Step 4: Run factory and service tests**

Expected: the runtime works with Mock defaults while the local debug guard remains unchanged.

---

### Task 4: Replace hard-coded Mock answers with RAG events

**Files:**

- Modify: `voice-customer-service-lab/apps/api/src/providers/voice-agent-provider.ts`
- Modify: `voice-customer-service-lab/apps/api/src/providers/mock-voice-agent-provider.ts`
- Modify: `voice-customer-service-lab/apps/api/src/providers/create-voice-agent-provider.ts`
- Modify: `voice-customer-service-lab/apps/api/src/routes/session-routes.ts`
- Modify: `voice-customer-service-lab/apps/api/src/app.ts`
- Modify: `voice-customer-service-lab/apps/api/test/mock-voice-agent-provider.test.ts`
- Modify: `voice-customer-service-lab/apps/api/test/voice-journey.e2e.test.ts`

**Interfaces:**

```ts
export interface SubmitMockTurnCommand {
  readonly sessionId: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly answer: AiTurnResponse;
}

export interface MockVoiceAgentProviderOptions {
  readonly sessionTtlSeconds: number;
  readonly welcomeMessage: string;
  // existing clock and idFactory
}
```

- [ ] **Step 1: Write failing Mock Provider tests**

Assert Session creation includes one assistant welcome response sequence after `session.ready`, with
the configured welcome text and no user transcript. Pass a literal `AiTurnResponse` to
`submitMockTurn` and assert:

```ts
expect(aiDelta.payload).toEqual({ text_delta: answer.spokenText, index: 0 });
expect(aiStarted.payload.model_route).toBe("rag/mock-llm");
expect(JSON.stringify(result.events)).not.toContain("这是 Mock 客服回复");
```

Replay must keep the original event IDs and sequence values.

- [ ] **Step 2: Write a failing default App vertical-slice test**

With debug API disabled, create a default Mock Session and POST a Mock public-policy turn. Assert the
assistant transcript contains the synthetic return-policy fact, the Round ID matches the service
response format, and no cloud configuration is required.

- [ ] **Step 3: Run Mock tests and observe RED**

```bash
pnpm --filter @voice/api exec vitest run \
  test/mock-voice-agent-provider.test.ts \
  test/voice-journey.e2e.test.ts
```

Expected: provider options/command do not accept welcome or RAG response and the current canned answer
is observed.

- [ ] **Step 4: Implement Mock event mapping and route orchestration**

Inject the fixed welcome into `MockVoiceAgentProvider`. Emit a provider-owned `rnd_`/`rsp_` assistant
response during Session bootstrap using the existing response-started, transcript-delta,
audio-started and response-completed schemas. Do not pass that welcome through `RealtimeRagService`.

In the Mock route, check `supportsMockTurns()` and active Session first, then call:

```ts
const ragResult = await options.ragService.answer({
  tenantId: options.resolveTenantId(session.session_id),
  sessionId: session.session_id,
  text: request.body.text.trim(),
  idempotencyKey: request.headers["idempotency-key"],
});
const result = await options.provider.submitMockTurn({
  sessionId: session.session_id,
  text: request.body.text.trim(),
  idempotencyKey: request.headers["idempotency-key"],
  correlationId: request.id,
  answer: ragResult.response,
});
```

Use `answer.roundId` for every turn event and remove `createMockAnswer()`.

- [ ] **Step 5: Run Mock unit/E2E and Web transcript regressions**

```bash
pnpm --filter @voice/api exec vitest run \
  test/mock-voice-agent-provider.test.ts \
  test/voice-journey.e2e.test.ts
pnpm --filter @voice/web exec vitest run src/conversation-state.test.ts
```

Expected: fixed welcome and RAG answer render through existing normalized events.

---

### Task 5: Migrate debug HTTP and SSE to the shared service

**Files:**

- Modify: `voice-customer-service-lab/apps/api/src/ai/ai-debug-service.ts`
- Modify: `voice-customer-service-lab/apps/api/src/ai/ai-turn-stream-service.ts`
- Modify: `voice-customer-service-lab/apps/api/src/routes/ai-debug-routes.ts`
- Modify: `voice-customer-service-lab/apps/api/src/app.ts`
- Modify: `voice-customer-service-lab/packages/contracts/src/ai.ts`
- Modify: `voice-customer-service-lab/apps/api/test/ai-debug-api.test.ts`
- Modify: `voice-customer-service-lab/apps/api/test/ai-turn-stream-service.test.ts`
- Generate: `voice-customer-service-lab/packages/contracts/openapi/voice-api.v1.json`
- Generate: `voice-customer-service-lab/packages/contracts/src/api.generated.ts`

**Interfaces:**

- `AiDebugService` consumes `RealtimeRagTurnPort` and returns its response/replay fields without a
  second replay Map.
- `AiStreamTurnCommand` adds required `idempotencyKey: string`.
- `AiTurnStreamService` consumes `RealtimeRagTurnPort` and calls `openTurn()`.
- `answer.completed.payload` adds required `policy_version: string`.

- [ ] **Step 1: Write failing stream service tests**

Use a fake `RealtimeRagTurnPort` whose `openTurn()` immediately returns Round ID
`rnd_stream001` and a deferred result. Assert `stream.started` arrives before resolving the Promise,
every event uses `rnd_stream001`, and completed payload contains `policy_version` and citations.

Retain the AbortSignal test and assert it produces exactly one `stream.cancelled` event and no
`answer.delta`.

- [ ] **Step 2: Write failing debug API tests**

- Debug turn returns the composite customer + RAG policy version.
- Sync replay returns the original Round ID and `command_replayed: true`.
- Debug stream without `Idempotency-Key` returns `400`.
- Debug stream with the header returns ordered events and a composite `policy_version`.
- Same stream key with changed text fails closed before a second model call.

- [ ] **Step 3: Run focused tests and observe RED**

```bash
pnpm --filter @voice/api exec vitest run \
  test/ai-turn-stream-service.test.ts \
  test/ai-debug-api.test.ts
```

Expected: the stream still owns Round IDs, the header is not required, and policy version is absent.

- [ ] **Step 4: Implement the thin adapters**

Replace `AiDebugService` replay logic with one call to `RealtimeRagTurnPort.answer`. In
`AiTurnStreamService.stream()`:

```ts
const handle = this.#ragService.openTurn({
  tenantId: command.tenantId,
  sessionId: command.sessionId,
  text: command.text,
  idempotencyKey: command.idempotencyKey,
  ...(command.signal ? { signal: command.signal } : {}),
});
yield envelope(command.sessionId, handle.roundId, 1, "stream.started", {});
const { response } = await handle.result;
```

Chunk only the validated `response.spokenText`. Add `policy_version` to the final event. Register
`AiDebugTurnHeadersSchema` on the SSE route and pass the key. Map `RealtimeRagServiceError` through the
existing public API error handler without exposing fingerprints or text.

- [ ] **Step 5: Generate contracts and run focused tests**

```bash
pnpm contract:generate
pnpm --filter @voice/api exec vitest run \
  test/ai-turn-stream-service.test.ts \
  test/ai-debug-api.test.ts \
  test/contract-conformance.test.ts
```

Expected: generated OpenAPI/types include stream `policy_version`; focused tests pass.

---

### Task 6: Clear RAG Session state on end and handoff

**Files:**

- Modify: `voice-customer-service-lab/apps/api/src/session-data/session-closure-service.ts`
- Modify: `voice-customer-service-lab/apps/api/src/app.ts`
- Create: `voice-customer-service-lab/apps/api/test/session-closure-service.test.ts`
- Modify: `voice-customer-service-lab/apps/api/test/realtime-rag-service.test.ts`

**Interfaces:**

```ts
export interface SessionClosureServiceOptions {
  // existing dependencies
  readonly onSessionClosed?: (sessionId: string) => void;
}
```

The App callback resolves the Tenant in trusted server code:

```ts
onSessionClosed: (sessionId) =>
  realtimeRagService.clearSession({
    tenantId: resolveTenantId(sessionId),
    sessionId,
  }),
```

- [ ] **Step 1: Write failing closure tests**

Create active Mock sessions and a recording cleanup callback. Assert normal `endSession()` calls it
once after Provider closure, `requestHandoff()` calls it once, and a Provider closure error calls it
zero times. Also assert RAG `clearSession()` allows the same idempotency key to create a new Round in a
test-only still-active scope and does not clear another Tenant.

- [ ] **Step 2: Run and observe RED**

```bash
pnpm --filter @voice/api exec vitest run \
  test/session-closure-service.test.ts \
  test/realtime-rag-service.test.ts
```

Expected: closure options do not accept the hook.

- [ ] **Step 3: Implement post-close cleanup**

Store a default no-op callback. In `#close()`, await Provider end first, then call cleanup with the
returned Session ID and return the Provider result. Do not clear before successful resource closure.
Pass the trusted App callback for both normal end and handoff paths.

- [ ] **Step 4: Run lifecycle and journey regressions**

```bash
pnpm --filter @voice/api exec vitest run \
  test/session-closure-service.test.ts \
  test/realtime-rag-service.test.ts \
  test/voice-journey.e2e.test.ts
```

Expected: Session memory/replay cleanup follows successful Session closure.

---

### Task 7: Add the offline experiment and lesson 02 documentation

**Files:**

- Create: `voice-customer-service-lab/apps/api/src/ai/inspect-realtime-rag-service.ts`
- Modify: `voice-customer-service-lab/apps/api/package.json`
- Modify: `voice-customer-service-lab/package.json`
- Modify: `voice-customer-service-lab/README.md`
- Create: `voice-customer-service-lab/docs/architecture/REALTIME_RAG_SERVICE.md`
- Modify: `docs/16 项目1：RAG实时接入与质量治理.md`

**Commands:**

- `pnpm inspect:realtime-rag-service`
- `pnpm test:realtime-rag-service`

- [ ] **Step 1: Add the deterministic inspector**

Construct real policies, `SessionConversationMemory`, `MockLanguageModel`, the synthetic Retriever,
`DefaultAiOrchestrator` and `RealtimeRagService`. Use the exact questions
`普通商品签收后几天可以申请退货？` and `那质量问题呢？`, then execute:

1. fixed welcome read;
2. first grounded turn;
3. dependent second turn;
4. replay of the second idempotency key;
5. `clearSession()`.

Capture memory before and after cleanup:

```ts
const memoryBeforeClear = memory.read(scope).turns.length;
service.clearSession(scope);
const memoryAfterClear = memory.read(scope).turns.length;
```

Print only:

```ts
{
  mode: "offline-realtime-rag-service",
  cloud_calls: 0,
  policy_version: second.response.execution.policyVersion,
  welcome_message: service.welcomeMessage,
  second_turn_history_messages: model.calls[1]?.history.length ?? 0,
  replayed: replay.replayed,
  stable_round_id: replay.response.roundId === second.response.roundId,
  memory_before_clear: memoryBeforeClear,
  memory_after_clear: memoryAfterClear,
}
```

Do not print full Prompt, History, user text, evidence body or sensitive fixtures.

- [ ] **Step 2: Add scripts and run the focused exercise**

Add these API scripts:

```json
{
  "inspect:realtime-rag-service": "tsx src/ai/inspect-realtime-rag-service.ts",
  "test:realtime-rag-service": "vitest run test/realtime-rag-service.test.ts test/realtime-conversation-policy.test.ts test/conversation-memory.test.ts test/safe-fallback-policy.test.ts test/mock-voice-agent-provider.test.ts test/ai-debug-api.test.ts test/ai-turn-stream-service.test.ts test/session-closure-service.test.ts"
}
```

Root scripts delegate both commands to the API package.

```bash
pnpm inspect:realtime-rag-service
pnpm test:realtime-rag-service
```

Expected: deterministic JSON with `cloud_calls: 0`, two History messages on turn two, stable replay,
and zero memory after clear.

- [ ] **Step 3: Write the architecture reference**

Document the Port, single-flight lifecycle, Grounded message order, Mock/debug/SSE adapters, cleanup,
privacy fields, production distributed-store replacement and the explicit real-RTC non-goal.

- [ ] **Step 4: Append lesson 02 to the requested teaching document**

Mark lesson 02 complete and use six compact parts:

1. Why one RAG Service owns application policy.
2. One turn from trusted Session to validated response.
3. Idempotency, concurrent replay and exactly-once memory.
4. Mock voice, debug HTTP and SSE adapter differences.
5. Offline experiment and expected output.
6. Current limitations and lesson 03 handoff.

Explain that Mock normalized events demonstrate integration shape, not real ASR/TTS/RTC latency.

- [ ] **Step 5: Check docs and links**

```bash
git diff --check -- \
  'docs/16 项目1：RAG实时接入与质量治理.md' \
  voice-customer-service-lab/docs/architecture/REALTIME_RAG_SERVICE.md \
  voice-customer-service-lab/README.md
```

Expected: no whitespace errors and all relative links target real files.

---

### Task 8: Full verification and scope audit

**Files:** Verification only.

- [ ] **Step 1: Run the focused lesson suite**

```bash
cd voice-customer-service-lab
pnpm test:realtime-rag-service
```

Expected: all new and directly affected tests pass with Mock-only dependencies.

- [ ] **Step 2: Regenerate contracts and run all type/tests**

```bash
pnpm contract:generate
pnpm typecheck
pnpm test
```

Expected: contracts, API and Web complete with zero failed tests.

- [ ] **Step 3: Run static checks and production builds**

```bash
pnpm lint
pnpm build
```

Expected: exit 0. The existing Vite large-chunk warning remains informational.

- [ ] **Step 4: Audit final scope**

```bash
git diff --check
git diff --cached --name-only
git status --short
```

Confirm no `.env` or secret is staged, `course2.json` remains untouched/untracked, the user's deleted
old spec files remain deleted, real RTC/paid paths were not invoked, and implementation was not
committed or pushed without a checkpoint request.
