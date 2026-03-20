import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import Link from 'next/link';
import { Globe, BookOpen, Calendar, FileText } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export default async function WikiListPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: wikis } = await supabase
    .from('wiki_pages')
    .select('*')
    .eq('is_published', true)
    .order('updated_at', { ascending: false });

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Globe className="w-7 h-7 text-primary-600" />
              위키 문서
            </h1>
            <p className="text-sm text-gray-500 mt-1">{wikis?.length || 0}개의 위키</p>
          </div>
        </div>

        {!wikis || wikis.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">위키가 없습니다</h3>
            <p className="text-gray-500 text-sm mb-6">대시보드에서 메모를 선택하고 "위키로 합치기"를 눌러보세요!</p>
            <Link href="/dashboard" className="btn-primary">
              대시보드로 이동
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wikis.map((wiki) => (
              <Link key={wiki.id} href={`/wiki/${wiki.slug}`} className="card p-6 hover:border-primary-300 dark:hover:border-primary-700 transition-all group">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-primary-600 transition-colors truncate">
                      {wiki.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <Calendar className="w-3 h-3" />
                      {formatRelativeTime(wiki.updated_at)}
                      <span className="text-gray-300 dark:text-gray-700">•</span>
                      <span>v{wiki.version}</span>
                    </div>
                  </div>
                </div>

                {wiki.summary && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-3 leading-relaxed">
                    {wiki.summary.replace(/[#*`]/g, '').slice(0, 150)}
                  </p>
                )}

                {wiki.tags && wiki.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {wiki.tags.slice(0, 4).map((tag: string) => (
                      <span key={tag} className="badge-blue text-xs">#{tag}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
