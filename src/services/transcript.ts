import type { SourcePlatform, VideoMetadata } from '../types';

const SUPADATA_API_KEY = process.env.EXPO_PUBLIC_SUPADATA_API_KEY || '';
const TIMEOUT_MS = 90_000;
const RETRY_TIMEOUT_MS = 150_000;

function createAbort(timeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
}

async function fetchTranscriptOnce(
  videoUrl: string,
  isYouTube: boolean,
  timeoutMs: number,
): Promise<string> {
  const endpoint = isYouTube
    ? `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`
    : `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&text=true`;

  const controller = createAbort(timeoutMs);
  const res = await fetch(endpoint, {
    headers: { 'x-api-key': SUPADATA_API_KEY },
    signal: controller.signal,
  });

  if (!res.ok) {
    throw new Error(`Transcript fetch failed (${res.status})`);
  }

  const data = await res.json() as { content: { text: string }[] | string };
  let transcript: string | null = null;

  if (isYouTube && Array.isArray(data.content)) {
    transcript = data.content.map((c: { text: string }) => c.text).join(' ');
  } else if (typeof data.content === 'string') {
    transcript = data.content;
  }

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('No transcript available for this video');
  }

  return transcript;
}

export async function fetchTranscript(
  videoUrl: string,
  platform?: SourcePlatform,
): Promise<string> {
  if (!SUPADATA_API_KEY) {
    throw new Error('Supadata API key not configured for local processing');
  }

  const isYouTube = platform === 'youtube'
    || videoUrl.includes('youtube.com')
    || videoUrl.includes('youtu.be');

  try {
    return await fetchTranscriptOnce(videoUrl, isYouTube, TIMEOUT_MS);
  } catch (err: any) {
    // Retry with longer timeout
    console.log('[transcript] first attempt failed, retrying with longer timeout...');
    return await fetchTranscriptOnce(videoUrl, isYouTube, RETRY_TIMEOUT_MS);
  }
}

export async function fetchMetadata(videoUrl: string): Promise<VideoMetadata | null> {
  if (!SUPADATA_API_KEY) return null;

  try {
    const controller = createAbort(TIMEOUT_MS);
    const res = await fetch(
      `https://api.supadata.ai/v1/metadata?url=${encodeURIComponent(videoUrl)}`,
      { headers: { 'x-api-key': SUPADATA_API_KEY }, signal: controller.signal },
    );

    if (!res.ok) return null;

    const data = await res.json() as {
      title: string | null;
      description: string | null;
      author: { displayName: string; username: string } | null;
      stats: { views: number | null; likes: number | null } | null;
      media: { thumbnailUrl: string; duration: number } | null;
      createdAt: string | null;
    };

    return {
      authorName: data.author?.displayName ?? null,
      authorUsername: data.author?.username ?? null,
      thumbnailUrl: data.media?.thumbnailUrl ?? null,
      duration: data.media?.duration ?? null,
      viewCount: data.stats?.views ?? null,
      likeCount: data.stats?.likes ?? null,
      publishedAt: data.createdAt ?? null,
      description: data.description ?? null,
      originalTitle: data.title ?? null,
    };
  } catch {
    return null;
  }
}
