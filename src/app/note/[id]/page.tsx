import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { NoteDetailClient } from './NoteDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NoteDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: note } = await supabase
    .from('notes')
    .select('*, note_images(*)')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single();

  if (!note) notFound();

  return (
    <AppLayout>
      <NoteDetailClient note={note} userId={session.user.id} />
    </AppLayout>
  );
}
