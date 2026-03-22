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

  // If no API keys are configured, return mock data
  if (!supadataKey && !openaiKey && !anthropicKey) {
    return res.status(200).json(isYouTube ? getYouTubeMockResponse() : getMockResponse());
  }

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
      const transcriptRes = await fetch(
        `https://api.supadata.ai/v1/social/transcript?url=${encodeURIComponent(videoUrl)}`,
        {
          headers: { 'x-api-key': supadataKey },
        }
      );
      if (transcriptRes.ok) {
        const data = await transcriptRes.json();
        result.videoTranscript = data.transcript || data.text || null;

        // For YouTube, try to get timestamped segments
        if (isYouTube && data.segments) {
          timestampedTranscript = data.segments;
        }
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
        const text = data.content?.[0]?.text || '';
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

function getYouTubeMockResponse(): ProcessResponse {
  return {
    videoTranscript:
      'This is a mock transcript of a long-form YouTube video covering productivity systems, deep work strategies, and time management techniques for knowledge workers.',
    voiceNoteTranscript: null,
    keyLearnings: [],
    topicTag: 'productivity',
    highlights: [
      {
        timestamp: 45,
        endTimestamp: 120,
        title: 'Why most productivity systems fail',
        summary:
          'The creator explains how most productivity systems are designed for compliance, not creativity, and why knowledge workers need a different approach.',
      },
      {
        timestamp: 180,
        endTimestamp: 270,
        title: 'The deep work framework',
        summary:
          'A practical framework for scheduling deep work blocks that accounts for energy levels and cognitive load throughout the day.',
      },
      {
        timestamp: 340,
        endTimestamp: 420,
        title: 'Batching communication effectively',
        summary:
          'How to batch emails, messages, and meetings into specific windows to protect focus time without becoming unresponsive.',
      },
      {
        timestamp: 500,
        endTimestamp: 580,
        title: 'The two-minute capture rule',
        summary:
          'A simple rule: if a task takes less than two minutes, do it now. If not, capture it in your system and schedule it.',
      },
      {
        timestamp: 650,
        endTimestamp: 740,
        title: 'Weekly review process',
        summary:
          'A step-by-step weekly review process that takes 30 minutes and keeps your entire system running smoothly.',
      },
    ],
  };
}

function getMockResponse(): ProcessResponse {
  return {
    videoTranscript:
      'This is a mock video transcript. The creator discusses key concepts about productivity and personal growth, sharing practical tips that viewers can apply immediately.',
    voiceNoteTranscript:
      'I found this really interesting because it connects to what I was reading about habit formation. The idea of starting small really resonates with me.',
    keyLearnings: [
      'Start with small, consistent actions rather than dramatic changes',
      'Environment design matters more than willpower for building habits',
      'Track your progress to maintain motivation over time',
      'Share what you learn to deepen your understanding',
    ],
    topicTag: 'productivity',
    highlights: null,
  };
}
