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
  src/services/processing.ts  (fire-and-forget)
        ↓
  backend/api/process.ts  (Vercel serverless)
    ├── Supadata API  →  video transcript (all platforms)
    └── Anthropic Claude Haiku  →  title, summary, category, tags, keyDetails
        ↓
  SQLite entry updated (status: completed)
        ↓
  entry/[id].tsx  (detail view: title, summary, category, tags, key details, collapsible transcript)
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
- `_layout.tsx` — Root Stack navigator, ShareIntentProvider, DB init, retry on launch
- `index.tsx` — Library screen: search bar, category filter bar, FlatList of entry cards, FAB
- `capture.tsx` — Add screen: URL paste, platform detection badge, save button
- `entry/[id].tsx` — Detail: title, summary, category tag, tags, key details list, collapsible transcript, source link
- `+native-intent.tsx` — Intercepts `synapse://dataUrl=...` deep links before Expo Router resolves them

### Components (`src/components/`)
- `EntryCard.tsx` — Library list item: category badge, title, summary snippet, tag pills, swipe-to-delete
- `TopicTag.tsx` — Accent pill used as category display and as toggleable filter button
- `TagPill.tsx` — Subtle small pill for displaying tags on detail screen
- `KeyDetailRow.tsx` — Label + value row for key details; auto-links URL values via `Linking.openURL`

### Services (`src/services/`)
- `api.ts` — `POST /api/process` HTTP client; reads `EXPO_PUBLIC_API_URL`
- `processing.ts` — Orchestrates entry processing end-to-end; contains `retryFailedEntries()`
- `thumbnail.ts` — Platform detection only: `detectPlatform(url)` → `SourcePlatform | null`

### Data Layer (`src/db/`)
- `schema.ts` — SQLite init, `entries` table DDL, migration for old schema (adds new columns, copies `video_url`→`source_url`)
- `entries.ts` — `createEntry`, `getEntries` (search + category filter), `getEntryById`, `updateEntry`, `deleteEntry`, `getPendingEntries`, `getCategories`

### Hooks (`src/hooks/`)
- `useEntries.ts` — Fetches entries with optional search text + category filter

### Backend (`backend/api/`)
- `process.ts` — The only backend endpoint. Fetches transcript via Supadata, extracts knowledge via Claude Haiku. Contains `buildKnowledgePrompt()`, `extractJSON()`
- `dev-server.ts` — Express 5 wrapper, port 3000, 50MB body limit

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

**State management:** No Redux/Zustand/Context. Local `useState` in components + SQLite as source of truth. Use `useFocusEffect` to refresh data on screen focus.

**Routing:** Expo Router file-based. Params via `useLocalSearchParams()`. Modal screens use `animation: 'slide_from_bottom'` in `_layout.tsx`.

**IDs:** `expo-crypto` `randomUUID()` for entry IDs.

---

## Known Constraints

- **No authentication** — backend endpoint is open; no user accounts
- **iOS-focused** — Android config exists but primary dev/testing is iPhone via dev builds
- **No cloud sync** — all data is local SQLite; uninstalling loses all entries
- **Dev builds required** — Expo Go not supported (SDK 55 + native modules)
- **Processing is fire-and-forget** — if the app is backgrounded immediately after capture, processing may not complete; retry runs on next launch
- **App group:** `group.io.synapse.app` — required for share extension ↔ main app communication
- **After removing packages** (`expo-audio`, `expo-haptics`, `react-native-youtube-iframe`, `react-native-webview`), run `npx expo prebuild --clean` to regenerate the native project
