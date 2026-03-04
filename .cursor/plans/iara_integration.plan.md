---
name: iara integration
overview: Add iara (fully local realtime voice API) as a LITE brain option alongside OpenAI Realtime. One WebSocket to the orchestrator; send mic PCM, receive TTS PCM and events; pipe to LiveAvatar LITE.
todos: []
isProject: false
---

# iara Integration Plan (LiveAvatar ↔ iara)

## Goal

Expose **iara** as a "realtime voice" option in the LiveAvatar demo, equivalent to **True LITE (OpenAI Realtime)**. When the user selects iara:

- The app connects to the **iara orchestrator** WebSocket (`/api/voice/realtime`) instead of OpenAI Realtime.
- We send **streaming microphone PCM** (16-bit mono, 24 kHz) and receive **streaming TTS PCM** (24 kHz) plus JSON events.
- We forward TTS to LiveAvatar via the same LITE protocol (`agent.speak` / `agent.speak_end`) and use events for listening state (`agent.start_listening` / `agent.stop_listening`).

No change to LiveAvatar’s LITE contract; only the "brain" endpoint and wire format change.

---

## Reference: iara Contract (from integration guide)

- **Endpoint:** `ws(s)://<orchestrator-host>/api/voice/realtime`
- **First message (required):** JSON text frame: `{}` or `{ "sample_rate": 24000, "system_prompt": "...", "instructions": "...", "preset_id": "..." }`
- **Input (after first message):** Binary WebSocket frames = PCM 16-bit LE mono at `sample_rate` (supported: 8000, 16000, 24000, 32000, 48000). We will use **24000** to match LiveAvatar and avoid resampling.
- **Output:**
  - **Text frames:** JSON events: `session_ready`, `user_speech_started`, `user_speech_stopped`, `response_started` (with `event_id`), `response_done` (same `event_id`), `error` (with `message`, optional `code`).
  - **Binary frames:** TTS audio = PCM 16-bit LE, **24 kHz**, mono. Chunks belong to the current `event_id` until `response_done`.
- **Optional:** Send `{"action": "stop"}` to end session cleanly.

---

## 1. Config and secrets

### 1.1 New config keys

| Key                  | Type    | Default | Description                                                                            |
| -------------------- | ------- | ------- | -------------------------------------------------------------------------------------- |
| `USE_IARA`           | boolean | `false` | When true and `IARA_WS_URL` is set, session can start in LITE_IARA mode.               |
| `IARA_WS_URL`        | string  | `""`    | WebSocket URL for iara (e.g. `ws://localhost:7860/api/voice/realtime` or `wss://...`). |
| `IARA_SYSTEM_PROMPT` | string  | `""`    | Optional system prompt / instructions sent in the first JSON message.                  |
| `IARA_PRESET_ID`     | string  | `""`    | Optional preset id for the first JSON message.                                         |

### 1.2 Where to add

- `**apps/demo/app/api/secrets.ts`\*\*: Add to `DEFAULTS`, `Config` type, and to `getConfig()` (file-based config only; no env mapping unless desired). If env is used, add `IARA_WS_URL`, `USE_IARA` to env reads and document in README.
- `**apps/demo/app/api/config/route.ts`\*\*: In validation (e.g. `validateBody`), accept the new keys with correct types.
- **Config page:** New section or subsection under LITE: "iara (local voice)" with toggle `USE_IARA`, URL input `IARA_WS_URL`, optional textarea `IARA_SYSTEM_PROMPT`, optional input `IARA_PRESET_ID`. Help text: link to or paste the iara integration guide snippet (first message, URL, 24 kHz).

---

## 2. Session start and config summary

### 2.1 Mode and priority

- Add mode `**LITE_IARA`\*\* alongside `LITE_TRUE`, `LITE`, `FULL`, `FULL_PTT`.
- **Start mode priority** (first match wins):  
  `fullReady` → FULL / FULL_PTT → `trueLiteReady` → LITE_TRUE → `**iaraReady`\*\* → LITE_IARA → `liteReady` → LITE.

