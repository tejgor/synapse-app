import type { ProcessResponse, SourcePlatform } from '../types';
import { getBackendConfig } from './backendConfig';

const REQUEST_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  metadata: ProcessResponse['metadata'] | null;
  constructor(message: string, metadata: ProcessResponse['metadata'] | null = null) {
    super(message);
    this.name = 'ApiError';
    this.metadata = metadata;
  }
}

export async function processEntry(
  videoUrl: string,
  platform?: SourcePlatform,
  existingCategories?: string[],
  existingTags?: string[],
): Promise<ProcessResponse> {
  const { baseUrl, apiSecret, target } = await getBackendConfig();
  if (!baseUrl) {
    throw new ApiError(`No ${target === 'dev' ? 'development' : 'production'} API URL configured`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiSecret ? { 'X-API-Key': apiSecret } : {}),
      },
      body: JSON.stringify({ videoUrl, platform, existingCategories, existingTags }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Request timed out after 60s');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let metadata: ProcessResponse['metadata'] | null = null;
    try {
      const body = await response.json() as { error?: string; metadata?: ProcessResponse['metadata'] };
      metadata = body.metadata ?? null;
    } catch {}
    throw new ApiError(`Processing failed: ${response.status}`, metadata);
  }

  const text = await response.text();
  if (!text) {
    throw new ApiError('Empty response from server');
  }
  try {
    return JSON.parse(text) as ProcessResponse;
  } catch {
    throw new ApiError(`Invalid JSON response: ${text.slice(0, 200)}`);
  }
}
