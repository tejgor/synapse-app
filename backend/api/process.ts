import type { Request, Response } from 'express';
import {
  fetchTranscript, fetchMetadata, checkAuth, isYouTubeUrl, log,
  type VideoMetadata,
  SUPADATA_TIMEOUT_MS, SUPADATA_RETRY_TIMEOUT_MS,
} from './supadata';

interface ProcessRequest {
  videoUrl: string;
  platform?: string;
  existingCategories?: string[];
  existingTags?: string[];
}

interface KeyDetail {
  label: string;
  value: string;
}

interface ContentItem {
  label?: string;
  text: string;
}

interface ContentSection {
  heading: string;
  style: 'ordered' | 'unordered' | 'key-value' | 'single';
  items: ContentItem[];
}

interface ProcessResponse {
  videoTranscript: string | null;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  keyDetails: KeyDetail[];
  contentType: string;
  sections: ContentSection[];
  metadata: VideoMetadata | null;
}

const CLAUDE_TIMEOUT_MS = 60_000;

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkAuth(req, res)) return;

  const { videoUrl, platform, existingCategories, existingTags } = req.body as ProcessRequest;

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
  const isYouTube = isYouTubeUrl(videoUrl, platform);

  const [transcriptResult, metadataResult] = await Promise.allSettled([
    fetchTranscript(videoUrl, isYouTube, supadataKey),
    fetchMetadata(videoUrl, supadataKey),
  ]);

  let transcript: string;
  if (transcriptResult.status === 'rejected') {
    const reason = transcriptResult.reason;
    const firstMsg = reason?.name === 'AbortError' ? `Transcript fetch timed out (${SUPADATA_TIMEOUT_MS / 1000}s)` : (reason instanceof Error ? reason.message : 'Transcript fetch failed');
    log('transcript', `FAILED — ${firstMsg} — retrying with ${SUPADATA_RETRY_TIMEOUT_MS / 1000}s timeout...`);

    try {
      transcript = await fetchTranscript(videoUrl, isYouTube, supadataKey, SUPADATA_RETRY_TIMEOUT_MS);
    } catch (retryErr: any) {
      const msg = retryErr?.name === 'AbortError' ? `Transcript fetch timed out on retry (${SUPADATA_RETRY_TIMEOUT_MS / 1000}s)` : (retryErr instanceof Error ? retryErr.message : 'Transcript fetch failed');
      log('transcript', `RETRY FAILED — ${msg}`);
      const partialMetadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null;
      return res.status(422).json({ error: msg, metadata: partialMetadata });
    }
  } else {
    transcript = transcriptResult.value;
  }

  const metadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null;

  // Step 2: Extract knowledge via Claude
  if (!anthropicKey) {
    log('extraction', 'SKIPPED — no ANTHROPIC_API_KEY');
    return res.status(500).json({ error: 'AI extraction service not configured' });
  }

  try {
    log('extraction', 'calling Claude...');
    const claudeAbort = new AbortController();
    const claudeTimer = setTimeout(() => claudeAbort.abort(), CLAUDE_TIMEOUT_MS);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: buildKnowledgePrompt(transcript, videoUrl, metadata ?? undefined, existingCategories, existingTags) }],
      }),
      signal: claudeAbort.signal,
    });

    clearTimeout(claudeTimer);

    if (!claudeRes.ok) {
      const body = await claudeRes.text();
      const detail = body.trimStart().startsWith('<') ? 'HTML error page' : body.slice(0, 120);
      log('extraction', `FAILED — Claude ${claudeRes.status}: ${detail}`);
      return res.status(422).json({ error: `AI extraction failed (${claudeRes.status})`, metadata });
    }

    const data = await claudeRes.json() as { content: { text: string }[]; stop_reason?: string };

    if (data.stop_reason === 'max_tokens') {
      log('extraction', 'WARNING — response truncated (max_tokens)');
    }

    const raw = data.content?.[0]?.text || '';
    const parsed = extractJSON(raw);

    if (!parsed || !parsed.title) {
      log('extraction', `FAILED — could not parse JSON. Raw: ${raw.slice(0, 300)}`);
      return res.status(422).json({ error: 'AI extraction returned invalid data', metadata });
    }

    // Build sections: prefer new format, fall back to wrapping legacy keyDetails
    let sections: ContentSection[] = (parsed.sections as ContentSection[]) || [];
    let contentType: string = (parsed.contentType as string) || 'general';

    if (sections.length === 0 && Array.isArray(parsed.keyDetails) && parsed.keyDetails.length > 0) {
      // Legacy fallback: wrap flat keyDetails into a single key-value section
      contentType = 'general';
      sections = [{
        heading: 'Details',
        style: 'key-value',
        items: (parsed.keyDetails as KeyDetail[]).map((kd) => ({ label: kd.label, text: kd.value })),
      }];
    }

    const result: ProcessResponse = {
      videoTranscript: transcript,
      title: parsed.title as string,
      summary: (parsed.summary as string) || '',
      category: (parsed.category as string) || 'General',
      tags: (parsed.tags as string[]) || [],
      keyDetails: (parsed.keyDetails as KeyDetail[]) || [],
      contentType,
      sections,
      metadata,
    };

    log('done', `title="${result.title}" category="${result.category}" contentType="${result.contentType}" sections=${result.sections.length} hasMetadata=${metadata !== null}`);
    return res.status(200).json(result);
  } catch (err: any) {
    const msg = err?.name === 'AbortError'
      ? `AI extraction timed out (${CLAUDE_TIMEOUT_MS / 1000}s)`
      : `AI extraction failed — ${err}`;
    log('extraction', `FAILED — ${msg}`);
    return res.status(422).json({ error: msg, metadata });
  }
}

