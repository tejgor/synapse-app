import type { ProcessResponse, SourcePlatform } from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';

export async function processEntry(
  videoUrl: string,
  voiceNoteBase64: string,
  platform?: SourcePlatform
): Promise<ProcessResponse> {
  const response = await fetch(`${API_BASE_URL}/api/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, voiceNoteBase64, platform }),
  });

  if (!response.ok) {
    throw new Error(`Processing failed: ${response.status}`);
  }

  const text = await response.text();
  if (!text) {
    throw new Error('Empty response from server');
  }
  try {
    return JSON.parse(text) as ProcessResponse;
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
  }
}
