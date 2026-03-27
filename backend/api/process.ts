import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProcessRequest {
  videoUrl: string;
  voiceNoteBase64: string;
  platform?: string;
}

interface TimestampedHighlight {
  timestamp: number;
  endTimestamp: number;
  title: string;
  summary: string;
}

interface ProcessResponse {
  videoTranscript: string | null;
  voiceNoteTranscript: string | null;
  keyLearnings: string[];
  topicTag: string;
  highlights: TimestampedHighlight[] | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoUrl, voiceNoteBase64, platform } = req.body as ProcessRequest;

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' });
  }

  const isYouTube = platform === 'youtube' || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');

  const supadataKey = process.env.SUPADATA_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const result: ProcessResponse = {
    videoTranscript: null,
    voiceNoteTranscript: null,
    keyLearnings: [],
    topicTag: 'general',
    highlights: null,
  };

  // Step 1: Get video transcript via Supadata
  let timestampedTranscript: { text: string; offset: number; duration: number }[] | null = null;

  if (supadataKey) {
    try {
      const endpoint = isYouTube
        ? `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`
        : `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&text=true`;

      const transcriptRes = await fetch(endpoint, {
        headers: { 'x-api-key': supadataKey },
      });

      if (transcriptRes.ok) {
        const data = await transcriptRes.json() as { content: { text: string; offset: number }[] | string };

        if (isYouTube && Array.isArray(data.content)) {
          // content is an array of { text, offset (ms), duration, lang }
          result.videoTranscript = data.content.map((c: { text: string }) => c.text).join(' ');
          // Use Math.floor (not round) to keep offsets monotonically increasing
          const rawSegments = data.content.map((c: { text: string; offset: number; duration?: number }) => ({
            text: c.text,
            offset: Math.floor(c.offset / 1000), // ms → seconds
            duration: c.duration ? Math.ceil(c.duration / 1000) : 0,
          }));
          // Deduplicate segments that share the same integer-second offset (merge text)
          const deduped: { text: string; offset: number; duration: number }[] = [];
          for (const seg of rawSegments) {
            if (deduped.length > 0 && deduped[deduped.length - 1].offset === seg.offset) {
              deduped[deduped.length - 1].text += ' ' + seg.text;
              deduped[deduped.length - 1].duration = Math.max(deduped[deduped.length - 1].duration, seg.duration);
            } else {
              deduped.push({ ...seg });
            }
          }
          timestampedTranscript = deduped;
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

  // Step 2: Transcribe voice note via OpenAI Whisper (skip for YouTube)
  if (!isYouTube && openaiKey && voiceNoteBase64) {
    try {
      const audioBuffer = Buffer.from(voiceNoteBase64, 'base64');
      const blob = new Blob([audioBuffer], { type: 'audio/m4a' });

      const formData = new FormData();
      formData.append('file', blob, 'voice_note.m4a');
      formData.append('model', 'whisper-1');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
      });

      if (whisperRes.ok) {
        const data = await whisperRes.json() as { text?: string };
        result.voiceNoteTranscript = data.text || null;
      }
    } catch (err) {
      console.error('Whisper error:', err);
    }
  }

  // Step 3: Generate key learnings or highlights via Claude
  if (anthropicKey && (result.videoTranscript || result.voiceNoteTranscript)) {
    try {
      let claudeBody: Record<string, unknown>;

      if (isYouTube) {
        // Compute video duration from the last segment
        const lastSeg = timestampedTranscript && timestampedTranscript.length > 0
          ? timestampedTranscript[timestampedTranscript.length - 1]
          : null;
        const videoDurationSeconds = lastSeg ? lastSeg.offset + lastSeg.duration : 0;

        claudeBody = {
          model: 'claude-opus-4-6',
          max_tokens: 4096,
          system: buildYouTubeSystemPrompt(videoDurationSeconds),
          messages: [{ role: 'user', content: buildYouTubeUserMessage(timestampedTranscript, result.videoTranscript!) }],
        };
      } else {
        claudeBody = {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: buildPrompt(result.videoTranscript, result.voiceNoteTranscript) }],
        };
      }

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(claudeBody),
      });

      if (claudeRes.ok) {
        const data = await claudeRes.json() as { content: { text: string }[]; stop_reason?: string };

        if (data.stop_reason === 'max_tokens') {
          console.warn('Claude response was truncated (max_tokens reached) — JSON may be incomplete');
        }

        const raw = data.content?.[0]?.text || '';
        const parsed = extractJSON(raw);

        if (isYouTube && parsed) {
          const rawHighlights: TimestampedHighlight[] = (parsed.highlights as TimestampedHighlight[]) || [];

          // Validate and snap timestamps to nearest valid transcript offset
          const validOffsets = timestampedTranscript
            ? timestampedTranscript.map((s) => s.offset)
            : [];
          const validated = validOffsets.length > 0
            ? rawHighlights.map((h) => ({
                ...h,
                timestamp: snapToNearest(h.timestamp, validOffsets),
                endTimestamp: snapToNearest(h.endTimestamp, validOffsets),
              })).filter((h) => {
                const dur = h.endTimestamp - h.timestamp;
                return dur >= 5 && dur <= 300;
              })
            : rawHighlights;

          // Enforce non-overlapping with minimum gap between segments
          const MIN_GAP = 5;
          let lastEnd = -1;
          result.highlights = validated
            .sort((a, b) => a.timestamp - b.timestamp)
            .filter((h) => {
              if (h.timestamp >= lastEnd + MIN_GAP) {
                lastEnd = h.endTimestamp;
                return true;
              }
              return false;
            });
          result.topicTag = (parsed.topicTag as string) || 'general';
        } else if (!isYouTube && parsed) {
          result.keyLearnings = (parsed.keyLearnings as string[]) || [];
          result.topicTag = (parsed.topicTag as string) || 'general';
        } else {
          console.error('Claude error: failed to extract JSON from response. Raw (first 500 chars):', raw.slice(0, 500));
        }
      }
    } catch (err) {
      console.error('Claude error:', err);
    }
  }

  return res.status(200).json(result);
}

