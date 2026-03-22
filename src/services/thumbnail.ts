import type { SourcePlatform } from '../types';

export function detectPlatform(url: string): SourcePlatform | null {
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('instagram.com')) return 'instagram';
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
  } catch {
    return null;
  }

  return null;
}
