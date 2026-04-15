import type { ProcessResponse, ContentSection, KeyDetail, ContentItem } from '../types';
import { getContext, releaseContext } from './llmContext';
import { buildLocalKnowledgePrompt } from './localPrompt';

const MINIMAL_STOP_TOKENS = ['<|im_end|>', '<|endoftext|>'];
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    category: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    contentType: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          style: { type: 'string', enum: ['ordered', 'unordered', 'key-value', 'single'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                text: { type: 'string' },
              },
              required: ['text'],
            },
          },
        },
        required: ['heading', 'style', 'items'],
      },
    },
    keyPoints: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'category', 'tags', 'contentType'],
} as const;

type CompletionMode = 'prompt-text' | 'prompt-schema';

export class LocalInferenceInterruptedError extends Error {
  constructor() {
    super('Local inference interrupted');
    this.name = 'LocalInferenceInterruptedError';
  }
}

function repairJSON(text: string): string {
  let result = text.trim();
  result = result.replace(/,(\s*[}\]])/g, '$1');

  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of result) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  while (brackets > 0) {
    result += ']';
    brackets--;
  }
  while (braces > 0) {
    result += '}';
    braces--;
  }

  return result;
}

function extractFieldsRegex(text: string): Record<string, unknown> | null {
  const title = text.match(/"title"\s*:\s*"([^"]+)"/)?.[1];
  if (!title) return null;

  const summary = text.match(/"summary"\s*:\s*"([^"]+)"/)?.[1] || '';
  const category = text.match(/"category"\s*:\s*"([^"]+)"/)?.[1] || 'General';
  const contentType = text.match(/"contentType"\s*:\s*"([^"]+)"/)?.[1] || 'general';
  const tagsMatch = text.match(/"tags"\s*:\s*\[([^\]]*)\]/);
  const tags = tagsMatch
    ? (tagsMatch[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''))
    : [];

  const kpMatch = text.match(/"keyPoints"\s*:\s*\[([^\]]*)\]/);
  const keyPoints = kpMatch
    ? (kpMatch[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''))
    : [];

  console.log('[localExtraction] used regex fallback for field extraction');
  return { title, summary, category, contentType, tags, keyPoints };
}

function extractJSON(raw: string): Record<string, unknown> | null {
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {}

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice) as Record<string, unknown>;
    } catch {}

    try {
      return JSON.parse(repairJSON(slice)) as Record<string, unknown>;
    } catch {}
  }

  return extractFieldsRegex(text);
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function normalizeItems(value: unknown): ContentItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const text = typeof (item as any).text === 'string' ? (item as any).text.trim() : '';
      const label = typeof (item as any).label === 'string' ? (item as any).label.trim() : undefined;
      if (!text) return null;
      return label ? { label, text } : { text };
    })
    .filter(Boolean) as ContentItem[];
}

function buildSections(parsed: Record<string, unknown>): ContentSection[] {
  if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
    const sections = parsed.sections
      .map((section) => {
        if (!section || typeof section !== 'object') return null;
        const heading = typeof (section as any).heading === 'string' ? (section as any).heading.trim() : '';
        const style = typeof (section as any).style === 'string' ? (section as any).style.trim() : '';
        const items = normalizeItems((section as any).items);

        if (!heading || !items.length) return null;
        if (!['ordered', 'unordered', 'key-value', 'single'].includes(style)) return null;

        return {
          heading,
          style: style as ContentSection['style'],
          items,
        };
      })
      .filter(Boolean) as ContentSection[];

    if (sections.length > 0) return sections;
  }

  const keyPoints = normalizeStringArray(parsed.keyPoints);
  if (keyPoints.length > 0) {
    return [{
      heading: 'Key Points',
      style: 'unordered',
      items: keyPoints.map((text) => ({ text })),
    }];
  }

  return [];
}

function buildKeyDetails(sections: ContentSection[]): KeyDetail[] {
  return sections
    .filter((section) => section.style === 'key-value')
    .flatMap((section) => section.items)
    .filter((item) => item.label && item.text)
    .map((item) => ({ label: item.label!, value: item.text }));
}

const THINKING_BUDGET_TOKENS = 300;
const N_PREDICT = 1500;
const FIRST_TOKEN_TIMEOUT_BASE_MS = 18_000;
const FIRST_TOKEN_TIMEOUT_PER_WORD_MS = 10;
const FIRST_TOKEN_TIMEOUT_MAX_MS = 40_000;
const INACTIVITY_TIMEOUT_BASE_MS = 12_000;
const INACTIVITY_TIMEOUT_PER_WORD_MS = 4;
const INACTIVITY_TIMEOUT_MAX_MS = 22_000;
const ABSOLUTE_TIMEOUT_BASE_MS = 60_000;
const ABSOLUTE_TIMEOUT_PER_WORD_MS = 35;
const ABSOLUTE_TIMEOUT_PER_THINKING_TOKEN_MS = 35;
const ABSOLUTE_TIMEOUT_MAX_MS = 180_000;

