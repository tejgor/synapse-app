# Synapse

Bridge the scroll — a personal learning capture tool.

Save short-form videos from TikTok and Instagram Reels, record a voice note of what you learned, and build a searchable library of your learnings enriched with AI-generated key points.

## Getting Started

```bash
# Install dependencies
npm install

# Start the Expo dev server
npx expo start
```

## Architecture

- **Frontend**: Expo (React Native) with expo-router
- **Database**: SQLite via expo-sqlite (local storage)
- **Audio**: expo-av for voice recording/playback
- **Share Intent**: expo-share-intent for receiving shared URLs
- **Backend**: Vercel serverless functions (in `backend/`)

## Configuration

Set `EXPO_PUBLIC_API_URL` in your `.env` to point to your deployed backend.

Optional for runtime switching in Settings:

```env
EXPO_PUBLIC_API_URL=https://your-production-backend
EXPO_PUBLIC_DEV_API_URL=http://192.168.1.160:3002
```

On a real iPhone, use your Mac's LAN IP for `EXPO_PUBLIC_DEV_API_URL` — not `localhost`.

### Backend Environment Variables

```
SUPADATA_API_KEY=     # Video transcript API
OPENAI_API_KEY=       # Whisper voice transcription
ANTHROPIC_API_KEY=    # Claude Haiku for AI summarization
```
