import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
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

  // master-wiki가 아닌 slug로 접근 시 master-wiki로 리다이렉트
  if (slug !== 'master-wiki') {
    // 기존 슬러그로 접근한 경우 master-wiki로 리다이렉트
    redirect('/wiki/master-wiki');
  }

  const { data: wiki } = await supabase
    .from('wiki_pages')
    .select('*, note_wiki_links(note_id, notes(id, title, note_type, updated_at))')
    .eq('slug', 'master-wiki')
    .eq('user_id', session.user.id)
    .single();

  if (!wiki) redirect('/wiki');

  // 서버에서 소유자 여부 판단 (클라이언트에서 user_id 비교 불필요)
  const isOwner = wiki.user_id === session.user.id;

  return (
    <AppLayout>
      <WikiDetailClient wiki={wiki} isOwner={isOwner} />
    </AppLayout>
  );
}
