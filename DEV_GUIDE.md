# Synapse Dev Guide

## Running the Dev Server

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables (optional)

The app runs in **mock mode** by default — no backend or API keys required. Mock mode returns sample data for all AI processing, which is fine for UI development.

To connect to a real backend, create a `.env` file in the project root:

```
EXPO_PUBLIC_API_URL=https://your-vercel-deployment.vercel.app
```

### 3. Start the dev server

```bash
npx expo start
```

Then press:
- `i` — open in iOS Simulator
- `a` — open in Android Emulator
- `w` — open in browser

> **Note:** This project requires a **dev build** — Expo Go will not work. Two reasons: (1) the app uses Expo SDK 55 which Expo Go on the App Store does not yet support, and (2) native modules (`expo-share-intent`, `react-native-webview`, `react-native-youtube-iframe`) are incompatible with Expo Go regardless. Follow the "Creating & Installing a Dev Build on iPhone" section below, or use the iOS Simulator (`npx expo run:ios`).

### Running the backend locally (optional)

The backend is a Vercel serverless function. To run it locally:

```bash
npm install -g vercel
cd backend
vercel dev
```

Set these environment variables in `backend/.env` (or via `vercel env pull`):

```
SUPADATA_API_KEY=...      # Video transcript extraction
OPENAI_API_KEY=...        # Voice note transcription (Whisper)
ANTHROPIC_API_KEY=...     # AI summarization (Claude Haiku)
```

Then set `EXPO_PUBLIC_API_URL=http://localhost:3002` in the root `.env`.

---

## Creating & Installing a Dev Build on iPhone

A dev build is a custom native app that connects to your Metro dev server, giving you hot reload on a real device.

### Prerequisites

- Xcode installed (from the Mac App Store)
- An Apple Developer account (free account works — sign in to Xcode with your Apple ID)
- iPhone plugged in via USB

### Step 1: Add expo-dev-client

```bash
npx expo install expo-dev-client
```

### Step 2: Generate the native iOS project

```bash
npx expo prebuild --platform ios
```

This creates the `ios/` directory with the native Xcode project.

### Step 3: Build and install on your iPhone

```bash
npx expo run:ios --device
```

Expo will detect your plugged-in iPhone, build the app via Xcode, and install it directly. The first build takes a few minutes.

> **Signing:** Xcode will prompt you to select a Team — pick your personal Apple ID. Free accounts work but provisioning profiles expire after **7 days**, after which you re-run `npx expo run:ios --device` to re-sign.

### Step 4: Start the dev server

```bash
npx expo start --dev-client
```

Open the Synapse app on your iPhone — it shows a connection screen. Scan the QR code or enter your Mac's local IP. You now have hot reload on device.

---

### Alternative: EAS cloud builds

If you'd prefer to build in the cloud (no Xcode required on your machine), you can use EAS Build. This requires an Expo account (`eas login`) and ~10–15 min build time. See the [EAS Build docs](https://docs.expo.dev/build/introduction/) for setup.
