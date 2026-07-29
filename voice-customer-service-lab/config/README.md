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
