import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { NoteNewClient } from './NoteNewClient';

export default async function NoteNewPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  return (
    <AppLayout>
      <NoteNewClient userId={session.user.id} />
    </AppLayout>
  );
}
