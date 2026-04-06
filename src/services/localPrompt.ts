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

  const metaBlock = metadata && (metadata.originalTitle || metadata.description || metadata.authorName)
    ? `\nVideo metadata:${metadata.originalTitle ? `\n- Title: ${metadata.originalTitle}` : ''}${metadata.authorName ? `\n- Creator: ${metadata.authorName}` : ''}${metadata.description ? `\n- Description: ${metadata.description.slice(0, 500)}` : ''}\n`
    : '';

  const categoryBlock = existingCategories && existingCategories.length > 0
    ? `\nExisting categories: ${existingCategories.join(', ')}\nUse one of these if it fits. Only create a new category if none match.\n`
    : '';

  const tagBlock = existingTags && existingTags.length > 0
    ? `\nExisting tags: ${existingTags.join(', ')}\nReuse these when they fit.\n`
    : '';

  const userMessage = `Extract structured knowledge from this video transcript. Return ONLY valid JSON.
${metaBlock}
Transcript:
${truncated}

Source: ${sourceUrl}
${categoryBlock}${tagBlock}
Extract these fields:
- title: Concise, descriptive (5-10 words)
- summary: Core takeaway in 2-3 sentences
- category: One topic category (1-2 words, e.g. "Productivity", "Cooking")
- tags: 3-6 lowercase tags
- contentType: Type of content (Tutorial, Review, Quick Tip, Recipe, Explainer, Opinion, etc.)
- sections: Array of sections. Each section has:
  - heading: Short label (e.g. "Steps", "Key Points", "At a Glance")
  - style: "ordered" (numbered steps), "unordered" (bullet list), "key-value" (label+value pairs, include "label"), or "single" (one text block)
  - items: Array of {text, label?} objects

Respond with ONLY this JSON format, no other text:
{"title":"...","summary":"...","category":"...","tags":["..."],"contentType":"...","sections":[{"heading":"...","style":"ordered","items":[{"text":"..."}]}]}`;

  // Wrap in Gemma chat template
  return `<start_of_turn>user\n${userMessage}<end_of_turn>\n<start_of_turn>model\n`;
}

// Standard JSON GBNF grammar — ensures valid JSON output
export const JSON_GRAMMAR = `root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null") ws

object ::=
  "{" ws (
    string ":" ws value
    ("," ws string ":" ws value)*
  )? "}" ws

array  ::=
  "[" ws (
    value
    ("," ws value)*
  )? "]" ws

string ::=
  "\\"" (
    [^\\\\"\x7F\\x00-\\x1F] |
    "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F])
  )* "\\"" ws

number ::= ("-"? ([0-9] | [1-9] [0-9]*)) ("." [0-9]+)? (("e" | "E") ("+" | "-")? [0-9]+)? ws

ws ::= ([ \\t\\n] ws)?
`;
