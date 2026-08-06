# VAD, endpointing, and conversation turns

Lesson 12 makes turn boundaries explicit. The Provider remains the authority for acoustic VAD and
automatic turn submission; the browser observes normalized evidence and never decides that a loud
audio sample is a valid customer request.

```text
audio activity
-> VAD detects speech and trailing silence
-> endpointing decides this utterance is complete
-> ASR emits the final transcript
-> one round is submitted to the LLM
-> AI emits text and audio
```

These are related stages, not interchangeable events.

## 1. Terms and authority

| Term | Answers | Authority in this project |
| --- | --- | --- |
| Local level meter | Is the microphone receiving energy? | UI hint only |
| VAD | Does this audio region resemble speech? | VoiceChat Provider |
| Endpointing | Has the user probably finished this utterance? | Provider VAD policy |
| ASR final | What final text was recognized? | Provider ASR |
| Round | Which user request and AI response belong together? | Provider/domain `roundId` |

A client-side volume threshold is easily triggered by a keyboard, fan, nearby speaker or automatic
gain control. It may animate a microphone indicator, but it must not create a business turn or call
a tool.

## 2. Effective VoiceChat policy

The gateway applies this baseline to the console-generated `Config`:

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

- An explicit positive `SilenceTime` from the ignored local Config is preserved.
- An explicit boolean `AIVAD` is preserved; otherwise preview semantic endpointing remains off.
- `TurnDetectionMode` is always `0`, because this browser uses Provider-side automatic triggering
  and does not implement the manual input-end command required by mode `1`.
- Invalid object, integer or boolean shapes fail before a paid Start request is sent.

Six hundred milliseconds is a course baseline, not a universal optimum. The current
[StartVoiceChat reference](https://www.volcengine.com/docs/6348/1807452?lang=zh) documents
`SilenceTime`, `AIVAD`, and automatic/manual `TurnDetectionMode`.

Recent Provider releases also describe `ForceBeginThreshold`, `ForceEnd`, and `ExpireTime`. They
are intentionally not injected by default: a newly available field still needs a documented range,
controlled noisy-room testing, rollback criteria, and cost/quality comparison before becoming a
production baseline. See the
[Volcengine RTC release notes](https://www.volcengine.com/docs/6348/1544162?lang=zh).

## 3. Provider-neutral turn tracker

Both paths become the same small signal vocabulary:

```text
Mock domain event ─┐
                   ├─> TurnSignal -> turnLifecycleReducer -> UI
RTC subv / conv ───┘
```

The phases are:

```text
capturing
-> endpointed
-> thinking
-> speaking
-> completed

any active phase -> interrupted / failed
```

For RTC, a user partial subtitle is evidence of `capturing`; a final user paragraph is the best
client-visible endpoint evidence. A `thinking` Provider status can establish the endpoint when the
final subtitle arrives later. The reducer never moves backwards when that late subtitle arrives.

Safeguards:

- Provider status uses `EventTime` to reject stale state in the same round.
- A previous `roundId` cannot reopen after completion.
- A second round cannot silently replace an active round. Lesson 13 permits an explicit
  user-evidenced barge-in only while the AI is thinking or speaking.
- At most 256 round IDs are retained per Session.

## 4. Latency: useful observation versus SLO

The UI shows:

```text
client received endpoint evidence
-> client received first output evidence
```

Both timestamps use `performance.now()`, so subtraction uses one monotonic browser clock. The
result is still only an observation:

- Mock uses simulated `speech.ended` and `ai.audio.started` events.
- RTC uses the final user subtitle or `thinking` status, followed by the first assistant subtitle
  or `speaking` status.
- Neither proves when the Provider made the endpoint decision or when the browser decoded the first
  audible frame.

Therefore the UI calls this value “观察延迟”. SLO-02 requires a server-side endpoint timestamp and a
real first-audio-frame timestamp correlated by Session/Round ID. That instrumentation belongs to
lesson 19.

## 5. Tuning method

Change one parameter at a time and keep the same utterance set:

| Test | Desired outcome | Typical failure |
| --- | --- | --- |
| “查询订单一二三” | One complete round | Silence too short splits it |
| Pause naturally before the order number | Still one round | Endpointing is too aggressive |
| Stop speaking after a short question | Fast response | Silence too long adds latency |
| Fan/keyboard noise without speech | No turn | Noise creates false speech |
| Continuous background conversation | Only target customer triggers | Needs noise/voiceprint controls |

Record at least 30–100 samples per environment before comparing P50/P95. Do not tune from one
successful conversation, and do not compensate for noisy input only by shortening `SilenceTime`.

## 6. Verification

Automated tests remain non-billable and cover:

- baseline injection and preservation of explicit VAD tuning;
- fail-fast invalid Config;
- full Mock phase progression and monotonic latency;
- Provider status before subtitle without phase regression;
- stale and previous-round rejection;
- Provider-specific message mapping at one boundary.

Acoustic VAD quality cannot be proven with text Mock events. A real-device test must separately
cover headset, laptop microphone, phone, quiet room, fan/keyboard noise, and natural mid-sentence
pauses.
