export interface TranscriptSelectionStats {
  originalWordCount: number;
  selectedWordCount: number;
  wasTrimmed: boolean;
  strategy: 'full' | 'head-middle-tail' | 'head-two-middle-tail';
}

export interface TranscriptSelection {
  text: string;
  stats: TranscriptSelectionStats;
}

const FULL_TRANSCRIPT_WORD_LIMIT = 1600;
const MEDIUM_TRANSCRIPT_WORD_LIMIT = 3200;
const MEDIUM_SELECTION_WORD_LIMIT = 1800;
const LARGE_SELECTION_WORD_LIMIT = 1400;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sliceWindow(words: string[], start: number, count: number): string[] {
  if (count <= 0 || words.length === 0) return [];
  const safeStart = clamp(start, 0, Math.max(0, words.length - count));
  return words.slice(safeStart, safeStart + count);
}

function buildLabeledSelection(sections: Array<{ label: string; words: string[] }>): string {
  return sections
    .filter((section) => section.words.length > 0)
    .map((section) => `[${section.label}]\n${section.words.join(' ')}`)
    .join('\n\n');
}

export function selectTranscriptForInference(transcript: string): TranscriptSelection {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const originalWordCount = words.length;

  if (originalWordCount <= FULL_TRANSCRIPT_WORD_LIMIT) {
    return {
      text: transcript,
      stats: {
        originalWordCount,
        selectedWordCount: originalWordCount,
        wasTrimmed: false,
        strategy: 'full',
      },
    };
  }

  if (originalWordCount <= MEDIUM_TRANSCRIPT_WORD_LIMIT) {
    const budget = MEDIUM_SELECTION_WORD_LIMIT;
    const headCount = Math.round(budget * 0.4);
    const middleCount = Math.round(budget * 0.35);
    const tailCount = budget - headCount - middleCount;

    const head = words.slice(0, headCount);
    const middleStart = Math.floor((originalWordCount - middleCount) / 2);
    const middle = sliceWindow(words, middleStart, middleCount);
    const tail = words.slice(Math.max(0, originalWordCount - tailCount));

    return {
      text: buildLabeledSelection([
        { label: 'beginning', words: head },
        { label: 'middle', words: middle },
        { label: 'ending', words: tail },
      ]),
      stats: {
        originalWordCount,
        selectedWordCount: head.length + middle.length + tail.length,
        wasTrimmed: true,
        strategy: 'head-middle-tail',
      },
    };
  }

  const budget = LARGE_SELECTION_WORD_LIMIT;
  const headCount = Math.round(budget * 0.32);
  const middleOneCount = Math.round(budget * 0.24);
  const middleTwoCount = Math.round(budget * 0.24);
  const tailCount = budget - headCount - middleOneCount - middleTwoCount;

  const head = words.slice(0, headCount);
  const middleOneStart = Math.floor(originalWordCount * 0.35) - Math.floor(middleOneCount / 2);
  const middleTwoStart = Math.floor(originalWordCount * 0.68) - Math.floor(middleTwoCount / 2);
  const middleOne = sliceWindow(words, middleOneStart, middleOneCount);
  const middleTwo = sliceWindow(words, middleTwoStart, middleTwoCount);
  const tail = words.slice(Math.max(0, originalWordCount - tailCount));

  return {
    text: buildLabeledSelection([
      { label: 'beginning', words: head },
      { label: 'middle excerpt 1', words: middleOne },
      { label: 'middle excerpt 2', words: middleTwo },
      { label: 'ending', words: tail },
    ]),
    stats: {
      originalWordCount,
      selectedWordCount: head.length + middleOne.length + middleTwo.length + tail.length,
      wasTrimmed: true,
      strategy: 'head-two-middle-tail',
    },
  };
}
