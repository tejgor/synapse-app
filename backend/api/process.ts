import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProcessRequest {
  videoUrl: string;
  voiceNoteBase64: string;
}

interface ProcessResponse {
  videoTranscript: string | null;
  voiceNoteTranscript: string | null;
  keyLearnings: string[];
  topicTag: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoUrl, voiceNoteBase64 } = req.body as ProcessRequest;

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' });
  }

  const supadataKey = process.env.SUPADATA_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // If no API keys are configured, return mock data
  if (!supadataKey && !openaiKey && !anthropicKey) {
    return res.status(200).json(getMockResponse());
  }

  const result: ProcessResponse = {
    videoTranscript: null,
    voiceNoteTranscript: null,
    keyLearnings: [],
    topicTag: 'general',
  };

  // Step 1: Get video transcript via Supadata
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
      }
    } catch (err) {
      console.error('Supadata error:', err);
    }
  }

  // Step 2: Transcribe voice note via OpenAI Whisper
  if (openaiKey && voiceNoteBase64) {
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

  // Step 3: Generate key learnings via Claude Haiku
  if (anthropicKey && (result.videoTranscript || result.voiceNoteTranscript)) {
    try {
      const prompt = buildPrompt(result.videoTranscript, result.voiceNoteTranscript);
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (claudeRes.ok) {
        const data = await claudeRes.json();
        const text = data.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        result.keyLearnings = parsed.keyLearnings || [];
        result.topicTag = parsed.topicTag || 'general';
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
  };
}