So: if both True LITE and iara are enabled and both have valid config, **True LITE wins**. User must disable True LITE to use iara (or we could add a single "LITE brain" dropdown: OpenAI Realtime | iara; for this plan we keep two toggles and fixed priority).

### 2.2 `iaraReady`

- `iaraReady = config.USE_IARA && avatarId.length > 0 && (config.IARA_WS_URL ?? "").trim().length > 0` and, if the session token is obtained using the API key (e.g. LiveAvatar auth), also require `apiKey.length > 0`. If iara doesn’t use the key and some flows can start a LiveAvatar session without it, omit the apiKey check so LITE_IARA is allowed when USE_IARA, URL, and avatar are set.

### 2.3 Session start route (`apps/demo/app/api/session/start/route.ts`)

- In `getStartMode()`: add branch for `iaraReady` → return `{ mode: "LITE_IARA", error: null }`.
- Add error branch: if `config.USE_IARA` but URL missing → `error: "iara: set WebSocket URL in Settings."`
- **Response body:** When `mode === "LITE_IARA"`, include the WebSocket URL so the client can connect without a separate config request. Example:  
  `{ "session_token": "...", "mode": "LITE_IARA", "iara_ws_url": "ws://localhost:7860/api/voice/realtime" }`  
  Use `config.IARA_WS_URL` (trimmed). If the app is behind a proxy that rewrites hosts, the server could optionally rewrite the URL; for MVP use URL as stored.

### 2.4 Config summary route (`apps/demo/app/api/config/summary/route.ts`)

- Compute `iaraReady` (same as above).
- Extend `liteProvider`: e.g. `"true_lite" | "openai_realtime" | "iara" | null`. When `iaraReady` and we would start LITE_IARA, set `liteProvider = "iara"`.
- Set `startMode = "LITE_IARA"` when `iaraReady` and not `fullReady` and not `trueLiteReady`.
- Return `iaraReady` and optionally `iaraWsUrl` (so the demo can show "iara URL: ..." in status if desired). For session start the client will get the URL from the session start response when mode is LITE_IARA.

---

## 3. Client: new hook `useIaraRealtime`

### 3.1 Location and signature

- **File:** `apps/demo/src/liveavatar/useIaraRealtime.ts` (new).
- **Signature:**  
  `useIaraRealtime(enabled: boolean, sessionRef, sessionState, iaraWsUrl: string)`  
  When `enabled` is false or `iaraWsUrl` is empty, do nothing. When `sessionState !== SessionState.CONNECTED` or `!sessionRef?.current`, do nothing.

### 3.2 Connection and first message

- Connect to `iaraWsUrl` (WebSocket).
- **First message (required):** Send one JSON text frame. Build from config:  
  `{ "sample_rate": 24000, "system_prompt": "<optional from config>", "preset_id": "<optional>" }`  
  Send only `system_prompt` (not both `system_prompt` and `instructions`); iara treats them as aliases, so one is enough and keeps the first message smaller. Config for this will come from the session start response: `iara_ws_url` and optionally `iara_system_prompt`, `iara_preset_id`.
- Wait for `**session_ready`** (or `**error`\*\*). On error, log and optionally surface to user; do not start sending audio until session_ready.

### 3.3 Microphone → iara (binary PCM)

- Reuse the same mic pipeline as True LITE: get stream, `AudioContext` + `ScriptProcessor` (or `AudioWorklet` if we migrate), 24 kHz 16-bit mono.
- **Difference from True LITE:** send **binary** WebSocket frames instead of JSON `input_audio_buffer.append`. So: for each chunk, send `ws.send(ArrayBuffer | Blob)` (raw PCM bytes). No base64 for input; no resampling (we already produce 24 kHz for True LITE).

### 3.4 Server events and TTS → LiveAvatar

- **Text frames:** Parse as JSON; switch on `type`:
  - `session_ready`: set ready flag, start sending mic (if not already).
  - `user_speech_started`: `sessionRef.current?.startListening()` (and pipeline log if desired).
  - `user_speech_stopped`: `sessionRef.current?.stopListening()`.
  - `response_started`: store `event_id`; call `session.stopListening()`; then for each **binary** frame until `response_done`, treat as TTS.
  - `response_done`: flush any remaining buffer for this `event_id`, then `session.sendAgentSpeakEnd(event_id)`; clear current `event_id`.
  - `error`: log and show message/code; optionally close or reconnect.
