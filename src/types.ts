export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SourcePlatform = 'tiktok' | 'instagram';

export interface Entry {
  id: string;
  source_platform: SourcePlatform;
  video_url: string;
  thumbnail_url: string | null;
  voice_note_path: string | null;
  voice_note_transcript: string | null;
  video_transcript: string | null;
  key_learnings: string | null; // JSON string array
  topic_tag: string | null;
  processing_status: ProcessingStatus;
  created_at: string;
  processed_at: string | null;
}

export interface ProcessResponse {
  videoTranscript: string | null;
  voiceNoteTranscript: string | null;
  keyLearnings: string[];
  topicTag: string;
}
