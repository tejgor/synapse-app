import type { Request, Response } from 'express';

export interface VideoMetadata {
  authorName: string | null;
  authorUsername: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  viewCount: number | null;
  likeCount: number | null;
  publishedAt: string | null;
  description: string | null;
  originalTitle: string | null;
}

interface SupadataMetadataResponse {
  platform: string;
  type: string;
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  author: { username: string; displayName: string; avatarUrl: string; verified: boolean } | null;
  stats: { views: number | null; likes: number | null; comments: number | null; shares: number | null } | null;
  media: { duration: number; thumbnailUrl: string } | null;
  tags: string[];
  createdAt: string | null;
}

export const SUPADATA_TIMEOUT_MS = 90_000;
export const SUPADATA_RETRY_TIMEOUT_MS = 150_000;

export function log(step: string, detail: string) {
  console.log(`[process] ${step}: ${detail}`);
}

function supadataAbort(timeoutMs: number = SUPADATA_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export async function fetchTranscript(videoUrl: string, isYouTube: boolean, apiKey: string, timeoutMs: number = SUPADATA_TIMEOUT_MS): Promise<string> {
  const endpoint = isYouTube
    ? `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`
    : `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&text=true`;

  log('transcript', `fetching from Supadata (${isYouTube ? 'youtube' : 'generic'}, timeout=${timeoutMs / 1000}s)...`);
  const transcriptRes = await fetch(endpoint, {
    headers: { 'x-api-key': apiKey },
    signal: supadataAbort(timeoutMs),
  });

  if (!transcriptRes.ok) {
    const body = await transcriptRes.text();
    const detail = body.trimStart().startsWith('<') ? 'HTML error page' : body.slice(0, 120);
    log('transcript', `FAILED — ${transcriptRes.status}: ${detail}`);
    throw new Error(`Transcript fetch failed (${transcriptRes.status === 524 ? 'Supadata timed out' : transcriptRes.status})`);
  }

  const data = await transcriptRes.json() as { content: { text: string }[] | string };
  let transcript: string | null = null;

  if (isYouTube && Array.isArray(data.content)) {
    transcript = data.content.map((c: { text: string }) => c.text).join(' ');
  } else if (typeof data.content === 'string') {
    transcript = data.content;
  }

  if (!transcript || transcript.trim().length === 0) {
    log('transcript', 'FAILED — empty transcript returned');
    throw new Error('No transcript available for this video');
  }

  log('transcript', `OK — ${transcript.length} chars`);
  return transcript;
}

export async function fetchMetadata(videoUrl: string, apiKey: string): Promise<VideoMetadata | null> {
  try {
    log('metadata', 'fetching from Supadata...');
    const res = await fetch(
      `https://api.supadata.ai/v1/metadata?url=${encodeURIComponent(videoUrl)}`,
      { headers: { 'x-api-key': apiKey }, signal: supadataAbort() }
    );
    if (!res.ok) {
      log('metadata', `FAILED — ${res.status} (non-blocking)`);
      return null;
    }
    const data = await res.json() as SupadataMetadataResponse;
    const meta: VideoMetadata = {
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
    log('metadata', `OK — title="${meta.originalTitle}" author="${meta.authorName}"`);
    return meta;
  } catch (err) {
    log('metadata', `FAILED — ${err} (non-blocking)`);
    return null;
  }
}

export function checkAuth(req: Request, res: Response): boolean {
  const apiSecret = process.env.API_SECRET;
  if (apiSecret && req.headers['x-api-key'] !== apiSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function isYouTubeUrl(videoUrl: string, platform?: string): boolean {
  return platform === 'youtube' || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
}
