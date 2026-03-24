import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import Link from 'next/link';
import { Database, GitMerge } from 'lucide-react';
import { WikiDeleteButton } from '@/components/ui/WikiDeleteButton';
import { WikiContent } from './WikiContent';

export default async function WikiListPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: masterWiki } = await supabase
    .from('wiki_pages')
    .select('*, note_wiki_links(note_id, notes(id, title, note_type, updated_at))')
    .eq('slug', 'master-wiki')
    .eq('user_id', session.user.id)
    .single();

  const linkedNotes = masterWiki?.note_wiki_links || [];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950 rounded-xl flex items-center justify-center">
              <Database className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">지식 베이스</h1>
              <p className="text-sm text-gray-500">
                {masterWiki
                  ? `v${masterWiki.version} · ${linkedNotes.length}개 메모 반영`
                  : '아직 위키가 없습니다. 대시보드에서 메모를 선택해 위키를 만들어보세요.'}
              </p>
            </div>
          </div>
          {masterWiki && (
            <div className="flex items-center gap-2">
              <WikiDeleteButton wikiId={masterWiki.id} />
              <Link href="/dashboard" className="btn-secondary flex items-center gap-2 text-sm">
                <GitMerge className="w-4 h-4" />
                메모 추가하기
              </Link>
            </div>
          )}
        </div>

        {!masterWiki ? (
          /* 빈 상태 */
          <div className="text-center py-20 card">
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950 rounded-full flex items-center justify-center mx-auto mb-6">
              <Database className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">지식 베이스가 비어있습니다</h3>
            <p className="text-gray-500 mb-2 max-w-md mx-auto">
              대시보드에서 메모를 선택하고 <strong>&ldquo;위키로 합치기&rdquo;</strong>를 누르면 AI가 자동으로 회사 지식 베이스를 구축합니다.
            </p>
            <p className="text-sm text-gray-400 mb-8 max-w-md mx-auto">
              메모를 추가할 때마다 AI가 기존 위키에 자연스럽게 통합합니다.
            </p>
            <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2">
              <GitMerge className="w-4 h-4" />
              대시보드에서 시작하기
            </Link>
          </div>
        ) : (
          <WikiContent masterWiki={masterWiki} linkedNotes={linkedNotes} />
        )}
      </div>
    </AppLayout>
  );
}
