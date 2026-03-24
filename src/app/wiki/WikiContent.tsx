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
    .replace(/\{#[^}]+\}/g, '')
    .trim()
    .toLowerCase()
    // 한글, 영문, 숫자, 하이픈만 남기고 공백은 하이픈으로
    .replace(/\s+/g, '-')
    .replace(/[^\w가-힣-]/g, '-')  // 특수문자(—, /, & 등) → 하이픈
    .replace(/-+/g, '-')           // 연속 하이픈 제거
    .replace(/^-|-$/g, '')         // 앞뒤 하이픈 제거
    .slice(0, 80);
}

function cleanText(text: string): string {
  return text.replace(/\{#[^}]+\}/g, '').trim();
}

// 앵커 정규화 — 연속 하이픈 유지 (커스텀 앵커와 일치 위해)
function normalizeAnchor(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w가-힣-]/g, '-')
    .replace(/^-|-$/g, '');
}

// 연속 하이픈 제거 버전 (느슨한 매칭용)
function collapseHyphens(s: string): string {
  return s.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// 하이픈 완전 제거 버전 (숫자+기호 케이스용: 2024~2025 → 20242025)
function stripHyphens(s: string): string {
  return s.replace(/-/g, '');
}

function scrollToAnchor(anchor: string) {
  const decoded = decodeURIComponent(anchor);

  // 1차: 정확한 id 매칭
  let el = document.getElementById(decoded);

  // 2차: normalizeAnchor (연속 하이픈 유지)
  if (!el) el = document.getElementById(normalizeAnchor(decoded));

  // 3차: collapseHyphens (연속 하이픈 → 단일)
  if (!el) el = document.getElementById(collapseHyphens(decoded));

  // 4차: 모든 헤딩 순회 — 정확 id/텍스트 매칭
  if (!el) {
    const headings = Array.from(document.querySelectorAll('h1[id], h2[id], h3[id]')) as HTMLElement[];
    const searchNorm = normalizeAnchor(decoded);
    const searchCollapsed = collapseHyphens(searchNorm);
    const searchStripped = stripHyphens(searchCollapsed);

    // 4-1: collapseHyphens(헤딩 id) === collapseHyphens(링크)
    let found = headings.find(h => collapseHyphens(normalizeAnchor(h.id)) === searchCollapsed);
    // 4-2: 하이픈 제거 후 비교 (2024~2025 케이스)
    if (!found) found = headings.find(h => stripHyphens(normalizeAnchor(h.id)) === searchStripped);
    // 4-3: 헤딩 텍스트 기반
    if (!found) found = headings.find(h => collapseHyphens(normalizeAnchor(h.textContent || '')) === searchCollapsed);
    // 4-4: fuzzy — 유사도 0.6 이상
    if (!found) {
      let bestScore = 0;
      headings.forEach(h => {
        const score = Math.max(
          similarity(searchCollapsed, collapseHyphens(normalizeAnchor(h.id))),
          similarity(searchCollapsed, collapseHyphens(normalizeAnchor(h.textContent || '')))
        );
        if (score > bestScore) { bestScore = score; found = h; }
      });
      if (bestScore < 0.6) found = undefined;
    }
    if (found) el = found;
  }

  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 두 문자열의 유사도 (공통 문자 비율)
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  let common = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) common++;
  }
  return common / longer.length;
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
