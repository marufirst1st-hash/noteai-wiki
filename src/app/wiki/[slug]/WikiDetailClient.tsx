'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WikiPage } from '@/types';
import { ArrowLeft, BookOpen, FileText, Network, Image, Upload, Clock, Tag, Trash2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

interface NoteLink {
  note_id: string;
  notes: {
    id: string;
    title: string;
    note_type: string;
    updated_at: string;
  };
}

interface Props {
  wiki: WikiPage & { note_wiki_links?: NoteLink[] };
  isOwner: boolean;
}

const noteTypeIcons: Record<string, React.ReactNode> = {
  text: <FileText className="w-4 h-4 text-blue-500" />,
  mindmap: <Network className="w-4 h-4 text-purple-500" />,
  image: <Image className="w-4 h-4 text-green-500" />,
  file: <Upload className="w-4 h-4 text-orange-500" />,
};

// 헤딩 텍스트 → id 앵커 변환
// {#custom-id} 형식이 있으면 그것을 사용, 없으면 텍스트에서 생성
function toAnchor(text: string): string {
  const custom = text.match(/\{#([^}]+)\}/)?.[1];
  if (custom) return custom;
  return text
    .toLowerCase()
    .replace(/\{#[^}]+\}/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w가-힣-]/g, '')
    .slice(0, 60);
}

// 헤딩 표시 텍스트 ({#...} 제거)
function cleanText(text: string): string {
  return text.replace(/\{#[^}]+\}/g, '').trim();
}

function scrollTo(anchor: string) {
  const el = document.getElementById(anchor);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function WikiDetailClient({ wiki, isOwner }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState('');
  const supabase = createClient();
  const router = useRouter();

  // 스크롤 위치에 따라 활성 섹션 표시
  useEffect(() => {
    const handler = () => {
      const headings = document.querySelectorAll('h2[id], h3[id]');
      let current = '';
      headings.forEach((el) => {
        if (el.getBoundingClientRect().top <= 120) current = el.id;
      });
      setActiveAnchor(current);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // 마크다운에서 헤딩 추출 → TOC
  const headers = wiki.content.match(/^#{1,3} .+/gm) || [];
  const toc = headers.map((h) => {
    const level = h.match(/^#{1,3}/)?.[0].length ?? 1;
    const rawText = h.replace(/^#{1,3} /, '');
    return { level, text: cleanText(rawText), anchor: toAnchor(rawText) };
  });

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000); // 4초 내 재클릭 없으면 취소
      return;
    }
    setDeleting(true);
    setConfirmDelete(false);
    // note_wiki_links 먼저 삭제 (FK 제약)
    await supabase.from('note_wiki_links').delete().eq('wiki_id', wiki.id);
    await supabase.from('wiki_history').delete().eq('wiki_id', wiki.id);
    const { error } = await supabase.from('wiki_pages').delete().eq('id', wiki.id);
    if (error) { toast.error('삭제 실패: ' + error.message); setDeleting(false); return; }
    toast.success('위키가 삭제되었습니다.');
    router.push('/wiki');
  };

  // 헤딩 컴포넌트 팩토리
  const makeHeading = (Tag: 'h1' | 'h2' | 'h3', baseClass: string) =>
    function HeadingComp({ children }: { children?: React.ReactNode }) {
      const raw = String(children ?? '');
      const id = toAnchor(raw);
      const text = cleanText(raw);
      return (
        <Tag id={id} className={`${baseClass} scroll-mt-24 group`}>
          {text}
          <a
            href={`#${id}`}
            onClick={(e) => { e.preventDefault(); scrollTo(id); }}
            className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary-500 transition-opacity text-sm font-normal"
            title="이 섹션 링크 복사"
          >
            #
          </a>
        </Tag>
      );
    };

  return (
    <div className="flex gap-6 p-6 max-w-7xl mx-auto">
      {/* ── 본문 ── */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <Link href="/wiki" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                confirmDelete
                  ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                  : 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? '삭제 중...' : confirmDelete ? '한 번 더 클릭하여 확인' : '위키 삭제'}
            </button>
          )}
        </div>

        <div className="card p-8">
          {/* Meta */}
          <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-100 dark:border-gray-800">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-950 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{wiki.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {formatRelativeTime(wiki.updated_at)}
                </span>
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                  v{wiki.version}
                </span>
              </div>
              {wiki.tags && wiki.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {wiki.tags.map((tag: string) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-full">
                      <Tag className="w-3 h-3" />#{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="prose-wiki">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: makeHeading('h1', 'text-3xl font-bold mb-6 mt-8 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-3'),
                h2: makeHeading('h2', 'text-2xl font-bold mb-4 mt-8 text-gray-900 dark:text-gray-100'),
                h3: makeHeading('h3', 'text-xl font-semibold mb-3 mt-6 text-gray-800 dark:text-gray-200'),
                p: ({ children }) => <p className="mb-4 leading-7 text-gray-700 dark:text-gray-300">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-gray-700 dark:text-gray-300 leading-7">{children}</li>,
                code: ({ children, className }) => {
                  const isBlock = className?.includes('language-');
                  if (isBlock) return <code className="block bg-gray-900 text-gray-100 rounded-lg p-4 my-4 overflow-x-auto text-sm font-mono whitespace-pre">{children}</code>;
                  return <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400">{children}</code>;
                },
                blockquote: ({ children }) => <blockquote className="border-l-4 border-primary-500 pl-4 italic text-gray-600 dark:text-gray-400 my-4 bg-gray-50 dark:bg-gray-800/50 py-2 rounded-r-lg">{children}</blockquote>,
                table: ({ children }) => <div className="overflow-x-auto my-6"><table className="w-full border-collapse text-sm">{children}</table></div>,
                th: ({ children }) => <th className="border border-gray-300 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-800 font-semibold text-left text-gray-900 dark:text-gray-100">{children}</th>,
                td: ({ children }) => <td className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-300">{children}</td>,
                a: ({ href, children }) => {
                  const isAnchor = href?.startsWith('#');
                  return (
                    <a
                      href={href}
                      onClick={isAnchor ? (e) => { e.preventDefault(); scrollTo(href!.slice(1)); } : undefined}
                      target={!isAnchor ? '_blank' : undefined}
                      rel={!isAnchor ? 'noopener noreferrer' : undefined}
                      className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline underline-offset-2 cursor-pointer"
                    >
                      {children}
                    </a>
                  );
                },
                hr: () => <hr className="my-8 border-gray-200 dark:border-gray-700" />,
                img: ({ src, alt }) => <img src={src} alt={alt} className="max-w-full rounded-xl my-4 shadow-md" />,
              }}
            >
              {wiki.content}
            </ReactMarkdown>
          </div>

          {/* Source notes */}
          {wiki.note_wiki_links && wiki.note_wiki_links.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-500" />
                출처 메모
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {wiki.note_wiki_links.map((link) => link.notes && (
                  <Link
                    key={link.note_id}
                    href={`/note/${link.notes.id}`}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span>{noteTypeIcons[link.notes.note_type] || <FileText className="w-4 h-4 text-gray-500" />}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{link.notes.title}</p>
                      <p className="text-xs text-gray-500">{formatRelativeTime(link.notes.updated_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TOC 사이드바 ── */}
      {toc.length > 0 && (
        <aside className="w-64 flex-shrink-0 hidden lg:block">
          <div className="sticky top-6 card p-4 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> 목차
            </h4>
            <nav className="space-y-0.5">
              {toc.map((item, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(item.anchor)}
                  className={`w-full text-left py-1 px-2 rounded text-sm transition-colors ${
                    activeAnchor === item.anchor
                      ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  } ${
                    item.level === 1 ? 'font-semibold' :
                    item.level === 2 ? 'pl-3' : 'pl-6 text-xs'
                  }`}
                >
                  {item.level === 2 ? '· ' : item.level === 3 ? '  › ' : ''}{item.text}
                </button>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  );
}
