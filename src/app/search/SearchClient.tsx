'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Search, FileText, Globe, BookOpen, Sparkles, Loader2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface SearchResult {
  id: string;
  type: 'note' | 'wiki';
  title: string;
  content: string;
  similarity: number;
  created_at: string;
  slug?: string;
  note_type?: string;
}

export function SearchClient() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const handleSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error('검색 실패');
      const data = await res.json();
      setResults(data);
    } catch (err) {
      toast.error('검색 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(val), 500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const similarityColor = (s: number) => {
    if (s >= 0.8) return 'text-green-600';
    if (s >= 0.6) return 'text-blue-600';
    return 'text-gray-500';
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3 mb-2">
          <Search className="w-7 h-7 text-primary-600" />
          시맨틱 검색
        </h1>
        <p className="text-gray-500 text-sm">자연어로 질문하면 관련 메모와 위키를 찾아드립니다</p>
      </div>

      {/* Search Box */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative">
          <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500" />
          <input
            value={query}
            onChange={handleInputChange}
            className="w-full pl-12 pr-4 py-4 text-lg rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:border-primary-500 transition-colors shadow-sm"
            placeholder="예: 프로젝트 일정 관련 메모, AI 기술 내용..."
            autoFocus
          />
          {loading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500 animate-spin" />
          )}
        </div>
      </form>

      {/* Hints */}
      {!searched && (
        <div className="grid grid-cols-2 gap-3 mb-8">
          {[
            '프로젝트 기획 관련 내용',
            '기술 스택 비교',
            '회의록 요약',
            'API 설계 문서',
          ].map((hint) => (
            <button
              key={hint}
              onClick={() => { setQuery(hint); handleSearch(hint); }}
              className="text-left p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-400 hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950 transition-all"
            >
              <Search className="w-4 h-4 inline mr-2 text-gray-400" />
              {hint}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <div className="text-center py-12">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">검색 결과가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">다른 검색어를 시도해보세요</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">
            <span className="font-semibold text-gray-700 dark:text-gray-300">{results.length}</span>개 결과
          </p>
          {results.map((result) => (
            <Link
              key={`${result.type}-${result.id}`}
              href={result.type === 'wiki' ? `/wiki/${result.slug}` : `/note/${result.id}`}
              className="card p-5 hover:border-primary-300 dark:hover:border-primary-700 transition-all block group"
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  result.type === 'wiki' ? 'bg-indigo-50 dark:bg-indigo-950' : 'bg-blue-50 dark:bg-blue-950'
                }`}>
                  {result.type === 'wiki'
                    ? <BookOpen className="w-5 h-5 text-indigo-600" />
                    : <FileText className="w-5 h-5 text-blue-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 transition-colors truncate">
                      {result.title}
                    </h3>
                    <span className={`text-xs font-medium flex-shrink-0 ${similarityColor(result.similarity)}`}>
                      {Math.round(result.similarity * 100)}% 일치
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`badge text-xs ${result.type === 'wiki' ? 'badge-purple' : 'badge-blue'}`}>
                      {result.type === 'wiki' ? '위키' : '메모'}
                    </span>
                    <span className="text-xs text-gray-400">{formatRelativeTime(result.created_at)}</span>
                  </div>
                  {result.content && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {result.content.replace(/<[^>]+>/g, '').replace(/[#*`]/g, '').slice(0, 150)}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
