# Barge-in, cancellation, and race handling

Lesson 13 makes interruption a coordinated action rather than a UI state change. When the customer
speaks while the AI is thinking or speaking, the Provider must stop generated audio and the client
must permanently invalidate the old Round and Response.

```text
AI speaking: Round 1 / Response 1
              |
customer speech starts: Round 2
              |
              +-> Provider stops old generation/audio
              +-> client invalidates Round 1 and Response 1
              +-> pending local work loses its generation token
              |
late subtitle/completion for Round 1 -> discarded
Round 2 events                         -> accepted
```

Stopping audio without invalidating data lets a late subtitle or completion event revive the old
answer. Invalidating data without stopping audio leaves the customer talking over the AI. A
production implementation needs both sides.

## 1. Effective Provider policy

The gateway merges this baseline into the ignored local VoiceChat Config:

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

- `InterruptMode=0` enables speech interruption. Mode `1` would ignore speech while the AI talks.
- `InterruptSpeechDuration=300` requires a short stretch of speech before interruption. It leaves
  part of the 500ms product budget for transport and actual playback shutdown.
- An explicitly configured value of `0`, or an integer from 200 through 3000ms, is preserved.
- Optional `InterruptKeywords` are preserved after validation. Adding them changes the policy to
  keyword-only interruption, so this project does not inject any by default.
- Invalid object, duration, or keyword shapes fail before a paid Start request.

The current ranges and keyword behavior come from the
[Volcengine StartVoiceChat reference](https://www.volcengine.com/docs/6348/1807452?lang=zh).
This is a learning baseline, not proof that every microphone and noise environment meets the SLO.

## 2. Three identities prevent stale work

| Identity | Scope | Why it exists |
| --- | --- | --- |
| `roundId` | one customer utterance and its answer | separates an interrupted question from the next question |
| `responseId` | one answer attempt inside a Round | prevents an old retry from overwriting a newer response |
| `generation` | current client cancellation generation | invalidates local asynchronous continuations |

`TurnRaceGuard` runs synchronously before React reducers. It retains bounded tombstones for
invalidated IDs and accepts at most 256 Round IDs plus 256 Response IDs per Session. A generation
token captured before an interruption fails `isCurrent()` afterward, even if its Promise resolves
late.

The acceptance rules are deliberately narrow:

- a different Round may supersede the current Round only while the AI is `thinking` or `speaking`,
  when new user evidence arrives or a Provider status/output proves the new Round already started;
- a different Round during `capturing` or `endpointed` is an overlap error, not a valid barge-in;
- a new Response may supersede an older Response before output starts;
- once speaking begins, a mismatched Response is rejected;
- lower Provider `EventTime`, invalidated IDs, terminal Round events, and identity overflow are
  rejected before transcript or playback state.

## 3. UI behavior

When the guard accepts a new Round as a barge-in:

1. The partial assistant message for the old Round becomes final and visibly says “已打断”.
2. It is not announced by the screen-reader live region as a successfully completed answer.
3. The turn panel switches to the new Round and shows the cumulative interruption count.
4. Old Round subtitles, status updates, completion events, and captured generation tokens are
   ignored.

The old text remains visible because it is useful conversation history. “Cancelled” means it can no
longer mutate the application; it does not mean erasing what the customer already heard.

## 4. Race matrix

| Arrival order | Result |
| --- | --- |
| new user Round, then old assistant delta | new Round accepted; old delta discarded |
| new user Round, then old completion | old completion cannot change UI back to listening |
| Response retry, then old Response audio | retry accepted before speaking; old audio event discarded |
| current Provider event time 300, then 250 | event 250 discarded as stale |
| two user Rounds both still capturing | second rejected as overlapping input |
| Session reset, then an old Promise resolves | old generation token is no longer current |

Do not rely only on arrival order. RTC, WebSocket, HTTP, timers, and React rendering are separate
queues, so production correctness must be identity-based.

## 5. Safe Mock exercise

Keep the non-billable defaults:

```dotenv
VOICE_PROVIDER=mock
VOLCENGINE_PAID_CALLS_ENABLED=false
```

Run API and Web, create a Session, and submit one Mock message. While the UI says “AI 正在思考” or
“AI 正在说话”, submit a second message. Expected result:

- the button reads “发送并打断上一轮”;
- the first assistant message, if already present, reads “已打断”;
- the turn panel advances to Round 2 and reports one interruption;
- the second Round completes normally;
- tests prove synthetic late events from Round 1 do not reappear.

This validates control flow, not acoustic performance. A real-device test must separately measure
from authoritative speech detection to the last audible old frame. Browser receipt of an
`interrupted` state is only an observation and cannot prove the 500ms SLO by itself.

## 6. Automated verification

The non-billable tests cover:

- Provider interruption defaults, override preservation, and invalid Config rejection;
- Round barge-in and Response retry invalidation;
- stale Provider event and overlapping input rejection;
- generation-token invalidation after interruption or Session reset;
- interrupted transcript semantics and accessible status text;
- the guarantee that late old Round output never reaches reducers.
