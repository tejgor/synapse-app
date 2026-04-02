import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProcessRequest {
  videoUrl: string;
  platform?: string;
}

interface KeyDetail {
  label: string;
  value: string;
}

interface ProcessResponse {
  videoTranscript: string | null;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  keyDetails: KeyDetail[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoUrl, platform } = req.body as ProcessRequest;

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' });
  }

  const supadataKey = process.env.SUPADATA_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const result: ProcessResponse = {
    videoTranscript: null,
    title: 'Untitled',
    summary: '',
    category: 'General',
    tags: [],
    keyDetails: [],
  };

  // Step 1: Get video transcript via Supadata
  const isYouTube = platform === 'youtube' || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');

  if (supadataKey) {
    try {
      const endpoint = isYouTube
        ? `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`
        : `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&text=true`;

      const transcriptRes = await fetch(endpoint, {
        headers: { 'x-api-key': supadataKey },
      });

      if (transcriptRes.ok) {
        const data = await transcriptRes.json() as { content: { text: string }[] | string };

        if (isYouTube && Array.isArray(data.content)) {
          result.videoTranscript = data.content.map((c: { text: string }) => c.text).join(' ');
        } else if (typeof data.content === 'string') {
          result.videoTranscript = data.content;
        }
      } else {
        console.error('Supadata error:', transcriptRes.status, await transcriptRes.text());
      }
    } catch (err) {
      console.error('Supadata error:', err);
    }
  }

  // Step 2: Extract knowledge via Claude
  if (anthropicKey && result.videoTranscript) {
    try {
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
          messages: [{ role: 'user', content: buildKnowledgePrompt(result.videoTranscript, videoUrl) }],
        }),
      });

      if (claudeRes.ok) {
        const data = await claudeRes.json() as { content: { text: string }[]; stop_reason?: string };

        if (data.stop_reason === 'max_tokens') {
          console.warn('Claude response was truncated (max_tokens reached) — JSON may be incomplete');
        }

        const raw = data.content?.[0]?.text || '';
        const parsed = extractJSON(raw);

        if (parsed) {
          result.title = (parsed.title as string) || 'Untitled';
          result.summary = (parsed.summary as string) || '';
          result.category = (parsed.category as string) || 'General';
          result.tags = (parsed.tags as string[]) || [];
          result.keyDetails = (parsed.keyDetails as KeyDetail[]) || [];
        } else {
          console.error('Claude error: failed to extract JSON. Raw (first 500 chars):', raw.slice(0, 500));
        }
      }
    } catch (err) {
      console.error('Claude error:', err);
    }
  }

  return res.status(200).json(result);
}

function buildKnowledgePrompt(videoTranscript: string, sourceUrl: string): string {
  return `You are a knowledge extraction assistant. Given a video transcript, extract structured knowledge that is genuinely useful and easy to reference later.

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
