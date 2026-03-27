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
  let timestampedTranscript: { text: string; offset: number }[] | null = null;

  if (supadataKey) {
    try {
      const endpoint = isYouTube
        ? `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(videoUrl)}`
        : `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(videoUrl)}&text=true`;

      const transcriptRes = await fetch(endpoint, {
        headers: { 'x-api-key': supadataKey },
      });

      if (transcriptRes.ok) {
        const data = await transcriptRes.json();

        if (isYouTube && Array.isArray(data.content)) {
          // content is an array of { text, offset (ms), duration, lang }
          result.videoTranscript = data.content.map((c: { text: string }) => c.text).join(' ');
          timestampedTranscript = data.content.map((c: { text: string; offset: number }) => ({
            text: c.text,
            offset: Math.round(c.offset / 1000), // ms → seconds
          }));
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
        const data = await whisperRes.json();
        result.voiceNoteTranscript = data.text || null;
      }
    } catch (err) {
      console.error('Whisper error:', err);
    }
  }

  // Step 3: Generate key learnings or highlights via Claude
  if (anthropicKey && (result.videoTranscript || result.voiceNoteTranscript)) {
    try {
      const prompt = isYouTube
        ? buildYouTubePrompt(result.videoTranscript!, timestampedTranscript)
        : buildPrompt(result.videoTranscript, result.voiceNoteTranscript);

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: isYouTube ? 1024 : 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (claudeRes.ok) {
        const data = await claudeRes.json();
        const raw = data.content?.[0]?.text || '';
        const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
        const parsed = JSON.parse(text);

        if (isYouTube) {
          result.highlights = parsed.highlights || [];
          result.topicTag = parsed.topicTag || 'general';
        } else {
          result.keyLearnings = parsed.keyLearnings || [];
          result.topicTag = parsed.topicTag || 'general';
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

function buildYouTubePrompt(
  transcript: string,
  segments: { text: string; offset: number }[] | null
): string {
  let prompt = '';

  if (segments && segments.length > 0) {
    prompt += 'Here is the timestamped transcript of a long-form YouTube video:\n\n';
    for (const seg of segments) {
      const mins = Math.floor(seg.offset / 60);
      const secs = seg.offset % 60;
      prompt += `[${mins}:${String(secs).padStart(2, '0')}] ${seg.text}\n`;
    }
  } else {
    prompt += `Here is the transcript of a long-form YouTube video:\n\n${transcript}\n`;
  }

  prompt += `\nAnalyze this video and identify 5-10 of the most important and information-dense segments. For each segment, provide:
- timestamp: the start time in seconds
- endTimestamp: the end time in seconds (estimate ~30-90 second segments)
- title: a short, descriptive title for this segment (5-10 words)
- summary: a 1-2 sentence summary of the key insight or information

Also generate a single topic tag (1-2 words, lowercase) that categorizes this content.

Respond with ONLY valid JSON in this exact format, no other text:
{"highlights": [{"timestamp": 0, "endTimestamp": 60, "title": "segment title", "summary": "segment summary"}], "topicTag": "topic"}`;

  return prompt;
}