type AdaptiveTimeoutConfig = {
  firstTokenMs: number;
  inactivityMs: number;
  absoluteMs: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildAdaptiveTimeoutConfig(selectedWordCount: number, mode: CompletionMode): AdaptiveTimeoutConfig {
  return {
    firstTokenMs: clamp(
      FIRST_TOKEN_TIMEOUT_BASE_MS + (selectedWordCount * FIRST_TOKEN_TIMEOUT_PER_WORD_MS),
      FIRST_TOKEN_TIMEOUT_BASE_MS,
      FIRST_TOKEN_TIMEOUT_MAX_MS,
    ),
    inactivityMs: clamp(
      INACTIVITY_TIMEOUT_BASE_MS + (selectedWordCount * INACTIVITY_TIMEOUT_PER_WORD_MS),
      INACTIVITY_TIMEOUT_BASE_MS,
      INACTIVITY_TIMEOUT_MAX_MS,
    ),
    absoluteMs: clamp(
      ABSOLUTE_TIMEOUT_BASE_MS
        + (selectedWordCount * ABSOLUTE_TIMEOUT_PER_WORD_MS)
        + (THINKING_BUDGET_TOKENS * ABSOLUTE_TIMEOUT_PER_THINKING_TOKEN_MS)
        + (mode === 'prompt-schema' ? 10_000 : 0),
      90_000,
      ABSOLUTE_TIMEOUT_MAX_MS,
    ),
  };
}

async function requestStopCompletion(ctx: Awaited<ReturnType<typeof getContext>>) {
  try {
    await Promise.resolve(ctx.stopCompletion());
  } catch {}
}

async function runCompletion(
  ctx: Awaited<ReturnType<typeof getContext>>,
  prompt: string,
  mode: CompletionMode,
  temperature: number,
  topP: number,
  timeoutConfig: AdaptiveTimeoutConfig,
) {
  const common = {
    messages: [{ role: 'user', content: prompt }],
    jinja: true,
    enable_thinking: true,
    thinking_budget_tokens: THINKING_BUDGET_TOKENS,
    n_predict: N_PREDICT,
    temperature,
    top_p: topP,
    stop: MINIMAL_STOP_TOKENS,
    penalty_repeat: 1.1,
  };

  const params = mode === 'prompt-schema'
    ? {
        ...common,
        response_format: {
          type: 'json_schema' as const,
          json_schema: { strict: true, schema: RESPONSE_SCHEMA },
        },
      }
    : common;

  let watchdogHandle: ReturnType<typeof setInterval> | undefined;
  let settled = false;
  const startedAt = Date.now();
  let firstTokenAt: number | null = null;
  let lastTokenAt = startedAt;
  let emittedTokens = 0;

  const completionPromise = ctx.completion(params, (data) => {
    emittedTokens += 1;
    const now = Date.now();
    if (firstTokenAt == null) {
      firstTokenAt = now;
      console.log(`[localExtraction] first token mode=${mode} after ${((now - startedAt) / 1000).toFixed(1)}s`);
    }
    lastTokenAt = now;

    if (emittedTokens % 100 === 0) {
      console.log(
        `[localExtraction] progress mode=${mode} tokens=${emittedTokens} elapsed=${((now - startedAt) / 1000).toFixed(1)}s` +
        ` content=${data.content?.length ?? 0} reasoning=${data.reasoning_content?.length ?? 0}`,
      );
    }
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    watchdogHandle = setInterval(() => {
      if (settled) return;

      const now = Date.now();
      const elapsedMs = now - startedAt;
      const idleMs = now - lastTokenAt;

      let reason: string | null = null;
      if (firstTokenAt == null && elapsedMs > timeoutConfig.firstTokenMs) {
        reason = `no first token after ${(timeoutConfig.firstTokenMs / 1000).toFixed(0)}s`;
      } else if (firstTokenAt != null && idleMs > timeoutConfig.inactivityMs) {
        reason = `generation stalled for ${(timeoutConfig.inactivityMs / 1000).toFixed(0)}s after ${emittedTokens} tokens`;
      } else if (elapsedMs > timeoutConfig.absoluteMs) {
        reason = `absolute timeout after ${(timeoutConfig.absoluteMs / 1000).toFixed(0)}s`;
      }

      if (!reason) return;

      settled = true;
      if (watchdogHandle) clearInterval(watchdogHandle);
      console.warn(`[localExtraction] ${reason} — requesting stop`);
      void requestStopCompletion(ctx);
      reject(new Error(`completion timed out: ${reason}`));
    }, 1000);
  });

  try {
    return await Promise.race([completionPromise, timeoutPromise]);
  } finally {
    settled = true;
    if (watchdogHandle) clearInterval(watchdogHandle);
  }
}

async function attemptCompletion(
  ctx: Awaited<ReturnType<typeof getContext>>,
  prompt: string,
  mode: CompletionMode,
  temperature: number,
  topP: number,
  selectedWordCount: number,
) {
  const timeoutConfig = buildAdaptiveTimeoutConfig(selectedWordCount, mode);
  console.log(
    `[localExtraction] attempt mode=${mode} temperature=${temperature} top_p=${topP} thinking_budget=${THINKING_BUDGET_TOKENS}` +
    ` n_predict=${N_PREDICT} timeouts(first=${(timeoutConfig.firstTokenMs / 1000).toFixed(0)}s idle=${(timeoutConfig.inactivityMs / 1000).toFixed(0)}s max=${(timeoutConfig.absoluteMs / 1000).toFixed(0)}s)`,
  );
  const t0 = Date.now();
  const result = await runCompletion(ctx, prompt, mode, temperature, topP, timeoutConfig);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const stoppedByLimit = (result as any).stopped_limit === true;
  const interrupted = (result as any).interrupted === true;
  console.log(
    `[localExtraction] attempt complete mode=${mode} in ${elapsed}s — ${result.text.length} chars` +
    `${stoppedByLimit ? ' (TRUNCATED by token limit)' : ''}${interrupted ? ' (INTERRUPTED)' : ''}`,
  );
  return result;
}

export async function extractKnowledgeLocally(
  transcript: string,
  sourceUrl: string,
  metadata: { originalTitle?: string | null; description?: string | null; authorName?: string | null } | null,
  existingCategories: string[],
  existingTags: string[],
  shouldStop?: () => boolean,
): Promise<ProcessResponse> {
  const ctx = await getContext();

  const { prompt, transcriptStats } = buildLocalKnowledgePrompt(
    transcript,
    sourceUrl,
    metadata ?? undefined,
    existingCategories,
    existingTags,
  );

  console.log(
    `[localExtraction] running inference with Qwen3 4B... transcript words ${transcriptStats.selectedWordCount}/${transcriptStats.originalWordCount} strategy=${transcriptStats.strategy}`,
  );

  const ensureNotStopped = () => {
    if (shouldStop?.()) {
      throw new LocalInferenceInterruptedError();
    }
  };

  const attempts: Array<{ mode: CompletionMode; temperature: number; topP: number }> = [
    { mode: 'prompt-text', temperature: 0.2, topP: 0.85 },
    { mode: 'prompt-schema', temperature: 0.2, topP: 0.85 },
  ];

  let lastError: unknown = null;
  let rawText = '';

  for (const attempt of attempts) {
    try {
      ensureNotStopped();
      const result = await attemptCompletion(
        ctx,
        prompt,
        attempt.mode,
        attempt.temperature,
        attempt.topP,
        transcriptStats.selectedWordCount,
      );
      ensureNotStopped();
      rawText = result.text;

      if (!rawText.trim()) {
        console.warn(`[localExtraction] empty output for mode=${attempt.mode}`);
        continue;
      }

      console.log(`[localExtraction] raw output (${rawText.length} chars):\n${rawText}`);
      const parsed = extractJSON(rawText);
      if (!parsed || !parsed.title) {
        console.warn(`[localExtraction] parse failed for mode=${attempt.mode}`);
        continue;
      }

      const tags = normalizeStringArray(parsed.tags).slice(0, 6);
      const sections = buildSections(parsed);
      const keyDetails = buildKeyDetails(sections);
      const contentType = typeof parsed.contentType === 'string' && parsed.contentType.trim().length > 0
        ? parsed.contentType.trim()
        : 'general';

      return {
        videoTranscript: transcript,
        title: String(parsed.title),
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        category: typeof parsed.category === 'string' && parsed.category.trim().length > 0 ? parsed.category.trim() : 'General',
        tags,
        keyDetails,
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
    } catch (err) {
      if (err instanceof LocalInferenceInterruptedError) {
        throw err;
      }
      if (shouldStop?.()) {
        throw new LocalInferenceInterruptedError();
      }
      lastError = err;
      console.warn(`[localExtraction] attempt failed mode=${attempt.mode}:`, err);
    }
  }

  await releaseContext();
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
  throw new Error(`Local extraction failed after prompt-based retries: ${errorMessage}${rawText ? ` | last output: ${rawText.slice(0, 300)}` : ''}`);
}
