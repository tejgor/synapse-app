import type { Request, Response } from 'express';
import {
  fetchTranscript, fetchMetadata, checkAuth, isYouTubeUrl, log,
  SUPADATA_TIMEOUT_MS, SUPADATA_RETRY_TIMEOUT_MS,
} from './supadata';

interface TranscriptRequest {
  videoUrl: string;
  platform?: string;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkAuth(req, res)) return;

  const { videoUrl, platform } = req.body as TranscriptRequest;

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' });
  }

  log('transcript-only', `url=${videoUrl} platform=${platform ?? 'unknown'}`);

  const supadataKey = process.env.SUPADATA_API_KEY;
  if (!supadataKey) {
    return res.status(500).json({ error: 'Transcript service not configured' });
  }

  const isYouTube = isYouTubeUrl(videoUrl, platform);

  const [transcriptResult, metadataResult] = await Promise.allSettled([
    fetchTranscript(videoUrl, isYouTube, supadataKey),
    fetchMetadata(videoUrl, supadataKey),
  ]);

  let transcript: string;
  if (transcriptResult.status === 'rejected') {
    const reason = transcriptResult.reason;
    const firstMsg = reason?.name === 'AbortError'
      ? `Transcript fetch timed out (${SUPADATA_TIMEOUT_MS / 1000}s)`
      : (reason instanceof Error ? reason.message : 'Transcript fetch failed');
    log('transcript-only', `FAILED — ${firstMsg} — retrying...`);

    try {
      transcript = await fetchTranscript(videoUrl, isYouTube, supadataKey, SUPADATA_RETRY_TIMEOUT_MS);
    } catch (retryErr: any) {
      const msg = retryErr?.name === 'AbortError'
        ? `Transcript fetch timed out on retry (${SUPADATA_RETRY_TIMEOUT_MS / 1000}s)`
        : (retryErr instanceof Error ? retryErr.message : 'Transcript fetch failed');
      log('transcript-only', `RETRY FAILED — ${msg}`);
      const partialMetadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null;
      return res.status(422).json({ error: msg, metadata: partialMetadata });
    }
  } else {
    transcript = transcriptResult.value;
  }

  const metadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null;

  log('transcript-only', `OK — ${transcript.length} chars, hasMetadata=${metadata !== null}`);
  return res.status(200).json({ videoTranscript: transcript, metadata });
}
