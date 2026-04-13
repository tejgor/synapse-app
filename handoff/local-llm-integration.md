# Handoff: On-Device LLM Integration (Qwen3 4B)

## Current State

Synapse now has an opt-in local AI mode using **Qwen3 4B (`Q4_K_M`)** via `llama.rn`.

This replaced the earlier **Qwen2.5 3B Instruct** experiment as the current default local model target.
The reason for the change was not “newer always wins,” but that Qwen3 4B looks like the best next quality experiment for Synapse specifically:
- it is a plausible quality step up from Qwen2.5 3B
- it stays much closer to the current on-device size/runtime envelope than Qwen2.5 7B
- it is distributed as a **single GGUF file**, which avoids the extra complexity of the split-file 7B artifacts

The local flow is split into two phases:
1. **Transcript fetch in background** via backend `POST /api/transcript`
2. **On-device inference in foreground only** via a sequential queue

Cloud processing with Claude Haiku is still intact.

There is also now a **runtime backend switch** in Settings, so the app can switch between production and development API backends without a native rebuild.

---

## Current Model + Runtime Choices

### On-device model
- **Model:** Qwen3 4B
- **Quant:** `Q4_K_M`
- **Download URL:** `https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf`
- **Stored path:** `Paths.document/models/Qwen3-4B-Q4_K_M.gguf`
- **Approx size:** ~2.5 GB
- **Readiness threshold:** >2.3 GB

### Llama context settings
In `src/services/llmContext.ts`:
- `n_ctx: 8192`
- `n_batch: 384`
- `n_threads: 4`
- `n_gpu_layers: 99`

The context is lazy-loaded, reference-shared, and auto-released after 60s idle or when the app backgrounds and inference is not busy.

---

## Architecture

```text
Share Sheet / Manual URL
        |
   capture.tsx
        |
   processEntry(id) -> checks getProcessingMode()
        |
   +--[cloud]---> /api/process -> Supadata + Claude
   |
   +--[local]---> processEntryLocally()
                    |
                    +-- transcript already stored?
                    |     YES -> enqueueLocalInference(id)
                    |     NO  -> background POST /api/transcript
                    |
                    +-- handleBackgroundResult()
                    |     -> store transcript + metadata
                    |     -> if foreground: enqueue inference
                    |     -> if background: set pending for retry
                    |
                    +-- drainInferenceQueue()
                          -> foreground only
                          -> sequential
                          -> single llama.rn context
```

### Why it works this way
- Background network fetches are reliable on iOS with `BackgroundURLSession`
- Background **GPU inference is not reliable** on iPhone
- So transcript fetching happens in background, but local LLM inference is deferred until the app is active

---

## Backend

### `backend/api/transcript.ts`
Transcript-only endpoint used by local mode.
- Input: `{ videoUrl, platform }`
- Returns: `{ videoTranscript, metadata }`
- Uses shared Supadata helpers from `backend/api/supadata.ts`
- Returns `422` on transcript failure, optionally with partial metadata

### `backend/api/server.ts`
**Important:** production server now mounts both:
- `POST /api/process`
- `POST /api/transcript`

This fixes the earlier 404 when local mode was enabled against the deployed backend.

### `backend/api/dev-server.ts`
Also mounts both:
- `POST /api/process`
- `POST /api/transcript`

---

## Frontend Settings / Runtime Config

### `src/services/settings.ts`
Persisted AsyncStorage settings now include:
- `processingMode: 'cloud' | 'local'`
- `modelDownloadState: 'none' | 'downloading' | 'ready'`
- `backendTarget: 'prod' | 'dev'`

### `src/services/backendConfig.ts`
Resolves active backend at runtime from env + stored target.

