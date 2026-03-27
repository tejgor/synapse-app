# Synapse — Codebase Guide

Personal learning capture tool. Users share short-form video URLs (TikTok, Instagram Reels, YouTube) from iOS share sheet or paste them manually. The app extracts key learnings or timestamped highlight "supercuts" using AI, stores results locally, and lets users replay or browse them.

See `README.md` for project overview and `DEV_GUIDE.md` for setup instructions.

---

## Quick Start

```bash
# Frontend (Expo dev build on device — Expo Go not supported)
npm start

# Backend (local Vercel dev server)
cd backend && npx tsx api/dev-server.ts
```

Frontend env: root `.env` — set `EXPO_PUBLIC_API_URL` to local IP or Vercel deployment URL.
Backend env: `backend/.env` — needs `SUPADATA_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

---

## Architecture

```
iOS Share Sheet / Manual URL paste
        ↓
   capture.tsx  (thumbnail fetch, voice recording)
        ↓
  SQLite entry created (status: pending)
        ↓
  src/services/processing.ts  (fire-and-forget)
        ↓
  backend/api/process.ts  (Vercel serverless)
    ├── Supadata API  →  video transcript
    ├── OpenAI Whisper  →  voice note transcription (non-YouTube only)
    └── Anthropic Claude  →  key learnings (Haiku) or supercut highlights (Opus)
        ↓
  SQLite entry updated (status: completed)
        ↓
  entry/[id].tsx  (detail view with YouTube player / highlight cards)
```

Retry on app launch: `_layout.tsx` calls `retryFailedEntries()` for any `pending`/`failed` entries.

---

## Directory Layout

```
app/                    Expo Router screens (file-based routing)
src/
  components/           Reusable UI components
  constants/            Design tokens (theme.ts)
  db/                   SQLite schema + CRUD (expo-sqlite)
  hooks/                Custom hooks (useEntries, useRecorder)
  services/             Business logic (api, processing, thumbnail)
  types.ts              All TypeScript interfaces
backend/
  api/process.ts        Vercel serverless function (sole API endpoint)
  api/dev-server.ts     Local Express wrapper for dev
ios/                    Generated native project (expo prebuild, gitignored)
assets/                 Fonts, app icons, splash
```

---

## Key Files

### Screens (`app/`)
- `_layout.tsx` — Root Stack navigator, ShareIntentProvider, DB init, retry on launch
- `index.tsx` — Library screen: searchable/filterable FlatList of entries, swipe-to-delete, FAB
- `capture.tsx` — Capture modal: URL input, thumbnail preview, platform detection, voice recording, save
- `entry/[id].tsx` — Detail: YouTube supercut player, highlight cards, key learnings, transcripts, audio playback
- `+native-intent.tsx` — Intercepts `synapse://dataUrl=...` deep links before Expo Router resolves them

### Components (`src/components/`)
- `EntryCard.tsx` — Library list item with thumbnail, tag, swipe-to-delete (Swipeable)
- `TopicTag.tsx` — Pill tag, used as display and as toggleable filter button
- `HighlightCard.tsx` — YouTube highlight segment: time range, title, summary, active state
- `AudioPlayer.tsx` — Play/pause + progress bar using expo-audio
- `RecordButton.tsx` — Pulsing mic button with animated recording state
- `YouTubePlayer.tsx` — YouTube iframe wrapper with supercut engine (interval-based segment advancing)

### Services (`src/services/`)
- `api.ts` — `POST /api/process` HTTP client; reads `EXPO_PUBLIC_API_URL`
- `processing.ts` — Orchestrates entry processing end-to-end; contains `retryFailedEntries()`
- `thumbnail.ts` — Platform detection, YouTube video ID extraction, thumbnail fetching via oEmbed

### Data Layer (`src/db/`)
- `schema.ts` — SQLite init, `entries` table DDL, inline `highlights` column migration
- `entries.ts` — `createEntry`, `getEntries`, `getEntryById`, `updateEntry`, `deleteEntry`, `getPendingEntries`

### Hooks (`src/hooks/`)
- `useEntries.ts` — Fetches entries with optional search text + tag filter
- `useRecorder.ts` — Audio recording: permissions, haptics, file management, duration tracking

### Backend (`backend/api/`)
- `process.ts` — The only backend endpoint. Contains all AI prompt logic, `extractJSON()`, `snapToNearest()`, `buildYouTubeSystemPrompt()`
- `dev-server.ts` — Express 5 wrapper, port 3000, 50MB body limit

