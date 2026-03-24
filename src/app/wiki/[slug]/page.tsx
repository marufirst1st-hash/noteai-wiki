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

  // .eq('user_id', session.user.id) 쿼리가 성공했다 = 본인 위키
  // user_id 컬럼이 RLS로 인해 반환 안 될 수 있으므로 쿼리 성공 여부로 판단
  const isOwner = true;

  return (
    <AppLayout>
      <WikiDetailClient wiki={wiki} isOwner={isOwner} />
    </AppLayout>
  );
}