- **Binary frames:** TTS PCM 24 kHz 16-bit mono. We need to send to LiveAvatar as base64 for `sendAgentSpeakBase64`. So: append bytes to a small buffer for the current `event_id`; when we have a chunk (e.g. ≥ ~100–200 ms or on `response_done`), base64-encode and call `session.sendAgentSpeakBase64(base64, event_id)`. First chunk for a turn creates the event_id on our side (we already have it from `response_started`). Same pattern as True LITE: first chunk → `sendAgentSpeakBase64(buf, undefined)` returns event_id, but here **iara sends event_id** so we use that: `sendAgentSpeakBase64(base64, event_id)` for all chunks, then `sendAgentSpeakEnd(event_id)` on `response_done`.

### 3.5 Keep-alive and cleanup

- Call `sessionRef.current.sendSessionKeepAliveWs()` on a timer (e.g. same 2 min as True LITE).
- **Clean disconnect:** On unmount or before closing the iara WebSocket, send one text frame `{"action": "stop"}`, then close. iara will shut down the session cleanly (stops STT, drains work). Not required for correctness, but nicer for server-side cleanup.
- Then: stop mic, clear buffers and event_id.

### 3.6 Pipeline log (optional but recommended)

- Log connection open/close, first message sent, `session_ready`, `response_started` / `response_done`, `error`, and when sending to LiveAvatar (e.g. "iara → LiveAvatar: agent.speak (chunk)"). Use a dedicated source (e.g. `logIara`) or reuse `logOrchestrator` with a prefix so the Log panel can filter.

---

## 4. Wiring the hook and passing URL/config

### 4.1 Session start response

- When `mode === "LITE_IARA"`, include in the JSON response:
  - `iara_ws_url`: `config.IARA_WS_URL.trim()`
  - Optional: `iara_system_prompt`, `iara_preset_id` (so the client can send them in the first message without a separate config fetch).

### 4.2 Demo state and props

- After session start, when `mode === "LITE_IARA"`, store `iara_ws_url` (and optional `iara_system_prompt`, `iara_preset_id`) from the response in state (or pass through from the session start response into the session component).
- **LiveAvatarSession** props: add optional `iaraWsUrl?: string`, `iaraSystemPrompt?: string`, `iaraPresetId?: string`. When `mode === "LITE_IARA"` and `iaraWsUrl` is set, pass them into the inner component.

### 4.3 LiveAvatarSessionComponent and hook call

- In `LiveAvatarSessionComponent`, call `useIaraRealtime(mode === "LITE_IARA", sessionRef, sessionState, iaraWsUrl ?? "", iaraSystemPrompt, iaraPresetId)`.
- Extend **avatarActionsMode** and **textChatMode**: map `LITE_IARA` → `"LITE"` (same as LITE_TRUE), so existing LITE behavior (interrupt, repeat, start/stop listening, send message) applies.
- **voiceChatConfig:** when `mode === "LITE_IARA"`, pass `false` (we drive voice via iara; no LiveAvatar voice chat).

### 4.4 Status and format labels

- In `LiveAvatarDemo`, extend `formatStartMode` so `LITE_IARA` → e.g. `"Lite (iara)"` or `"iara"`.
- In config summary display, when `liteProvider === "iara"`, show a short label (e.g. "iara (local voice)").

---

## 5. Config page UI

- Under the LITE section (where True LITE and LiveAvatar-managed toggles live), add:
  - **Toggle:** "Use iara (local voice)" bound to `USE_IARA`.
  - When `USE_IARA` is on:
    - **Input:** "iara WebSocket URL" with value `IARA_WS_URL`, placeholder e.g. `ws://localhost:7860/api/voice/realtime`.
    - **Optional:** "System prompt / instructions" (textarea) for `IARA_SYSTEM_PROMPT`.
    - **Optional:** "Preset ID" (text) for `IARA_PRESET_ID`.
  - Help text: "Connect to an iara orchestrator for fully local STT+LLM+TTS. Set the WebSocket URL (e.g. from the iara Config tab). First message sends sample_rate 24000 and optional system_prompt / preset_id."

