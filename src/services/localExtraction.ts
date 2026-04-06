import type { ProcessResponse, ContentSection, KeyDetail } from '../types';
import { getContext, releaseContext } from './llmContext';
import { buildLocalKnowledgePrompt } from './localPrompt';

function extractJSON(raw: string): Record<string, unknown> | null {
  // Strip markdown code fences and whitespace
  const text = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  if (!text) return null;

  // Try direct parse
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {}

  // Try first { to last } substring (handles preamble/postamble text)
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    } catch {}
  }

  return null;
}

export async function extractKnowledgeLocally(
  transcript: string,
  sourceUrl: string,
  metadata: { originalTitle?: string | null; description?: string | null; authorName?: string | null } | null,
  existingCategories: string[],
  existingTags: string[],
): Promise<ProcessResponse> {
  const ctx = await getContext();

  const prompt = buildLocalKnowledgePrompt(
    transcript,
    sourceUrl,
    metadata ?? undefined,
    existingCategories,
    existingTags,
  );

  console.log('[localExtraction] running inference...');
  const t0 = Date.now();

  const result = await ctx.completion({
    prompt,
    n_predict: 2048,
    temperature: 0.3,
    top_p: 0.9,
    stop: ['<end_of_turn>'],
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[localExtraction] inference complete in ${elapsed}s — ${result.text.length} chars`);

  if (!result.text.trim()) {
    console.warn('[localExtraction] model returned empty output — retrying with higher temperature');
    const retry = await ctx.completion({
      prompt,
      n_predict: 2048,
      temperature: 0.7,
      top_p: 0.95,
      stop: ['<end_of_turn>'],
    });
    console.log(`[localExtraction] retry complete — ${retry.text.length} chars`);
    result.text = retry.text;
  }

  console.log(`[localExtraction] raw output: ${result.text.slice(0, 300)}`);

  const parsed = extractJSON(result.text);
  if (!parsed || !parsed.title) {
    await releaseContext();
    throw new Error(`Local extraction returned invalid JSON: ${result.text.slice(0, 200)}`);
  }

  // Build sections: prefer new format, fall back to wrapping legacy keyDetails
  let sections: ContentSection[] = (parsed.sections as ContentSection[]) || [];
  let contentType: string = (parsed.contentType as string) || 'general';

  if (sections.length === 0 && Array.isArray(parsed.keyDetails) && parsed.keyDetails.length > 0) {
    contentType = 'general';
    sections = [{
      heading: 'Details',
      style: 'key-value',
      items: (parsed.keyDetails as KeyDetail[]).map((kd) => ({ label: kd.label, text: kd.value })),
    }];
  }

  return {
    videoTranscript: transcript,
    title: parsed.title as string,
    summary: (parsed.summary as string) || '',
    category: (parsed.category as string) || 'General',
    tags: (parsed.tags as string[]) || [],
    keyDetails: (parsed.keyDetails as KeyDetail[]) || [],
    contentType,
    sections,
    metadata: metadata ? {
      authorName: (metadata as any).authorName ?? null,
      authorUsername: (metadata as any).authorUsername ?? null,
      thumbnailUrl: (metadata as any).thumbnailUrl ?? null,
      duration: (metadata as any).duration ?? null,
      viewCount: (metadata as any).viewCount ?? null,
      likeCount: (metadata as any).likeCount ?? null,
      publishedAt: (metadata as any).publishedAt ?? null,
      description: (metadata as any).description ?? null,
      originalTitle: (metadata as any).originalTitle ?? null,
    } : null,
  };
}