function buildPrompt(
  videoTranscript: string | null,
  voiceNoteTranscript: string | null
): string {
  let prompt = '';

  if (videoTranscript) {
    prompt += `Here's the transcript of a short educational video:\n${videoTranscript}\n\n`;
  }

  if (voiceNoteTranscript) {
    prompt += `Here's what the viewer said they learned:\n${voiceNoteTranscript}\n\n`;
  }

  prompt +=
    'Extract 3-5 key learnings from the content as bullet points. Also generate a single topic tag (1-2 words, lowercase) that categorizes this content.\n\n';
  prompt +=
    'Respond with ONLY valid JSON in this exact format, no other text:\n{"keyLearnings": ["point 1", "point 2", "point 3"], "topicTag": "topic"}';

  return prompt;
}

function buildYouTubeSystemPrompt(videoDurationSeconds: number): string {
  const durationNote = videoDurationSeconds > 0
    ? `The video is ${videoDurationSeconds} seconds long. Aim for the supercut to be 30-50% of that (~${Math.round(videoDurationSeconds * 0.3)}-${Math.round(videoDurationSeconds * 0.4)} seconds total).`
    : 'Aim for the supercut to be 30-50% of the original video length.';

  const segmentCountNote = videoDurationSeconds > 0 && videoDurationSeconds < 180
    ? 'For short videos under 3 minutes, 2-4 segments are acceptable.'
    : 'Prefer 5-12 segments.';

  return `You are a video editor. You will receive a timestamped transcript of a YouTube video. Each line has the format [Xs] text, where X is the timestamp in seconds.

Your task: identify which timestamp ranges contain vital takeaways — core ideas, key facts, actionable insights, important explanations — and produce a JSON supercut that skips all filler (intros, outros, sponsor reads, personal anecdotes, repetition, "like and subscribe" prompts).

RULES:
1. Every "timestamp" and "endTimestamp" value in your output MUST be a number that appears as a [Xs] marker in the transcript. Do not invent or interpolate timestamps.
2. "timestamp" is the [Xs] value of the line where valuable content BEGINS.
3. "endTimestamp" is the [Xs] value of the FIRST line AFTER the valuable content ends (i.e., the line you are cutting to next).
4. Segments must be in chronological order, non-overlapping, and have skipped content between them — there must be at least one [Xs] line between the end of one segment and the start of the next.
5. ${durationNote}
6. ${segmentCountNote} Each segment can be 10-120 seconds long.
7. Output integers in seconds only. No decimals, no time strings like "1:23".

EXAMPLE:
Transcript:
[0s] Hey everyone welcome back to the channel
[8s] Today I'm covering three strategies for deep focus
[15s] The first strategy is time blocking
[42s] Let me tell you a quick story about my dog
[68s] The second strategy is eliminating distractions
[95s] Thanks for watching, please subscribe and hit the bell

Output:
{"highlights":[{"timestamp":8,"endTimestamp":42,"title":"Time blocking for deep focus","summary":"Explains how to divide your day into dedicated focus blocks to protect your most productive hours."},{"timestamp":68,"endTimestamp":95,"title":"Eliminating distractions","summary":"Practical techniques for removing interruptions from your environment during focused work."}],"topicTag":"productivity"}

Note: timestamp values 8, 42, 68, 95 all come directly from the [Xs] markers in the transcript above.

Respond with ONLY the JSON object. No markdown, no code fences, no explanation text before or after.`;
}

function buildYouTubeUserMessage(
  segments: { text: string; offset: number; duration: number }[] | null,
  transcript: string
): string {
  if (segments && segments.length > 0) {
    let msg = 'Here is the timestamped transcript:\n\n';
    for (const seg of segments) {
      msg += `[${seg.offset}s] ${seg.text}\n`;
    }
    return msg;
  }
  return `Here is the transcript (no timestamps available):\n\n${transcript}`;
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

  // Try to extract first {...} block containing "highlights" or "keyLearnings"
  const jsonMatch = text.match(/\{[\s\S]*?"(?:highlights|keyLearnings)"[\s\S]*?\}/);
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

function snapToNearest(value: number, validOffsets: number[]): number {
  if (validOffsets.length === 0) return value;
  let closest = validOffsets[0];
  let minDist = Math.abs(value - closest);
  for (const offset of validOffsets) {
    const dist = Math.abs(value - offset);
    if (dist < minDist) {
      minDist = dist;
      closest = offset;
    }
  }
  return closest;
}