---

## 6. Type and export updates

- **SessionMode:** add `"LITE_IARA"` in `LiveAvatarDemo.tsx` and anywhere else the type is defined or narrowed (e.g. session start response handling).
- **Config type:** add the new keys in `secrets.ts` and in the config page state type.
- **liveavatar/index.ts:** export `useIaraRealtime` so the session component can import it.

---

## 7. Summary of deliverables

| Item                 | Description                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config / secrets     | `USE_IARA`, `IARA_WS_URL`, `IARA_SYSTEM_PROMPT`, `IARA_PRESET_ID` in defaults, type, and config route.                                                                                            |
| Config summary       | `iaraReady`, `startMode` LITE_IARA, `liteProvider` "iara".                                                                                                                                        |
| Session start        | Branch for `iaraReady`; return `mode: "LITE_IARA"` and `iara_ws_url` (and optional `iara_system_prompt`, `iara_preset_id`) in response.                                                           |
| useIaraRealtime hook | New hook: connect to URL, first JSON message, binary mic PCM 24k, handle events and binary TTS, pipe to LiveAvatar via `sendAgentSpeakBase64` / `sendAgentSpeakEnd`, keep-alive, cleanup.         |
| LiveAvatarSession    | Accept optional `iaraWsUrl`, `iaraSystemPrompt`, `iaraPresetId`; call `useIaraRealtime` when mode is LITE_IARA; map LITE_IARA to LITE for actions/text chat; voiceChatConfig false for LITE_IARA. |
| LiveAvatarDemo       | Handle `LITE_IARA` in resolvedMode from session start; pass iara URL/config into LiveAvatarSession; formatStartMode and status for "iara".                                                        |
| Config page          | Toggle USE_IARA and fields for URL, system prompt, preset id.                                                                                                                                     |

---

## 8. Open points / questions for iara

- **URL in session start:** We return `iara_ws_url` from our backend so the browser can connect. If the demo runs on a different host (e.g. Vercel) and iara runs on localhost, the client cannot reach `ws://localhost:...`. So either the demo is run locally and iara is on the same machine, or a tunnel/proxy is used. No code change needed on iara; just document.
- **First message:** We will send `sample_rate: 24000` and optionally `system_prompt` / `preset_id` from our config. If iara expects different field names (e.g. `instructions` vs `system_prompt`), the integration guide says both are supported; we’ll use the same as in the guide.
- **Errors:** We will handle `type: "error"` and show `message` (and `code`) in the UI or in the pipeline log. No change needed on iara.

---

## 9. Flow summary (sequence)

1. User enables iara in Settings, sets URL (and optionally system prompt / preset id), saves.
2. User clicks Start; app calls `POST /api/session/start`; server returns `mode: "LITE_IARA"`, `session_token`, `iara_ws_url`, and optional `iara_system_prompt`, `iara_preset_id`.
3. App opens LiveAvatar with token and `voiceChatConfig=false`; LiveAvatarSession mounts with `mode === "LITE_IARA"` and `iaraWsUrl` (and optional config).
4. `useIaraRealtime` runs: connects to `iara_ws_url`, sends first JSON message (24000, optional prompt/preset), waits for `session_ready`.
5. Gets mic, sends binary PCM 24 kHz to iara. On `user_speech_started` / `user_speech_stopped`, sends `agent.start_listening` / `agent.stop_listening` to LiveAvatar.
6. On `response_started`, stores `event_id`, sends `agent.stop_listening`; for each binary TTS chunk, base64-encodes and calls `sendAgentSpeakBase64(chunk, event_id)`; on `response_done`, calls `sendAgentSpeakEnd(event_id)`.
7. Keeps session alive with `sendSessionKeepAliveWs()` every 2 min. On disconnect or unmount, closes iara WebSocket and stops mic.

This plan keeps the same LITE avatar contract and adds iara as a drop-in alternative brain with no extra latency (no resampling; binary in, base64 only for LiveAvatar out).
