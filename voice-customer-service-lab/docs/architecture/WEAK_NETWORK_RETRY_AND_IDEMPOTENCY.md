# Weak networks, bounded recovery, retries, and idempotency

Lesson 14 treats an uncertain result as different from a failed result. A timeout means the caller
did not receive a result; it does not prove that the server or Provider did nothing.

```text
request sent -> server may create the resource -> response is lost
                                                |
same key retry ---------------------------------+
                                                -> replay the original result
```

Generating a new key after every timeout can create a second Session, Round, or Agent. All
automatic retries therefore keep the original operation scope, idempotency key, and payload.

## 1. RTC recovery belongs to the SDK first

The Web application observes `onConnectionStateChanged` but does not run a parallel `joinRoom`
loop. The Volcengine SDK already reconnects automatically:

- `DISCONNECTED` indicates that the client has not received a server response for about 12 seconds;
- `RECONNECTING` means the SDK's own recovery is active;
- `LOST` follows a longer unsuccessful recovery period; current Web SDK types state that the SDK
  may continue trying.

The UI starts one fixed 25-second application recovery window on the first reconnecting or
disconnected signal. Duplicate callbacks cannot extend the deadline. A connected signal inside the
window restores the UI. Once the window expires, the application performs one bounded cleanup:

```text
Stop Agent (same idempotency key)
-> stop local capture / leave RTC
-> show an explicit failed state
-> allow a later deliberate rejoin
```

This prevents the SDK's internal recovery policy from keeping a billable application Session alive
forever. The current state timing and UI guidance come from Volcengine's
[network connection and disconnection guide](https://www.volcengine.com/docs/6348/95376).

## 2. RTC Token renewal is not rejoin

The SDK emits `onTokenWillExpire` roughly 30 seconds before the room Token expires. The browser asks
the server to re-sign credentials for the original Session, verifies the returned `session_id`, and
calls `engine.updateToken()`.

It does not call `joinRoom` again and does not create another Agent. Concurrent expiry callbacks
share one in-flight refresh Promise. See Volcengine's
[Token authentication guide](https://www.volcengine.com/docs/undefined/70121?lang=zh) and
[Web SDK error reference](https://www.volcengine.com/docs/6348/104480).

## 3. HTTP retry policy

The browser control-plane client uses:

| Rule | Value |
| --- | --- |
| Per-attempt timeout | 10 seconds |
| Maximum attempts | 3 total |
| Backoff | 200ms, 400ms, capped at 1000ms |
| Jitter | 80% through 120% |
| Retryable transport failures | network failure and timeout |
| Retryable HTTP failures | server `retryable=true`, otherwise selected 408/425/429/5xx |
| Never retried | validation, authentication, conflict, and explicit `retryable=false` |

The API's Provider timeout remains 8 seconds, so it normally returns a classified 504 before the
browser's 10-second attempt budget expires. Do not add independent retry loops at every layer; that
multiplies calls and makes the total timeout unpredictable.

## 4. Idempotency semantics

Idempotency identity is:

```text
operation + Session scope + Idempotency-Key + request fingerprint
```

The same identity returns the same logical result without creating another side effect:

| Command | Stable identity |
| --- | --- |
| Create Session | create key |
| Submit Mock turn | Session + turn key + exact text |
| Start Agent | Session + start key; original Task/Bot IDs |
| Stop Agent | Session + stop key; original Task ID |
| End Session | Session + end key |

Reusing a Mock-turn key with different text returns `IDEMPOTENCY_KEY_REUSED` instead of guessing
which intent is correct. Replayed command responses contain the original event IDs and sequence
numbers. A caller that lost the first response can reconstruct state; a caller that already
consumed it drops the duplicate through the existing event-order guard.

Only retryable Agent Start failures may issue another Provider request, and they reuse the original
Task/Bot identity. A non-retryable Provider rejection is replayed as a failure and is never retried.

## 5. Production storage boundary

This course keeps Session and idempotency records in one Node.js process. It demonstrates semantics,
not multi-instance durability. Production storage needs a shared database or Redis record such as:

```text
scope | key | request_hash | state(pending/completed/failed)
response | lease_owner | created_at | expires_at
```

Required properties:

- unique constraint on `scope + key`;
- atomic insert before the side effect;
- request fingerprint conflict detection;
- a short lease for a crashed `pending` owner;
- encrypted or minimized response data and TTL cleanup;
- the completed result committed before acknowledging the client.

Do not silently evict an active Session's key and then accept it as new; that turns memory pressure
into duplicate external work.

## 6. Safe fault-injection exercise

With `VOICE_PROVIDER=mock`, create a Session and use the “弱网故障注入（Mock）” controls:

1. “模拟短暂断线” enters reconnecting and restores before its shortened teaching window.
2. “模拟恢复超时” exhausts the window and runs the same cleanup path once.
3. Submit a Mock turn; unit tests simulate a lost/retryable HTTP response and prove all attempts use
   the same key.
4. Change the text while intentionally reusing a test key; the API rejects the conflict.

The Mock buttons change only local state and never connect to RTC. They prove state-machine and
idempotency behavior, not real packet-loss quality or reconnection success rate.

## 7. Verification coverage

Automated tests cover:

- fixed RTC recovery deadlines and recovery exhaustion;
- Token refresh without a second `joinRoom`;
- bounded HTTP attempts, exponential backoff, jitter, and error classification;
- stable keys across every retry;
- Mock turn response replay and same-key/different-payload rejection;
- retryable versus non-retryable Agent Start behavior;
- identical Task ID across a transient Agent Start retry.
