import Dexie, { Table } from 'dexie';

export interface OfflineNote {
  id: string;
  title: string;
  content: string | null;
  note_type: string;
  tags: string[];
  metadata: Record<string, unknown>;
  synced: boolean;
  created_at: string;
  updated_at: string;
}

export class NoteAIDatabase extends Dexie {
  offlineNotes!: Table<OfflineNote>;

  constructor() {
    super('noteai-wiki');
    this.version(1).stores({
      offlineNotes: 'id, note_type, synced, created_at',
    });
  }
}

export const db = new NoteAIDatabase();
