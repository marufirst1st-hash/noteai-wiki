import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { WikiDetailClient } from './WikiDetailClient';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function WikiDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: wiki } = await supabase
    .from('wiki_pages')
    .select('*, note_wiki_links(note_id, notes(id, title, note_type, updated_at))')
    .eq('slug', slug)
    .single();

  if (!wiki) notFound();

  return (
    <AppLayout>
      <WikiDetailClient wiki={wiki} />
    </AppLayout>
  );
}
