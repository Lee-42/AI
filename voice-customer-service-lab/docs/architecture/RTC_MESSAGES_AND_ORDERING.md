# RTC messages, subtitles, and ordering

Lesson 10 connects the browser RTC data plane to the conversation UI. It deliberately keeps the
provider wire format at one boundary:

```text
onRoomBinaryMessageReceived
-> validate TLV frame
-> validate provider JSON
-> authenticate assigned Bot and Task
-> order subtitles inside one user + round stream
-> update provider-neutral UI state
```

Raw message bytes and full transcript text are never logged.

## 1. Two kinds of VoiceChat messages

VoiceChat sends both messages through `onRoomBinaryMessageReceived`:

| TLV type | Meaning | Important fields |
| --- | --- | --- |
| `conv` | Agent conversation stage | `TaskId`, `UserID`, `RoundID`, `EventTime`, `Stage` |
| `subv` | User or AI subtitle | `userId`, `roundId`, `sequence`, `text`, `definite`, `paragraph` |

The frame has an 8-byte header:

```text
4 bytes message type
4 bytes payload length, unsigned big-endian
N bytes UTF-8 JSON
```

The decoder requires an exact payload length, valid UTF-8, a known JSON shape, and a maximum
64 KiB frame. Unknown message types are ignored for forward compatibility. Malformed known messages
produce only a stable diagnostic reason; their raw payload is discarded.

Provider references:

- [Realtime subtitles](https://www.volcengine.com/docs/6348/1337284?lang=zh)
- [Get AI state](https://www.volcengine.com/docs/6348/1415216?lang=zh)
- [Web RTC SDK release notes](https://www.volcengine.com/docs/6348/1544162?lang=zh)

## 2. Readiness evidence

`StartVoiceChat` HTTP success means the command was accepted. It does not prove that the Bot joined
the RTC room.

The browser keeps the API snapshot as `dispatched`, then derives the visible `active` state only
when `onUserJoined` contains the exact server-assigned `bot_user_id`. An unrelated remote user
cannot activate the Agent badge.

The reverse rule also applies: an unexpected `onUserLeave` for the assigned Bot is visible as an
error. During an intentional Stop operation, the same leave event is expected and does not create
a false alarm.

## 3. Message authentication inside the room

Being able to send a room message is not enough to control the UI. The client accepts a VoiceChat
message only when:

1. the RTC sender equals the current `bot_user_id`;
2. a `conv` message has the current `task_id` and `bot_user_id`;
3. a subtitle belongs to either the current human `rtc_user_id` or current Bot.

These checks limit stale-task and cross-user contamination. They are not a replacement for the
server callback signature when callbacks are persisted by the backend.

## 4. Subtitle ordering

The provider defines `sequence` as increasing inside one conversation round. Therefore the ordering
key is:

```text
userId + roundId
```

Rules:

1. the first observed sequence establishes the stream baseline, which supports joining mid-round;
2. a sequence below the next expected value is duplicate or late and is ignored;
3. a sequence above the next expected value is buffered;
4. when the missing value arrives, all contiguous buffered items are released in order;
5. streams from different users or rounds are never sorted against each other.

The in-memory buffer is capped at 32 pending events per stream and 128 streams per Session. A
malformed or hostile sender therefore cannot create an unbounded browser-memory queue.

`EventTime` is only used to stop an older `conv` status from rolling the UI backwards. It is not
used to invent a global order across message streams because client clocks, network paths, and
provider stages do not share one reliable total order.

A sequence gap produces a visible warning. A production backend should count
`protocol.sequence_gap` and recover from an authoritative Session snapshot. This lab does not
pretend that a missing subtitle was received.

## 5. Subtitle rendering

`definite=true` means a complete segment. `paragraph=true` means the complete turn is finished.
Only `paragraph=true` should be persisted as a final conversation record.

The current UI follows these rules:

- human ASR partials replace the visible text because recognition may revise earlier words;
- AI fast-subtitle chunks append unless the new value is already a cumulative snapshot;
- a message remains marked as streaming until `paragraph=true`;
- `roundId` keeps the user and AI messages for one turn stable during updates.

The server preserves a configured `SubtitleMode`. If the console Config omits it, the gateway uses
mode `1` for lower-latency subtitles. It always sets `DisableRTSSubtitle=false` and enables
conversation state callbacks for the Agent.

## 6. Cleanup and privacy

Starting a new Session resets the reorder buffer, remote-user set, and realtime UI state. Leaving
RTC clears remote presence but keeps the already-rendered transcript on screen until a new Session.

Transcript payloads can contain personal information. Production logging may include event type,
Task/Session identifiers, byte length, parse reason, and latency, but must not include raw TLV
bytes or full subtitle text.

## 7. Verification

Automated tests use a fake SDK and synthetic TLV frames. They cover:

- strict `subv` and `conv` decoding;
- truncated frame and invalid payload rejection;
- unknown message forward compatibility;
- `1, 3, 2` release as `1, 2, 3`;
- duplicate removal and independent rounds;
- user partial replacement and AI chunk append;
- stale Agent stage rejection;
- Bot presence and decoded message forwarding by the RTC Adapter.

No automated test joins a cloud room or starts a billable Agent.
