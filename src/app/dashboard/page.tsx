import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardClient } from './DashboardClient';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: notes } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  return (
    <AppLayout>
      <DashboardClient initialNotes={notes || []} userId={session.user.id} />
    </AppLayout>
  );
}
