import type { SourcePlatform } from '../types';

export function detectPlatform(url: string): SourcePlatform | null {
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  return null;
}

export function extractYouTubeVideoId(url: string): string | null {
  // Handles: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function getThumbnail(url: string): Promise<string | null> {
  const platform = detectPlatform(url);
  if (!platform) return null;

  try {
    if (platform === 'tiktok') {
      const response = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.thumbnail_url || null;
    }

    if (platform === 'instagram') {
      // Instagram oEmbed requires an access token for production use.
      // For now, try the public endpoint which may work for some URLs.
      const response = await fetch(
        `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.thumbnail_url || null;
    }

    if (platform === 'youtube') {
      const videoId = extractYouTubeVideoId(url);
      if (!videoId) return null;
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch {
    return null;
  }

  return null;
}
