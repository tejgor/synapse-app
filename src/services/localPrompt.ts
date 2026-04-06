import type { VideoMetadata } from '../types';

const MAX_TRANSCRIPT_WORDS = 2000;

function truncateTranscript(transcript: string): string {
  const words = transcript.split(/\s+/);
  if (words.length <= MAX_TRANSCRIPT_WORDS) return transcript;
  return words.slice(0, MAX_TRANSCRIPT_WORDS).join(' ') + '\n\n[transcript truncated]';
}

export function buildLocalKnowledgePrompt(
  transcript: string,
  sourceUrl: string,
  metadata?: { originalTitle?: string | null; description?: string | null; authorName?: string | null },
  existingCategories?: string[],
  existingTags?: string[],
): string {
  const truncated = truncateTranscript(transcript);

  const metaLines: string[] = [];
  if (metadata?.originalTitle) metaLines.push(`Title: ${metadata.originalTitle}`);
  if (metadata?.authorName) metaLines.push(`Creator: ${metadata.authorName}`);
  if (metadata?.description) metaLines.push(`Description: ${metadata.description.slice(0, 300)}`);
  const metaBlock = metaLines.length > 0 ? `\nVideo info: ${metaLines.join(' | ')}\n` : '';

  const categoryHint = existingCategories && existingCategories.length > 0
    ? `\nPrefer these categories: ${existingCategories.join(', ')}`
    : '';

  const tagHint = existingTags && existingTags.length > 0
    ? `\nPrefer these tags: ${existingTags.join(', ')}`
    : '';

  const userMessage = `You are a knowledge extraction assistant. Extract structured knowledge from this video transcript and return valid JSON.
${metaBlock}
TRANSCRIPT:
${truncated}

Source: ${sourceUrl}${categoryHint}${tagHint}

Return a JSON object with these fields:
- "title": concise title, 5-10 words
- "summary": core takeaway, 2-3 sentences
- "category": one topic word like "Productivity" or "Cooking"
- "tags": array of 3-6 lowercase tags
- "contentType": content type like "Tutorial", "Review", "Quick Tip", "Recipe", "Explainer"
- "sections": array of sections, each with "heading" (string), "style" ("ordered", "unordered", "key-value", or "single"), and "items" (array of objects with "text" and optional "label")

Example output:
{"title":"How to Build a Morning Routine","summary":"The video covers building a productive morning routine with three key habits. Focus on consistency over perfection.","category":"Productivity","tags":["morning routine","habits","productivity"],"contentType":"Tutorial","sections":[{"heading":"Steps","style":"ordered","items":[{"text":"Wake up at the same time daily"},{"text":"Exercise for 20 minutes"},{"text":"Review your goals"}]},{"heading":"At a Glance","style":"key-value","items":[{"label":"Duration","text":"30 minutes"},{"label":"Difficulty","text":"Beginner"}]}]}

Now extract knowledge from the transcript above. Return ONLY valid JSON, no other text:`;

  // Wrap in Gemma chat template
  return `<start_of_turn>user\n${userMessage}<end_of_turn>\n<start_of_turn>model\n`;
}
