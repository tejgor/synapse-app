import { selectTranscriptForInference, type TranscriptSelectionStats } from './transcriptBudget';

export function buildLocalKnowledgePrompt(
  transcript: string,
  sourceUrl: string,
  metadata?: { originalTitle?: string | null; description?: string | null; authorName?: string | null },
  existingCategories?: string[],
  existingTags?: string[],
): { prompt: string; transcriptStats: TranscriptSelectionStats } {
  const selectedTranscript = selectTranscriptForInference(transcript);

  const metaBlock = metadata && (metadata.originalTitle || metadata.description || metadata.authorName)
    ? `\nVideo metadata:${metadata.originalTitle ? `\n- Title: ${metadata.originalTitle}` : ''}${metadata.authorName ? `\n- Creator: ${metadata.authorName}` : ''}${metadata.description ? `\n- Description: ${metadata.description.slice(0, 500)}` : ''}\n`
    : '';

  const categoryBlock = existingCategories && existingCategories.length > 0
    ? `\nThe user's library already has these categories: ${existingCategories.join(', ')}\nStrongly prefer assigning to one of these existing categories. Only create a new category if none reasonably fit this content.\n`
    : '';

  const tagBlock = existingTags && existingTags.length > 0
    ? `\nExisting tags in the user's library: ${existingTags.join(', ')}\nPrefer reusing existing tags where they fit. You may still create new tags when needed.\n`
    : '';

  const transcriptIntro = selectedTranscript.stats.wasTrimmed
    ? `Transcript excerpts selected from a longer transcript. Preserve facts exactly, but prioritize the most important ideas that appear across these excerpts.`
    : 'Transcript:';

  return {
    prompt: `/no_think
You are a knowledge extraction assistant.
Respond with JSON only.
Do not output reasoning, <think> tags, markdown, explanations, or extra keys.
Given a short-form video transcript, extract structured, actionable knowledge — not just a summary, but something genuinely useful to reference later.

${metaBlock}
${transcriptIntro}
${selectedTranscript.text}

Source URL: ${sourceUrl}
${categoryBlock}${tagBlock}
STEP 1 — Classify the content type. Choose the best fit or create your own short label (1-2 words):
Common types: Tutorial, Review, Quick Tip, Recipe, Explainer, Resource List, Opinion, Comparison, Walkthrough, Demo, News, Story

STEP 2 — Extract these fields:
- title: Concise, descriptive (5-10 words)
- summary: Core takeaway in 2-3 sentences
- category: One primary topic category (1-2 words, e.g. "Productivity", "Cooking", "Web Dev")
- tags: 3-6 lowercase tags for searchability
- contentType: The type from Step 1
- sections: An array of structured sections appropriate for the content. Each section has:
  - heading: Short label (e.g. "Steps", "Pros", "Ingredients", "At a Glance", "Tools", "Warnings")
  - style: One of "ordered", "unordered", "key-value", "single"
  - items: Array of objects with "text" (required) and optional "label" (for key-value style)

SECTION STYLES:
- "ordered": Numbered list — use for steps, instructions, sequences
- "unordered": Bullet list — use for pros, cons, tips, ingredients, resources, warnings
- "key-value": Label + value pairs — use for specs, metadata, settings, pricing, measurements, time, cost, ingredients, tools, at-a-glance info
- "single": One prominent text block — use for the core tip, verdict, or main takeaway

GUIDELINES:
- Choose sections that fit THIS content. A tutorial needs steps; a review needs pros/cons; a tip needs the tip front and center.
- Include an "At a Glance" key-value section when useful.
- Extract EVERY concrete, actionable detail that is actually present: tools, URLs, ingredients, measurements, settings, prices, dates, timings, quantities, names, recommendations, constraints, and warnings.
- If the transcript mentions numbers, settings, or named items, preserve them in the output.
- Prefer 2-5 sections total with clear purposes.
- For steps/instructions, make each item a complete actionable sentence.
- Do not collapse granular facts into generic bullets when they can be represented as structured items.
- Ignore filler, repetition, sponsor language, and generic motivational phrasing.

Respond with ONLY valid JSON:
{"title":"...","summary":"...","category":"...","tags":["..."],"contentType":"Tutorial","sections":[{"heading":"Steps","style":"ordered","items":[{"text":"..."}]},{"heading":"At a Glance","style":"key-value","items":[{"label":"Difficulty","text":"Beginner"},{"label":"Time","text":"10 minutes"}]}]}`,
    transcriptStats: selectedTranscript.stats,
  };
}
