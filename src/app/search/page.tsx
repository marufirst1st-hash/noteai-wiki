import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { SearchClient } from './SearchClient';

export default async function SearchPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  return (
    <AppLayout>
      <SearchClient />
    </AppLayout>
  );
}
