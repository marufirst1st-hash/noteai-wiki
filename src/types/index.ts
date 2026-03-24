export type NoteType = 'text' | 'mindmap' | 'image' | 'file';
export type NoteStatus = 'active' | 'archived' | 'deleted';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  note_type: NoteType;
  tags: string[];
  status: NoteStatus;
  thumbnail_url?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NoteImage {
  id: string;
  note_id: string;
  storage_path: string;
  public_url: string;
  annotated_url?: string;
  annotation_data?: Record<string, unknown>;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  summary?: string;
  tags: string[];
  user_id: string;
  created_by?: string;
  version: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface WikiHistory {
  id: string;
  wiki_id: string;
  content: string;
  version: number;
  changed_by: string;
  change_summary?: string;
  created_at: string;
}

export interface NoteWikiLink {
  id: string;
  note_id: string;
  wiki_id: string;
  contribution_summary?: string;
  created_at: string;
}

export interface MergeSuggestion {
  id: string;
  note_ids: string[];
  suggested_title: string;
  suggested_content: string;
  confidence_score: number;
  status: 'pending' | 'accepted' | 'rejected';
  created_by: string;
  created_at: string;
}

export interface SearchResult {
  id: string;
  type: 'note' | 'wiki';
  title: string;
  content: string;
  similarity: number;
  created_at: string;
}

export interface MergeProgress {
  step: number;
  totalSteps: number;
  label: string;
  status: 'waiting' | 'processing' | 'done' | 'error';
}
