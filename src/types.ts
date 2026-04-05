export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SourcePlatform = 'tiktok' | 'instagram' | 'youtube';

export interface KeyDetail {
  label: string;
  value: string;
}

export interface Entry {
  id: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  tags: string | null; // JSON string of string[]
  key_details: string | null; // JSON string of KeyDetail[]
  source_url: string;
  source_platform: SourcePlatform;
  video_transcript: string | null;
  processing_status: ProcessingStatus;
  created_at: string;
  processed_at: string | null;
  author_name: string | null;
  author_username: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  view_count: number | null;
  like_count: number | null;
  published_at: string | null;
}

export interface VideoMetadata {
  authorName: string | null;
  authorUsername: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  viewCount: number | null;
  likeCount: number | null;
  publishedAt: string | null;
  description: string | null;
  originalTitle: string | null;
}

export interface ProcessResponse {
  videoTranscript: string | null;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  keyDetails: KeyDetail[];
  metadata: VideoMetadata | null;
}
