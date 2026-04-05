import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProcessRequest {
  videoUrl: string;
  platform?: string;
}

interface KeyDetail {
  label: string;
  value: string;
}

interface VideoMetadata {
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

interface ProcessResponse {
  videoTranscript: string | null;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  keyDetails: KeyDetail[];
  metadata: VideoMetadata | null;
}

function log(step: string, detail: string) {
  console.log(`[process] ${step}: ${detail}`);
}

async function fetchTranscript(videoUrl: string, isYouTube: boolean, apiKey: string): Promise<string> {
  const endpoint = isYouTube
    ? `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`
    : `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&text=true`;

  log('transcript', `fetching from Supadata (${isYouTube ? 'youtube' : 'generic'})...`);
  const transcriptRes = await fetch(endpoint, {
    headers: { 'x-api-key': apiKey },
  });

  if (!transcriptRes.ok) {
    const body = await transcriptRes.text();
    const detail = body.trimStart().startsWith('<') ? 'HTML error page' : body.slice(0, 120);
    log('transcript', `FAILED — ${transcriptRes.status}: ${detail}`);
    throw new Error(`Transcript fetch failed (${transcriptRes.status})`);
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

async function fetchMetadata(videoUrl: string, apiKey: string): Promise<VideoMetadata | null> {
  try {
    log('metadata', 'fetching from Supadata...');
    const res = await fetch(
      `https://api.supadata.ai/v1/metadata?url=${encodeURIComponent(videoUrl)}`,
      { headers: { 'x-api-key': apiKey } }
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoUrl, platform } = req.body as ProcessRequest;

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' });
  }

  log('start', `url=${videoUrl} platform=${platform ?? 'unknown'}`);

  const supadataKey = process.env.SUPADATA_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supadataKey) {
    log('transcript', 'SKIPPED — no SUPADATA_API_KEY');
    return res.status(500).json({ error: 'Transcript service not configured' });
  }

  // Step 1: Fetch transcript + metadata in parallel
  const isYouTube = platform === 'youtube' || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');

  const [transcriptResult, metadataResult] = await Promise.allSettled([
    fetchTranscript(videoUrl, isYouTube, supadataKey),
    fetchMetadata(videoUrl, supadataKey),
  ]);

  if (transcriptResult.status === 'rejected') {
    return res.status(422).json({ error: transcriptResult.reason instanceof Error ? transcriptResult.reason.message : 'Transcript fetch failed' });
  }

  const transcript = transcriptResult.value;
  const metadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null;

  // Step 2: Extract knowledge via Claude
  if (!anthropicKey) {
    log('extraction', 'SKIPPED — no ANTHROPIC_API_KEY');
    return res.status(500).json({ error: 'AI extraction service not configured' });
  }

  try {
    log('extraction', 'calling Claude...');
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildKnowledgePrompt(transcript, videoUrl, metadata ?? undefined) }],
      }),
    });

    if (!claudeRes.ok) {
      const body = await claudeRes.text();
      const detail = body.trimStart().startsWith('<') ? 'HTML error page' : body.slice(0, 120);
      log('extraction', `FAILED — Claude ${claudeRes.status}: ${detail}`);
      return res.status(422).json({ error: `AI extraction failed (${claudeRes.status})` });
    }

    const data = await claudeRes.json() as { content: { text: string }[]; stop_reason?: string };

    if (data.stop_reason === 'max_tokens') {
      log('extraction', 'WARNING — response truncated (max_tokens)');
    }

    const raw = data.content?.[0]?.text || '';
    const parsed = extractJSON(raw);

    if (!parsed || !parsed.title) {
      log('extraction', `FAILED — could not parse JSON. Raw: ${raw.slice(0, 300)}`);
      return res.status(422).json({ error: 'AI extraction returned invalid data' });
    }

    const result: ProcessResponse = {
      videoTranscript: transcript,
      title: parsed.title as string,
      summary: (parsed.summary as string) || '',
      category: (parsed.category as string) || 'General',
      tags: (parsed.tags as string[]) || [],
      keyDetails: (parsed.keyDetails as KeyDetail[]) || [],
      metadata,
    };

    log('done', `title="${result.title}" category="${result.category}" tags=${result.tags.length} keyDetails=${result.keyDetails.length} hasMetadata=${metadata !== null}`);
    return res.status(200).json(result);
  } catch (err) {
    log('extraction', `FAILED — ${err}`);
    return res.status(422).json({ error: 'AI extraction failed' });
  }
}

function buildKnowledgePrompt(
  videoTranscript: string,
  sourceUrl: string,
  metadata?: { originalTitle?: string | null; description?: string | null; authorName?: string | null }
): string {
  const metaBlock = metadata && (metadata.originalTitle || metadata.description || metadata.authorName)
    ? `\nVideo metadata:${metadata.originalTitle ? `\n- Title: ${metadata.originalTitle}` : ''}${metadata.authorName ? `\n- Creator: ${metadata.authorName}` : ''}${metadata.description ? `\n- Description: ${metadata.description.slice(0, 500)}` : ''}\n`
    : '';

  return `You are a knowledge extraction assistant. Given a video transcript, extract structured knowledge that is genuinely useful and easy to reference later.
${metaBlock}
Transcript:
${videoTranscript}

Source URL: ${sourceUrl}

Extract the following:
- title: A concise, descriptive title (5-10 words) capturing what this video teaches
- summary: The core takeaway in 2-3 sentences. What would someone need to know?
- category: One primary category. First try to assign to one of these: Tool, Resource, Technique, Concept, Recommendation, Tutorial, News, Opinion. If none fit well, create a short descriptive category (1-2 words).
- tags: 3-6 lowercase tags for searchability. Include specific names, topics, and themes mentioned.
- keyDetails: A list of structured detail items, each with a "label" and "value". Extract every concrete, useful piece of information: tool names, URLs mentioned, specific techniques, steps, numbers, recommendations, people or companies mentioned, pricing, alternatives, etc. Aim for 3-10 items. Labels should be short (1-3 words): "Tool", "Use case", "URL", "Author", "Step 1", "Cost", "Alternative", "Platform", etc.

Respond with ONLY valid JSON in this exact format, no other text:
{"title":"...","summary":"...","category":"...","tags":["tag1","tag2"],"keyDetails":[{"label":"...","value":"..."}]}`;
}

function extractJSON(raw: string): Record<string, unknown> | null {
  // Strip markdown code fences
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  // Try direct parse first
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Fall through to extraction strategies
  }

  // Try to extract first {...} block containing "keyDetails" or "title"
  const jsonMatch = text.match(/\{[\s\S]*?"(?:keyDetails|title)"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      // Fall through
    }
  }

  // Try first { to last } substring
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    } catch {
      // Fall through
    }
  }

  return null;
}
