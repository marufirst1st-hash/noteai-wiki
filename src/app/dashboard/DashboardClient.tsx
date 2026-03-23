'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Note } from '@/types';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime, cn } from '@/lib/utils';
import {
  Plus, FileText, Network, Image, Upload, CheckSquare, Square,
  Trash2, GitMerge, Search, Tag, BookOpen
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MergeModal } from '@/components/ui/MergeModal';

const noteTypeConfig = {
  text: { icon: FileText, label: '텍스트', color: 'badge-blue' },
  mindmap: { icon: Network, label: '마인드맵', color: 'badge-purple' },
  image: { icon: Image, label: '이미지', color: 'badge-green' },
  file: { icon: Upload, label: '파일', color: 'badge-orange' },
};

interface Props {
  initialNotes: Note[];
  userId: string;
  initialWikifiedNoteIds?: string[]; // 서버에서 조회한 위키화 완료 메모 ID
}

export function DashboardClient({ initialNotes, userId, initialWikifiedNoteIds = [] }: Props) {
  const router = useRouter();
  const { notes, setNotes, selectedNotes, toggleSelectNote, clearSelection, deleteNote, wikifiedNoteIds, addWikifiedNotes } = useAppStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes, setNotes]);

  // DB에서 불러온 위키화 완료 메모 ID를 store에 초기화
  useEffect(() => {
    if (initialWikifiedNoteIds.length > 0) {
      addWikifiedNotes(initialWikifiedNoteIds);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 관리자 권한 확인
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const meta = session?.user?.app_metadata;
      setIsAdmin(meta?.is_admin === true || meta?.role === 'admin');
    });
  }, [supabase.auth]);

  const filtered = notes.filter((n) => {
    const matchSearch = n.title.toLowerCase().includes(search.toLowerCase()) ||
      (n.content && n.content.toLowerCase().includes(search.toLowerCase()));
    const matchType = filterType === 'all' || n.note_type === filterType;
    return matchSearch && matchType;
  });

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('notes').update({ status: 'deleted' }).eq('id', id);
    if (error) { toast.error('삭제 실패'); return; }
    deleteNote(id);
    toast.success('메모가 삭제되었습니다.');
  };

  const getPreviewContent = (note: Note) => {
    if (!note.content) return '내용 없음';
    if (note.note_type === 'mindmap') return '마인드맵 노트';
    const text = note.content.replace(/<[^>]+>/g, '').replace(/[#*`]/g, '');
    return text.slice(0, 120) + (text.length > 120 ? '...' : '');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">내 메모</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {filtered.length}개의 메모
          </p>
        </div>
        <Link href="/note/new" className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          새 메모
        </Link>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9"
            placeholder="메모 검색..."
          />
        </div>
        <div className="flex gap-2">
          {[{ v: 'all', l: '전체' }, { v: 'text', l: '텍스트' }, { v: 'mindmap', l: '마인드맵' }, { v: 'image', l: '이미지' }, { v: 'file', l: '파일' }].map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setFilterType(v)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                filterType === v
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Selection Bar - 관리자만 표시 */}
      {isAdmin && selectedNotes.length > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-primary-50 dark:bg-primary-950 rounded-xl border border-primary-200 dark:border-primary-800">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
            {selectedNotes.length}개 선택됨
          </span>
          <button
            onClick={() => setShowMergeModal(true)}
            className="btn-primary text-sm py-1.5 ml-auto"
          >
            <GitMerge className="w-4 h-4 mr-1.5" />
            위키로 합치기
          </button>
          <button onClick={clearSelection} className="btn-secondary text-sm py-1.5">
            선택 해제
          </button>
        </div>
      )}

      {/* Notes Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">메모가 없습니다</h3>
          <p className="text-gray-500 text-sm mb-6">첫 번째 메모를 작성해보세요!</p>
          <Link href="/note/new" className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            새 메모 작성
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((note) => {
            const isSelected = selectedNotes.includes(note.id);
            const isWikified = wikifiedNoteIds.has(note.id);
            const typeConf = noteTypeConfig[note.note_type];
            const TypeIcon = typeConf.icon;
            return (
              <div
                key={note.id}
                className={cn(
                  'card p-4 cursor-pointer group relative transition-all overflow-hidden',
                  isSelected && 'ring-2 ring-primary-500 border-primary-300',
                  isWikified && 'ring-2 ring-green-400 border-green-300 dark:border-green-700'
                )}
                onClick={() => router.push(`/note/${note.id}`)}
              >
                {/* ✅ 위키화 완료 배지 (상단 좌측 리본) */}
                {isWikified && (
                  <div className="absolute top-0 left-0 z-10">
                    <div className="bg-green-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-br-lg flex items-center gap-1 shadow-sm">
                      <BookOpen className="w-3 h-3" />
                      위키화 완료
                    </div>
                  </div>
                )}

                {/* ✅ 위키화 완료 오버레이 (희미한 초록 배경) */}
                {isWikified && (
                  <div className="absolute inset-0 bg-green-50/40 dark:bg-green-900/20 pointer-events-none rounded-xl" />
                )}

                {/* 관리자 전용: 선택 체크박스 */}
                {isAdmin && (
                  <button
                    className={cn(
                      'absolute z-10 opacity-0 group-hover:opacity-100 transition-opacity',
                      isWikified ? 'top-8 right-10' : 'top-3 right-10'
                    )}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelectNote(note.id); }}
                  >
                    {isSelected
                      ? <CheckSquare className="w-5 h-5 text-primary-600" />
                      : <Square className="w-5 h-5 text-gray-400" />
                    }
                  </button>
                )}

                {/* 관리자 전용: 삭제 버튼 */}
                {isAdmin && (
                  <button
                    className={cn(
                      'absolute z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-red-500',
                      isWikified ? 'top-8 right-3' : 'top-3 right-3'
                    )}
                    onClick={(e) => handleDelete(note.id, e)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <div className={cn('flex items-start gap-3 mb-3', isWikified && 'mt-5')}>
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                    note.note_type === 'text' && 'bg-blue-50 dark:bg-blue-950',
                    note.note_type === 'mindmap' && 'bg-purple-50 dark:bg-purple-950',
                    note.note_type === 'image' && 'bg-green-50 dark:bg-green-950',
                    note.note_type === 'file' && 'bg-orange-50 dark:bg-orange-950',
                  )}>
                    <TypeIcon className={cn(
                      'w-5 h-5',
                      note.note_type === 'text' && 'text-blue-600',
                      note.note_type === 'mindmap' && 'text-purple-600',
                      note.note_type === 'image' && 'text-green-600',
                      note.note_type === 'file' && 'text-orange-600',
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={cn(
                      'font-semibold text-sm truncate',
                      isWikified ? 'text-green-800 dark:text-green-200' : 'text-gray-900 dark:text-white'
                    )}>
                      {note.title || '제목 없음'}
                    </h3>
                    <span className={cn('text-xs', typeConf.color)}>{typeConf.label}</span>
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                  {getPreviewContent(note)}
                </p>

                {note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {note.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{formatRelativeTime(note.updated_at)}</span>
                  {isSelected ? (
                    <span className="text-primary-600 font-medium">✓ 선택됨</span>
                  ) : isWikified ? (
                    <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      위키화됨
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Merge Modal - 닫아도 백그라운드 진행, 선택 해제는 모달 닫을 때만 */}
      {showMergeModal && (
        <MergeModal
          noteIds={selectedNotes}
          onClose={() => {
            setShowMergeModal(false);
            clearSelection();
          }}
        />
      )}
    </div>
  );
}
