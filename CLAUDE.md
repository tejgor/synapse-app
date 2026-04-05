# Synapse — Codebase Guide

Personal knowledge base. Users share video URLs (TikTok, Instagram Reels, YouTube) from the iOS share sheet or paste them manually. The app uses AI to extract structured knowledge entries — title, summary, category, tags, and key details — stored locally and browsable via search or category filter.

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
Backend env: `backend/.env` — needs `SUPADATA_API_KEY`, `ANTHROPIC_API_KEY`.

---

## Architecture

```
iOS Share Sheet / Manual URL paste
        ↓
   capture.tsx  (platform detection, URL input)
        ↓
  SQLite entry created (status: pending)
        ↓
  src/services/processing.ts  (fire-and-forget, iOS background task)
        ↓
  backend/api/process.ts  (Vercel serverless)
    ├── Supadata API  →  video transcript (returns 422 on failure)
    └── Anthropic Claude Haiku  →  title, summary, category, tags, keyDetails (returns 422 on failure)
        ↓
  SQLite entry updated (status: completed | failed)
        ↓
  entry/[id].tsx  (detail view: title, summary, category, tags, key details, collapsible transcript)
```

After save (share flow): `capture.tsx` calls `router.back()` then `Linking.openURL()` with the source
app's scheme (`tiktok://`, `instagram://`, `youtube://`) to return the user to where they came from.

Retry on app launch + foreground resume: `_layout.tsx` calls `retryFailedEntries()` for any `pending`/`failed`/stale-`processing` entries.

Real-time UI updates: `processing.ts` fires an event via `onProcessingUpdate()` when any entry finishes (success or failure); `useEntries` subscribes and auto-refreshes.

---

## Directory Layout

```
app/                    Expo Router screens (file-based routing)
src/
  components/           Reusable UI components
  constants/            Design tokens (theme.ts)
  db/                   SQLite schema + CRUD (expo-sqlite)
  hooks/                Custom hooks (useEntries)
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
- `_layout.tsx` — Root Stack navigator, ShareIntentProvider, DB init, retry on launch + foreground resume
- `index.tsx` — Library screen: search bar, category filter bar, SectionList of entry cards, FAB. Hero slot is the most recent **completed** entry only. Failed entries show an alert with Retry/Remove instead of navigating to detail. Long-press FAB 5s → dev clear-all dialog.
- `capture.tsx` — Add screen: URL paste, platform detection badge, save button. After save via share sheet, returns user to source app via `Linking.openURL(PLATFORM_SCHEMES[platform])`.
- `entry/[id].tsx` — Detail: title, summary, category tag, tags, key details list, collapsible transcript, source link
- `+native-intent.tsx` — Intercepts `synapse://dataUrl=...` deep links before Expo Router resolves them

### Components (`src/components/`)
- `EntryCard.tsx` — Library list item: category badge, title, summary snippet, tag pills, swipe-to-delete
- `TopicTag.tsx` — Accent pill used as category display and as toggleable filter button
- `TagPill.tsx` — Subtle small pill for displaying tags on detail screen
- `KeyDetailRow.tsx` — Label + value row for key details; auto-links URL values via `Linking.openURL`

### Services (`src/services/`)
- `api.ts` — `POST /api/process` HTTP client; reads `EXPO_PUBLIC_API_URL`; 25s `AbortController` timeout; throws on non-200
- `processing.ts` — Orchestrates entry processing; wraps in iOS background task; fires `onProcessingUpdate()` event on completion/failure; contains `retryFailedEntries()`
- `thumbnail.ts` — Platform detection only: `detectPlatform(url)` → `SourcePlatform | null`

### Data Layer (`src/db/`)
- `schema.ts` — SQLite init, `entries` table DDL, migration for old schema (adds new columns, copies `video_url`→`source_url`)
- `entries.ts` — `createEntry`, `getEntries` (search + category filter), `getEntryById`, `updateEntry`, `deleteEntry`, `getPendingEntries`, `getCategories`, `clearAllEntries`

### Hooks (`src/hooks/`)
- `useEntries.ts` — Fetches entries with optional search text + category filter; subscribes to `onProcessingUpdate` for automatic refresh when processing completes

### Backend (`backend/api/`)
- `process.ts` — The only backend endpoint. Fetches transcript via Supadata, extracts knowledge via Claude Haiku. Returns **422** if transcript fails or is empty, or if Claude returns unparseable JSON — never returns 200 with default/empty data. Structured `[process]` logs at each step. Contains `buildKnowledgePrompt()`, `extractJSON()`
- `dev-server.ts` — Express 5 wrapper, port 3002, 50MB body limit

