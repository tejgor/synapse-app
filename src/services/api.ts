import type { ProcessResponse } from '../types';

// Set this to your deployed backend URL, or leave empty to use mock mode
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';

export async function processEntry(
  videoUrl: string,
  voiceNoteBase64: string
): Promise<ProcessResponse> {
  // Mock mode when no backend URL is configured
  if (!API_BASE_URL) {
    return getMockResponse(videoUrl);
  }

  const response = await fetch(`${API_BASE_URL}/api/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, voiceNoteBase64 }),
  });

  if (!response.ok) {
    throw new Error(`Processing failed: ${response.status}`);
  }

  return response.json();
}

function getMockResponse(videoUrl: string): ProcessResponse {
  // Simulate processing delay
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
  };
}