---

## Tech Stack

- **Framework:** Expo SDK 55, React Native 0.83.2, React 19
- **Routing:** expo-router (file-based), typed routes enabled
- **JS engine:** Hermes, New Architecture (Fabric) enabled
- **Language:** TypeScript ~5.9 (strict), path alias `@/` → project root
- **Database:** expo-sqlite (`synapse.db`, local only, no cloud sync)
- **Audio:** expo-audio (recording + playback)
- **Gestures:** react-native-gesture-handler + react-native-reanimated
- **YouTube:** react-native-youtube-iframe + react-native-webview
- **Share extension:** expo-share-intent
- **Backend runtime:** Vercel (`@vercel/node@3`), TypeScript via tsx in dev

---

## Backend: AI Pipeline

All AI logic is in `backend/api/process.ts`. Input: `{ videoUrl, voiceNoteBase64, platform }`.

| Step | Service | Used for |
|------|---------|---------|
| 1. Video transcript | Supadata API | All platforms; YouTube returns timestamped segments |
| 2. Voice transcription | OpenAI Whisper (`whisper-1`) | TikTok/Instagram only (when voice note present) |
| 3. Key learnings | Claude Haiku (`claude-haiku-4-5-20251001`) | TikTok/Instagram: 3–5 bullet learnings + topic tag |
| 3. Supercut highlights | Claude Opus (`claude-opus-4-6`) | YouTube: timestamped highlight ranges + topic tag |

Helper functions in `process.ts`: `extractJSON()` (robust with fallbacks), `snapToNearest()` (aligns AI timestamps to real transcript offsets).

---

## Data Model

Defined in `src/types.ts`. SQLite schema in `src/db/schema.ts`.

Key `Entry` fields:
- `source_platform`: `'tiktok' | 'instagram' | 'youtube'`
- `processing_status`: `'pending' | 'processing' | 'completed' | 'failed'`
- `key_learnings`: JSON string (`string[]`) — TikTok/Instagram only
- `highlights`: JSON string (`TimestampedHighlight[]`) — YouTube only
- `voice_note_path`: local filesystem path to `.m4a` recording
- `video_transcript` / `voice_note_transcript`: raw strings

`TimestampedHighlight`: `{ timestamp, endTimestamp, title, summary }` (timestamps in seconds).

Both `key_learnings` and `highlights` are stored as JSON strings in SQLite — parse with `JSON.parse()` before use.

---

## Conventions

**Styling:** `StyleSheet.create()` only. No CSS-in-JS libraries. All design tokens (colors, spacing, border radii) come from `src/constants/theme.ts`. Dark theme forced via `app.json` (`userInterfaceStyle: "dark"`).

**State management:** No Redux/Zustand/Context. Local `useState` in components + SQLite as source of truth. Use `useFocusEffect` to refresh data on screen focus.

**Routing:** Expo Router file-based. Params passed via `useLocalSearchParams()`. Modal screens use `animation: 'slide_from_bottom'` in `_layout.tsx`.

**IDs:** `expo-crypto` `randomUUID()` for entry IDs.

**File paths:** Voice note recordings stored in `${FileSystem.documentDirectory}recordings/recording-{timestamp}.m4a`.

---

## Platform-Specific Behavior

| | TikTok / Instagram | YouTube |
|--|--|--|
| Transcript source | Supadata plain text | Supadata with timestamps |
| Voice note | Supported, required for learnings | Not supported (hidden in UI) |
| AI model | Claude Haiku | Claude Opus |
| AI output | `keyLearnings[]` + `topicTag` | `highlights[]` + `topicTag` |
| Detail screen | Bullet learnings + audio player | Embedded player + supercut mode |
| Thumbnail | oEmbed API | `img.youtube.com/vi/{id}/hqdefault.jpg` |

---

## Known Constraints

- **No authentication** — backend endpoint is open; client and server trust each other implicitly
- **iOS-focused** — Android config exists but primary dev/testing is iPhone via dev builds
- **No cloud sync** — all data is local SQLite; uninstalling the app loses all entries
- **Dev builds required** — Expo Go not supported (SDK 55 + native modules)
- **Processing is fire-and-forget** — if the app is backgrounded immediately after capture, processing may not complete; retry runs on next launch
- **App group:** `group.io.synapse.app` — required for share extension ↔ main app communication