---

## Tech Stack

- **Framework:** Expo SDK 55, React Native 0.83.2, React 19
- **Routing:** expo-router (file-based), typed routes enabled
- **JS engine:** Hermes, New Architecture (Fabric) enabled
- **Language:** TypeScript ~5.9 (strict), path alias `@/` → project root
- **Database:** expo-sqlite (`synapse.db`, local only, no cloud sync)
- **Gestures:** react-native-gesture-handler + react-native-reanimated
- **Share extension:** expo-share-intent
- **Backend runtime:** Vercel (`@vercel/node@3`), TypeScript via tsx in dev

---

## Backend: AI Pipeline

All AI logic is in `backend/api/process.ts`. Input: `{ videoUrl, platform }`.

| Step | Service | Purpose |
|------|---------|---------|
| 1. Video transcript | Supadata API | YouTube: joins timestamped segments; others: plain text |
| 2. Knowledge extraction | Claude Haiku (`claude-haiku-4-5-20251001`) | Outputs title, summary, category, tags, keyDetails |

Single unified pipeline — no YouTube vs. TikTok/Instagram split. `max_tokens: 1024`.

Both steps are hard failures: if the transcript is empty or the AI response can't be parsed, the endpoint returns 422 and the frontend marks the entry as `failed`. The frontend has a 25s request timeout (`AbortController`) to handle backgrounding — if exceeded, the entry is also marked `failed` and retried on next launch.

---

## Data Model

Defined in `src/types.ts`. SQLite schema in `src/db/schema.ts`.

Key `Entry` fields:
- `source_platform`: `'tiktok' | 'instagram' | 'youtube'`
- `processing_status`: `'pending' | 'processing' | 'completed' | 'failed'`
- `title`: AI-generated concise title
- `summary`: 2-3 sentence core takeaway
- `category`: single primary category string (AI assigns to existing or creates new)
- `tags`: JSON string (`string[]`) — multiple lowercase tags
- `key_details`: JSON string (`KeyDetail[]`) — structured `{label, value}` pairs
- `source_url`: original video link
- `video_transcript`: raw transcript from Supadata

`KeyDetail`: `{ label: string; value: string }` — label is short (1-3 words), value is the detail. URL values are auto-linked in `KeyDetailRow`.

Both `tags` and `key_details` are stored as JSON strings in SQLite — parse with `JSON.parse()` before use.

---

## Conventions

**Styling:** `StyleSheet.create()` only. No CSS-in-JS libraries. All design tokens (colors, spacing, border radii) from `src/constants/theme.ts`. Dark theme forced via `app.json` (`userInterfaceStyle: "dark"`).

**State management:** No Redux/Zustand/Context. Local `useState` in components + SQLite as source of truth. Use `useFocusEffect` to refresh data on screen focus. Processing completion triggers real-time refresh via the `onProcessingUpdate` event emitter in `processing.ts`.

**Routing:** Expo Router file-based. Params via `useLocalSearchParams()`. Modal screens use `animation: 'slide_from_bottom'` in `_layout.tsx`.

**IDs:** `expo-crypto` `randomUUID()` for entry IDs.

---

## Known Constraints

- **No authentication** — backend endpoint is open; no user accounts
- **iOS-focused** — Android config exists but primary dev/testing is iPhone via dev builds
- **No cloud sync** — all data is local SQLite; uninstalling loses all entries
- **Dev builds required** — Expo Go not supported (SDK 55 + native modules)
- **Processing is fire-and-forget** — runs in an iOS background task (~30s budget). If the task is killed mid-flight, the entry stays at `processing` status; `retryFailedEntries()` resets and retries it on next foreground. The 25s client timeout ensures failures surface cleanly rather than hanging indefinitely.
- **Background task singleton** — `modules/background-task/` tracks only one `UIBackgroundTaskIdentifier` at a time; concurrent `retryFailedEntries()` calls can leak identifiers if multiple entries are retried simultaneously
- **App group:** `group.io.synapse.app` — required for share extension ↔ main app communication
- **After removing packages** (`expo-audio`, `expo-haptics`, `react-native-youtube-iframe`, `react-native-webview`), run `npx expo prebuild --clean` to regenerate the native project
