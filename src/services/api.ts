import type { ProcessResponse, SourcePlatform } from '../types';

// Set this to your deployed backend URL, or leave empty to use mock mode
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';

export async function processEntry(
  videoUrl: string,
  voiceNoteBase64: string,
  platform?: SourcePlatform
): Promise<ProcessResponse> {
  // Mock mode when no backend URL is configured
  if (!API_BASE_URL) {
    return getMockResponse(videoUrl, platform);
  }

  const response = await fetch(`${API_BASE_URL}/api/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, voiceNoteBase64, platform }),
  });

  if (!response.ok) {
    throw new Error(`Processing failed: ${response.status}`);
  }

  return response.json();
}

function getMockResponse(videoUrl: string, platform?: SourcePlatform): ProcessResponse {
  if (platform === 'youtube') {
    return {
      videoTranscript:
        'This is a mock transcript of a long-form YouTube video covering productivity systems, deep work strategies, and time management techniques.',
      voiceNoteTranscript: null,
      keyLearnings: [],
      topicTag: 'productivity',
      highlights: [
        {
          timestamp: 45,
          endTimestamp: 120,
          title: 'Why most productivity systems fail',
          summary:
            'Most productivity systems are designed for compliance, not creativity. Knowledge workers need a different approach.',
        },
        {
          timestamp: 180,
          endTimestamp: 270,
          title: 'The deep work framework',
          summary:
            'A practical framework for scheduling deep work blocks based on energy levels and cognitive load.',
        },
        {
          timestamp: 340,
          endTimestamp: 420,
          title: 'Batching communication effectively',
          summary:
            'How to batch emails and meetings into specific windows to protect focus time.',
        },
        {
          timestamp: 500,
          endTimestamp: 580,
          title: 'The two-minute capture rule',
          summary:
            'If a task takes less than two minutes, do it now. Otherwise, capture it and schedule it.',
        },
        {
          timestamp: 650,
          endTimestamp: 740,
          title: 'Weekly review process',
          summary:
            'A 30-minute weekly review process that keeps your entire system running smoothly.',
        },
      ],
    };
  }

  return {
    videoTranscript:
      'This is a mock video transcript. The creator discusses key concepts about productivity and personal growth, sharing practical tips that viewers can apply immediately.',
    voiceNoteTranscript:
      'I found this really interesting because it connects to what I was reading about habit formation. The idea of starting small really resonates.',
    keyLearnings: [
      'Start with small, consistent actions rather than dramatic changes',
      'Environment design matters more than willpower for building habits',
      'Track your progress to maintain motivation over time',
      'Share what you learn to deepen your understanding',
    ],
    topicTag: videoUrl.includes('cook')
      ? 'cooking'
      : videoUrl.includes('fit')
        ? 'fitness'
        : 'productivity',
    highlights: null,
  };
}
