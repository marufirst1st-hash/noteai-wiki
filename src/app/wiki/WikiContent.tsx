'use client';

import Link from 'next/link';
import { Globe, BookOpen, Database, Clock, GitMerge } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { WikiDeleteButton } from '@/components/ui/WikiDeleteButton';

interface NoteLink {
  note_id: string;
  notes: { id: string; title: string; note_type: string; updated_at: string };
}

interface MasterWiki {
  id: string;
  title: string;
  content: string;
  version: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  note_wiki_links: NoteLink[];
}

const noteTypeIcons: Record<string, string> = {
  text: '📝', mindmap: '🧠', image: '🖼️', file: '📁',
};

// 헤딩 텍스트 → anchor id 변환 ({#custom} 우선 사용)
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

function cleanText(text: string): string {
  return text.replace(/\{#[^}]+\}/g, '').trim();
}

function scrollToAnchor(anchor: string) {
  const el = document.getElementById(anchor);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function WikiContent({ masterWiki, linkedNotes }: {
  masterWiki: MasterWiki;
  linkedNotes: NoteLink[];
}) {
  // 마크다운에서 헤딩 추출 → TOC
  const headers = masterWiki.content.match(/^#{1,3} .+/gm) || [];
  const toc = headers.map((h) => {
    const level = h.match(/^#{1,3}/)?.[0].length ?? 1;
    const rawText = h.replace(/^#{1,3} /, '');
    return { level, text: cleanText(rawText), anchor: toAnchor(rawText) };
  });

  // 헤딩 컴포넌트 팩토리 (id 앵커 포함)
  const makeHeading = (Tag: 'h1' | 'h2' | 'h3', cls: string) =>
    function HeadingComp({ children }: { children?: React.ReactNode }) {
      const raw = String(children ?? '');
      const id = toAnchor(raw);
      const text = cleanText(raw);
      return (
        <Tag id={id} className={`${cls} scroll-mt-24 group`}>
          {text}
          <a
            href={`#${id}`}
            onClick={(e) => { e.preventDefault(); scrollToAnchor(id); }}
            className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-500 text-sm font-normal transition-opacity"
          >#</a>
        </Tag>
      );
    };

  return (
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

        {/* TOC 사이드바 */}
        {toc.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" /> 목차
            </h3>
            <nav className="space-y-0.5 max-h-64 overflow-y-auto">
              {toc.map((item, i) => (
                <button
                  key={i}
                  onClick={() => scrollToAnchor(item.anchor)}
                  className={`w-full text-left py-1 px-2 rounded text-xs transition-colors text-gray-600 dark:text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 ${
                    item.level === 1 ? 'font-semibold' :
                    item.level === 2 ? 'pl-3' : 'pl-5 opacity-80'
                  }`}
                >
                  {item.level === 2 ? '· ' : item.level === 3 ? '  › ' : ''}{item.text}
                </button>
              ))}
            </nav>
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

          {/* 마크다운 본문 — 앵커 + 하이퍼링크 완전 처리 */}
          <div className="prose prose-sm dark:prose-invert max-w-none
            prose-headings:text-gray-900 dark:prose-headings:text-white
            prose-p:text-gray-700 dark:prose-p:text-gray-300
            prose-a:text-indigo-600
            prose-blockquote:border-indigo-300 prose-blockquote:text-gray-500
            prose-code:text-indigo-700 dark:prose-code:text-indigo-300
            prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800
            prose-strong:text-gray-900 dark:prose-strong:text-white
            prose-hr:border-gray-200 dark:prose-hr:border-gray-700">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: makeHeading('h1', 'text-2xl font-bold mb-4 mt-8 border-b border-gray-200 dark:border-gray-700 pb-2'),
                h2: makeHeading('h2', 'text-xl font-bold mb-3 mt-7 text-gray-900 dark:text-gray-100'),
                h3: makeHeading('h3', 'text-lg font-semibold mb-2 mt-5 text-gray-800 dark:text-gray-200'),
                // 앵커 링크 클릭 → 스무스 스크롤
                a: ({ href, children }) => {
                  const isAnchor = href?.startsWith('#');
                  return (
                    <a
                      href={href}
                      onClick={isAnchor ? (e) => {
                        e.preventDefault();
                        scrollToAnchor(href!.slice(1));
                      } : undefined}
                      target={!isAnchor ? '_blank' : undefined}
                      rel={!isAnchor ? 'noopener noreferrer' : undefined}
                      className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 underline underline-offset-2 cursor-pointer"
                    >
                      {children}
                    </a>
                  );
                },
                table: ({ children }) => (
                  <div className="overflow-x-auto my-4">
                    <table className="w-full border-collapse text-sm">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-gray-300 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-800 font-semibold text-left">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="border border-gray-300 dark:border-gray-700 px-3 py-2">{children}</td>
                ),
              }}
            >
              {masterWiki.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