function buildKnowledgePrompt(
  videoTranscript: string,
  sourceUrl: string,
  metadata?: { originalTitle?: string | null; description?: string | null; authorName?: string | null },
  existingCategories?: string[],
  existingTags?: string[],
): string {
  const metaBlock = metadata && (metadata.originalTitle || metadata.description || metadata.authorName)
    ? `\nVideo metadata:${metadata.originalTitle ? `\n- Title: ${metadata.originalTitle}` : ''}${metadata.authorName ? `\n- Creator: ${metadata.authorName}` : ''}${metadata.description ? `\n- Description: ${metadata.description.slice(0, 500)}` : ''}\n`
    : '';

  const categoryBlock = existingCategories && existingCategories.length > 0
    ? `\nThe user's library already has these categories: ${existingCategories.join(', ')}\nStrongly prefer assigning to one of these existing categories. Only create a new category if none reasonably fit this content.\n`
    : '';

  const tagBlock = existingTags && existingTags.length > 0
    ? `\nExisting tags in the user's library: ${existingTags.join(', ')}\nPrefer reusing existing tags where they fit. You may still create new tags when needed.\n`
    : '';

  return `You are a knowledge extraction assistant. Given a video transcript, extract structured, actionable knowledge — not just a summary, but something genuinely useful to reference later.
${metaBlock}
Transcript:
${videoTranscript}

Source URL: ${sourceUrl}
${categoryBlock}${tagBlock}
STEP 1 — Classify the content type. Choose the best fit or create your own short label (1-2 words):
Common types: Tutorial, Review, Quick Tip, Recipe, Explainer, Resource List, Opinion, Comparison, Walkthrough, Demo, News, Story

STEP 2 — Extract these fields:
- title: Concise, descriptive (5-10 words)
- summary: Core takeaway in 2-3 sentences
- category: One primary topic category (1-2 words, e.g. "Productivity", "Cooking", "Web Dev")
- tags: 3-6 lowercase tags for searchability
- contentType: The type from Step 1
- sections: An array of structured sections appropriate for the content. Each section has:
  - heading: Short label (e.g. "Steps", "Pros", "Ingredients", "At a Glance")
  - style: One of "ordered", "unordered", "key-value", "single"
  - items: Array of objects with "text" (required) and optional "label" (for key-value style)

SECTION STYLES:
- "ordered": Numbered list — use for steps, instructions, sequences
- "unordered": Bullet list — use for pros, cons, tips, ingredients, resources
- "key-value": Label + value pairs — use for specs, metadata, at-a-glance info (include "label" on each item)
- "single": One prominent text block — use for the core tip, verdict, main takeaway

GUIDELINES:
- Choose sections that fit THIS content. A tutorial needs steps; a review needs pros/cons; a tip needs the tip front and center.
- Include an "At a Glance" key-value section when useful (difficulty, time, cost, servings, etc.)
- Extract EVERY concrete, actionable detail: tool names, URLs, techniques, numbers, recommendations, pricing.
- Aim for 2-5 sections total. Each section should have a clear purpose.
- For steps/instructions, make each item a complete actionable sentence.

Respond with ONLY valid JSON:
{"title":"...","summary":"...","category":"...","tags":["..."],"contentType":"Tutorial","sections":[{"heading":"Steps","style":"ordered","items":[{"text":"..."}]},{"heading":"At a Glance","style":"key-value","items":[{"label":"Difficulty","text":"Beginner"}]}]}`;
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

  // Try to extract first {...} block containing recognizable fields
  const jsonMatch = text.match(/\{[\s\S]*?"(?:keyDetails|sections|contentType|title)"[\s\S]*?\}/);
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
