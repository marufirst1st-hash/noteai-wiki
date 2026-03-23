import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardClient } from './DashboardClient';
import { Note } from '@/types';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: rawNotes } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  // DB 컬럼 → Note 인터페이스 변환
  const notes: Note[] = (rawNotes || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    note_type: row.note_type as Note['note_type'],
    status: row.status as Note['status'],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    // content_json 또는 raw_text → content
    content: (row.content as string) ?? (row.content_json as string) ?? (row.raw_text as string) ?? null,
    // tags: extracted_entities.tags 또는 빈 배열
    tags: (row.tags as string[]) ?? (row.extracted_entities as Record<string, unknown>)?.tags as string[] ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    thumbnail_url: row.thumbnail_url as string | undefined,
  }));

  return (
    <AppLayout>
      <DashboardClient initialNotes={notes} userId={session.user.id} />
    </AppLayout>
  );
}