Supported env vars:
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_API_SECRET`
- `EXPO_PUBLIC_DEV_API_URL`
- `EXPO_PUBLIC_DEV_API_SECRET`

Behavior:
- prod uses `EXPO_PUBLIC_API_URL`
- dev uses `EXPO_PUBLIC_DEV_API_URL`
- if dev is selected but not configured, it falls back to prod

### `app/settings.tsx`
Settings screen now includes:
- Cloud / On-device processing toggle
- Runtime backend switch: **Production / Development**
- Active backend URL preview
- Model download / delete controls
- Updated Qwen3 model info

---

## Local Inference Pipeline

### `src/services/localPrompt.ts`
Current prompt builder is now **raw prompt based**, not `messages` based.

It:
- truncates transcript to 2000 words
- includes metadata hints when available
- includes category/tag reuse hints
- prepends **`/no_think`** for Qwen3
- asks for JSON only
- explicitly forbids reasoning traces / `<think>` output
- emphasizes relevance filtering (focus on genuinely useful claims, ignore filler)
- includes an example JSON object

### Why raw prompt is used
The first Qwen integration used `messages` + auto chat-template/Jinja formatting in `llama.rn`.
That caused a native `std::exception` immediately on `ctx.completion(...)`.

The current implementation avoids that high-risk path by using:
- a single raw `prompt`
- prompt-only generation first
- schema-constrained generation only as a fallback step

### `src/services/localExtraction.ts`
Current extraction flow is a **prompt-based retry ladder**:

1. `prompt-text` — raw prompt, no schema
2. `prompt-text` retry — warmer sampling
3. `prompt-schema` — raw prompt + `response_format: json_schema`

This is intentionally diagnostic and defensive.

Other details:
- schema pass uses stop tokens: `['<|im_end|>', '<|endoftext|>']`
- `extractJSON()` strips `<think>...</think>` blocks before parsing
- `repairJSON()` fallback
- regex field extraction fallback
- `buildSections()` converts `keyPoints` into a single `unordered` section

### Extraction contract
The expected JSON shape is still:
```json
{
  "title": "...",
  "summary": "...",
  "category": "...",
  "tags": ["..."],
  "contentType": "...",
  "keyPoints": ["..."]
}
```

---

## Processing Flow

### `src/services/processing.ts`
Two-phase local mode behavior:

#### `processEntryLocally(entryId)`
- If transcript already exists, queue inference immediately
- Otherwise, hand off `POST /api/transcript` to iOS background request module

#### `handleBackgroundResult(event)`
Handles two result shapes:
- transcript-only result from `/api/transcript`
- full cloud result from `/api/process`

#### Inference queue
- Sequential only
- Single shared llama.rn context
- Pauses if app backgrounds
- Wrapped in background task bookkeeping to maximize chance of finishing current foreground batch cleanly

---

## Key Files

### Frontend
- `src/services/modelManager.ts` — Qwen model URL, filename, readiness threshold
- `src/services/llmContext.ts` — llama.rn lifecycle and tuning
- `src/services/localPrompt.ts` — raw prompt builder for Qwen
- `src/services/localExtraction.ts` — prompt retry ladder, parsing, schema fallback
- `src/services/processing.ts` — local/cloud routing, queue, background result handling
- `src/services/backendConfig.ts` — runtime prod/dev backend selection
- `app/settings.tsx` — backend switch + model controls UI

### Backend
- `backend/api/transcript.ts` — transcript-only endpoint
- `backend/api/supadata.ts` — transcript + metadata helpers
- `backend/api/process.ts` — cloud extraction endpoint
- `backend/api/server.ts` — production routes
- `backend/api/dev-server.ts` — local dev routes

---

## Bugs Encountered / Current Learnings

### 1. Background inference on iPhone is unreliable
**Cause:** Metal GPU work is effectively foreground-only.
**Fix:** Split transcript fetch and inference into separate phases.

### 2. Concurrent local inference crashes
**Cause:** multiple entries competing for one llama.rn context.
**Fix:** sequential inference queue.

### 3. Duplicate model initialization race
**Cause:** two callers loading context simultaneously.
**Fix:** `loadingPromise` lock in `llmContext.ts`.

### 4. Production local mode returned 404
**Cause:** deployed backend exposed `/api/process` but not `/api/transcript`.
**Fix:** mount `/api/transcript` in `backend/api/server.ts`.

### 5. Qwen `messages` path crashed with `std::exception`
**Cause:** most likely `llama.rn` auto chat-template/Jinja formatting for this Qwen GGUF, possibly combined with `json_schema` structured output.
**Fix:** move to raw-prompt inference first, then add schema only as a later fallback attempt.

---

## Known Remaining Issues

1. **No download progress UI**
   - `expo-file-system` v55 `File.downloadFileAsync()` has no progress callback.

2. **Prompt-based fallback is intentionally conservative**
   - The current Qwen flow prioritizes stability over elegance.
   - It uses prompt-text first, then schema later, because that path proved more robust than `messages`.

3. **Extraction quality still needs real-device evaluation**
   - Qwen3 4B is now wired up, but it has not yet won a bakeoff on real Synapse examples.
   - Do not assume “newer generation = definitely better” until it beats Qwen2.5 3B on known weak transcripts.

4. **Transcript truncation may still be a bigger bottleneck than model size**
   - Local prompting still truncates to the first 2000 words.
   - If important context tends to appear later in transcripts, model upgrades alone may not solve relevance problems.

5. **Typed routes still need regeneration**
   - `router.push('/settings' as any)` remains in place.

6. **Model file persists across app updates**
   - No model version migration logic yet.

---

## Suggested Next Steps

1. Run a real-device bakeoff with a fixed set of **5–10 known bad transcripts**:
   - current **Qwen2.5 3B Q4_K_M** local baseline
   - new **Qwen3 4B Q4_K_M** local candidate
   - cloud Claude baseline

2. Measure what matters for Synapse:
   - valid JSON rate
   - parse fallback frequency
   - summary usefulness
   - whether the output captures the actually relevant takeaway
   - category/tag quality
   - latency / model load time
   - crash / memory behavior on target iPhones

3. Evaluate **JSON cleanliness and usefulness**, not just fluency.
   - A more fluent answer is not enough if it is less faithful, less searchable, or harder to parse.

4. If **Qwen3 4B** is clearly better and still stable on-device:
   - keep it as the default local model target

5. If Qwen3 4B is only marginally better:
   - improve prompt/truncation strategy before escalating model size
   - likely next prompt areas: stronger cloud/local prompt parity, better transcript selection than naive first-2000-word truncation

6. Keep the lower-risk fallback in mind:
   - test **Qwen2.5 3B Q5_K_M** or `Q6_K` if Qwen3 behavior is awkward or unstable

7. Only move to **Qwen2.5 7B** if Qwen3 4B is still not good enough.
   - 7B is larger, more operationally annoying, and currently comes as split GGUF artifacts

8. Only after the prompt-based path is stable:
   - reconsider `messages` / template-based inference
   - or test more Qwen3 variants

---

## Env / Dev Notes

Example root `.env`:

```env
EXPO_PUBLIC_API_URL=https://your-production-backend
EXPO_PUBLIC_DEV_API_URL=http://192.168.1.160:3002
```

Optional secrets:

```env
EXPO_PUBLIC_API_SECRET=...
EXPO_PUBLIC_DEV_API_SECRET=...
```

Notes:
- restart Expo/Metro after changing env vars
- on a real iPhone, use your Mac's LAN IP, not `localhost`

---

## Files to Read for Full Context

| File | Why |
|------|-----|
| `src/services/processing.ts` | local/cloud routing, queue, BackgroundURLSession handoff |
| `src/services/llmContext.ts` | model lifecycle and runtime tuning |
| `src/services/localPrompt.ts` | current raw Qwen prompt builder |
| `src/services/localExtraction.ts` | prompt retry ladder, schema fallback, parsing |
| `src/services/modelManager.ts` | download URL, filename, validation |
| `src/services/backendConfig.ts` | runtime backend switching |
| `backend/api/transcript.ts` | transcript-only endpoint |
| `backend/api/server.ts` | production route wiring |
| `backend/api/process.ts` | cloud extraction endpoint |
| `app/settings.tsx` | settings UI for local mode + backend switch |
| `CLAUDE.md` | app architecture and project conventions |
