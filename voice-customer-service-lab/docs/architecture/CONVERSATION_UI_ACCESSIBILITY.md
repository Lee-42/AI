# Conversation UI and accessibility

Lesson 11 turns the diagnostic page into a customer-facing conversation workspace. The baseline is
WCAG 2.2 AA, with 44 CSS pixel targets used for important controls even though the AA minimum is
24 by 24 CSS pixels.

This is an engineering baseline, not a claim of WCAG certification. Automated accessibility scans
and browser end-to-end tests are added in lesson 20; assistive-technology testing still requires
people.

## 1. Customer-first information hierarchy

The main path is intentionally short:

```text
AI and microphone disclosure
-> current conversation state
-> four explicit connection steps
-> live transcript
-> end and cleanup
```

Provider, Room, Task, Bot and Token metadata remain useful for support engineers, but they are
inside a collapsed `details` element. Debug identifiers must not compete with the customer's next
action.

No state depends on colour alone. Every coloured badge and step also includes text such as
“正在加入”, “已授权”, “生成中” or “已完成”.

## 2. Semantic structure

The document declares `lang="zh-CN"` and uses native landmarks, headings, labels, ordered lists,
buttons, form controls and `details`. Native HTML remains the first choice because it already has
keyboard and accessibility behaviour.

Dynamic content uses three different semantics:

| Content | Semantic | Reason |
| --- | --- | --- |
| Conversation history | `role="log"` plus ordered list | New entries form an ordered chat history |
| Non-critical phase update | `role="status"` | Announce changes politely without stealing focus |
| Actionable failure | `role="alert"` | Announce a failure promptly |

The transcript's `role="log"` uses `aria-relevant="additions"`. Streaming text updates therefore do
not cause a screen reader to repeat the message for every character. A separate polite status
region announces a message once when its round becomes final.

References:

- [WAI-ARIA `log` role](https://www.w3.org/TR/wai-aria/#log)
- [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

## 3. Scroll and focus policy

The transcript follows the newest message only while the reader remains within 48 pixels of the
bottom. If the reader scrolls upward:

1. automatic scrolling pauses;
2. incoming messages cannot pull the reading position away;
3. a visible “已暂停跟随，回到最新” button appears;
4. activating it returns to the bottom and moves focus to the scrollable transcript.

The transcript itself is in the keyboard tab order because it is a scrollable region. Users can
then scroll it with arrow, Page Up, Page Down, Home and End keys. Routine status changes never move
focus automatically.

The page also exposes a skip link. Focus indicators use a three-pixel outline and are not hidden
behind sticky UI.

References:

- [WCAG focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [WCAG focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)

## 4. Visual and motion rules

- Normal text is designed for at least 4.5:1 contrast; meaning is not encoded by colour alone.
- Controls have a minimum height of 44 CSS pixels.
- The two-column layout becomes one column below 900 pixels and remains usable from 320 pixels.
- Text wraps instead of forcing horizontal page scrolling.
- `prefers-reduced-motion` disables the pulsing state and streaming-dot animations.
- Forced-colour mode preserves borders for steps and status indicators.

References:

- [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WCAG target size enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- [WCAG animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## 5. Manual acceptance checklist

Use Mock mode for this check; it does not join RTC or start a billable Agent.

1. Navigate from the address bar using only Tab, Shift+Tab, Enter and Space.
2. Confirm the skip link appears on focus and jumps to the conversation workspace.
3. Confirm every focused control has a visible outline and every input has a spoken label.
4. Create a Mock Session and send several turns.
5. Move focus into the transcript and scroll upward; incoming content must not force it down.
6. Activate “回到最新”; focus must remain visible inside the transcript.
7. With a screen reader, confirm final messages are announced once rather than character by
   character.
8. Check 200% zoom, a 320-pixel viewport, reduced motion and operating-system high contrast.

Automated unit tests cover the follow threshold, final-only announcement selection, and the
transcript's semantic HTML. They do not replace keyboard and screen-reader checks.
