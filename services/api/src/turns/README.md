# Copilot turns: answer log, audio, fake copilot

Every copilot answer, from the real copilot or the fake one, goes through `ctx.turns` (a `TurnLog`):

| Call | Does |
|---|---|
| `turns.newTurnId()` | `turn_` + a lowercase, time-ordered ULID |
| `turns.saveAudio(turnId, pcm)` | Stores 16-bit mono PCM at 22 050 Hz (ElevenLabs `pcm_22050`) as `audio.wav` |
| `turns.record(response, context)` | Stores the `CopilotResponse` and broadcasts `copilot_turn` to the Director page |

Routes (always on):

- `GET /v1/audio/:turn_id` serves raw PCM, `audio/L16; rate=22050; channels=1`, little-endian (see `x-audio-format`). Add `?format=wav` for a browser.
- `GET /v1/copilot/turns?limit=` and `GET /v1/copilot/turns/:turn_id` serve the log.

## `COPILOT_MODE`

| Value | Meaning |
|---|---|
| `off` (default) | No copilot route |
| `fake` | `fake.ts` answers from the plan with a tone for audio. No keys. For the headset team and the simulations |
| `live` | The real copilot |

**For Rhythm (the real copilot):**
- Register `POST /v1/assemblies/:aid/copilot/query` only when `cfg.copilotMode === "live"`, so it never collides with the fake one.
- Call `saveAudio` before you send the response, then `record`.
- Don't register `GET /v1/audio/:turn_id` again. If you stream ElevenLabs audio as it arrives, extend this route instead.

**Special `scripted_query_id` values in fake mode:**
- `fake_done` answers with a `mark_state` action for the selected part.
- `fake_error` returns 500.
- `fake_slow` waits 10 s, past the headset's 9 s cap.
