import type { ProcessResponse, SourcePlatform } from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';

const REQUEST_TIMEOUT_MS = 25_000;

export async function processEntry(
  videoUrl: string,
  platform?: SourcePlatform
): Promise<ProcessResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, platform }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out after 25s');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Processing failed: ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
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
