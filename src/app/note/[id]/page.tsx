import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { NoteDetailClient } from './NoteDetailClient';
import { Note } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NoteDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: rawNote } = await supabase
    .from('notes')
    .select('*, note_images(*)')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single();

  if (!rawNote) notFound();

  // DB 컬럼 → Note 인터페이스 변환
  const row = rawNote as Record<string, unknown>;
  const note: Note & { note_images?: Array<{ public_url: string; annotated_url?: string }> } = {
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    note_type: row.note_type as Note['note_type'],
    status: row.status as Note['status'],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    content: (row.content as string) ?? (row.content_json as string) ?? (row.raw_text as string) ?? null,
    tags: (row.tags as string[]) ?? (row.extracted_entities as Record<string, unknown>)?.tags as string[] ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    thumbnail_url: row.thumbnail_url as string | undefined,
    // note_images: original_url → public_url 변환
    note_images: Array.isArray(row.note_images)
      ? (row.note_images as Record<string, unknown>[]).map((img) => ({
          id: img.id as string,
          note_id: img.note_id as string,
          public_url: (img.public_url as string) ?? (img.original_url as string) ?? '',
          annotated_url: img.annotated_url as string | undefined,
          annotation_data: img.annotation_data ?? img.fabric_json,
          file_name: (img.file_name as string) ?? (img.ai_description as string) ?? '',
          file_size: img.file_size as number,
          mime_type: (img.mime_type as string) ?? 'image/*',
          created_at: img.created_at as string,
        }))
      : undefined,
  };

  return (
    <AppLayout>
      <NoteDetailClient note={note} userId={session.user.id} />
    </AppLayout>
  );
}
