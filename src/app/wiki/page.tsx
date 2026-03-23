import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import Link from 'next/link';
import { Globe, BookOpen, Database, FileText, Network, Image, Upload, Clock, GitMerge } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default async function WikiListPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  // 마스터 위키 단 1개
  const { data: masterWiki } = await supabase
    .from('wiki_pages')
    .select('*, note_wiki_links(note_id, notes(id, title, note_type, updated_at))')
    .eq('slug', 'master-wiki')
    .eq('user_id', session.user.id)
    .single();

  const noteTypeIcons: Record<string, string> = {
    text: '📝', mindmap: '🧠', image: '🖼️', file: '📁',
  };

  interface NoteLink {
    note_id: string;
    notes: { id: string; title: string; note_type: string; updated_at: string };
  }

  const linkedNotes: NoteLink[] = masterWiki?.note_wiki_links || [];

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
                  ? `v${masterWiki.version} · ${linkedNotes.length}개 메모 반영 · 최종 업데이트 ${formatRelativeTime(masterWiki.updated_at)}`
                  : '아직 위키가 없습니다. 대시보드에서 메모를 선택해 위키를 만들어보세요.'}
              </p>
            </div>
          </div>
          {masterWiki && (
            <Link href="/dashboard" className="btn-secondary flex items-center gap-2 text-sm">
              <GitMerge className="w-4 h-4" />
              메모 추가하기
            </Link>
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* 왼쪽: 메타 정보 사이드바 */}
            <div className="lg:col-span-1 space-y-4">
              {/* 위키 정보 카드 */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-500" />
                  위키 정보
                </h3>
                <div className="space-y-2 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>버전</span>
                    <span className="font-semibold text-indigo-600">v{masterWiki.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>반영 메모</span>
                    <span className="font-semibold">{linkedNotes.length}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span>최초 생성</span>
                    <span>{formatRelativeTime(masterWiki.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>마지막 업데이트</span>
                    <span>{formatRelativeTime(masterWiki.updated_at)}</span>
                  </div>
                </div>
              </div>

              {/* 태그 */}
              {masterWiki.tags && masterWiki.tags.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">태그</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(masterWiki.tags as string[]).map((tag: string) => (
                      <span key={tag} className="badge-blue text-xs">#{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 반영된 메모 목록 */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-gray-500" />
                  반영된 메모 ({linkedNotes.length})
                </h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {linkedNotes.length === 0 ? (
                    <p className="text-xs text-gray-400">없음</p>
                  ) : (
                    linkedNotes.map((link: NoteLink) => (
                      <Link
                        key={link.note_id}
                        href={`/note/${link.notes.id}`}
                        className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition-colors group"
                      >
                        <span className="flex-shrink-0">
                          {noteTypeIcons[link.notes.note_type] || '📄'}
                        </span>
                        <span className="truncate group-hover:underline">{link.notes.title}</span>
                      </Link>
                    ))
                  )}
                </div>
                <Link
                  href="/dashboard"
                  className="mt-3 text-xs text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <GitMerge className="w-3 h-3" />
                  더 추가하기
                </Link>
              </div>
            </div>

            {/* 오른쪽: 위키 본문 */}
            <div className="lg:col-span-3">
              <div className="card p-8">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-950 rounded-lg flex items-center justify-center">
                    <Database className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{masterWiki.title}</h2>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>v{masterWiki.version} · {formatRelativeTime(masterWiki.updated_at)} 업데이트</span>
                    </div>
                  </div>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none
                  prose-headings:text-gray-900 dark:prose-headings:text-white
                  prose-p:text-gray-700 dark:prose-p:text-gray-300
                  prose-a:text-indigo-600
                  prose-blockquote:border-indigo-300 prose-blockquote:text-gray-500
                  prose-code:text-indigo-700 dark:prose-code:text-indigo-300
                  prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800
                  prose-strong:text-gray-900 dark:prose-strong:text-white
                  prose-hr:border-gray-200 dark:prose-hr:border-gray-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {masterWiki.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
