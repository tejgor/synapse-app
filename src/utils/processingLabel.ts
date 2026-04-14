import type { Entry } from '../types';

export function getProcessingLabel(entry: Pick<Entry, 'processing_status' | 'processing_phase'>): string {
  if (entry.processing_phase === 'transcript') {
    return 'Fetching transcript...';
  }

  if (entry.processing_phase === 'llm') {
    return entry.processing_status === 'pending'
      ? 'Waiting for on-device AI...'
      : 'Running on-device AI...';
  }

  return 'Extracting knowledge...';
}
