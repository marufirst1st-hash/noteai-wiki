import { create } from 'zustand';
import { Note, WikiPage, MergeProgress } from '@/types';

// 머지 진행 상태 (전역)
export interface MergeStatus {
  isRunning: boolean;
  title: string;
  noteIds: string[];        // 머지 대상 메모 ID
  steps: MergeProgress[];
  completedAt?: number;     // 완료 타임스탬프
  wikiSlug?: string;        // 완료 후 위키 슬러그
  error?: string;
}

interface AppState {
  // Notes
  notes: Note[];
  selectedNotes: string[];
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, data: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  toggleSelectNote: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Wiki
  wikis: WikiPage[];
  setWikis: (wikis: WikiPage[]) => void;
  addWiki: (wiki: WikiPage) => void;
  updateWiki: (id: string, data: Partial<WikiPage>) => void;

  // Merge (legacy)
  mergeProgress: MergeProgress[];
  isMerging: boolean;
  setMergeProgress: (progress: MergeProgress[]) => void;
  updateMergeStep: (step: number, status: MergeProgress['status']) => void;
  setIsMerging: (isMerging: boolean) => void;

  // Merge Status (전역 진행 상태 - 어디서든 접근 가능)
  mergeStatus: MergeStatus | null;
  setMergeStatus: (status: MergeStatus | null) => void;
  updateMergeStatusStep: (step: number, status: MergeProgress['status']) => void;

  // 위키화 완료된 메모 ID 목록 (대시보드 카드 표시용)
  wikifiedNoteIds: Set<string>;
  addWikifiedNotes: (noteIds: string[]) => void;
  clearWikifiedNotes: () => void;

  // UI
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const INITIAL_STEPS: MergeProgress[] = [
  { step: 1, totalSteps: 5, label: '멀티모달 파싱', status: 'waiting' },
  { step: 2, totalSteps: 5, label: '엔티티 추출', status: 'waiting' },
  { step: 3, totalSteps: 5, label: '중복/충돌 해결', status: 'waiting' },
  { step: 4, totalSteps: 5, label: '위키 구조 설계', status: 'waiting' },
  { step: 5, totalSteps: 5, label: '위키 문서 작성', status: 'waiting' },
];

export { INITIAL_STEPS };

export const useAppStore = create<AppState>((set) => ({
  notes: [],
  selectedNotes: [],
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
  updateNote: (id, data) =>
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...data } : n)),
    })),
  deleteNote: (id) =>
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedNotes: s.selectedNotes.filter((sid) => sid !== id),
    })),
  toggleSelectNote: (id) =>
    set((s) => ({
      selectedNotes: s.selectedNotes.includes(id)
        ? s.selectedNotes.filter((sid) => sid !== id)
        : [...s.selectedNotes, id],
    })),
  clearSelection: () => set({ selectedNotes: [] }),
  selectAll: () =>
    set((s) => ({ selectedNotes: s.notes.map((n) => n.id) })),

  wikis: [],
  setWikis: (wikis) => set({ wikis }),
  addWiki: (wiki) => set((s) => ({ wikis: [wiki, ...s.wikis] })),
  updateWiki: (id, data) =>
    set((s) => ({
      wikis: s.wikis.map((w) => (w.id === id ? { ...w, ...data } : w)),
    })),

  // legacy merge
  mergeProgress: [],
  isMerging: false,
  setMergeProgress: (mergeProgress) => set({ mergeProgress }),
  updateMergeStep: (step, status) =>
    set((s) => ({
      mergeProgress: s.mergeProgress.map((p) =>
        p.step === step ? { ...p, status } : p
      ),
    })),
  setIsMerging: (isMerging) => set({ isMerging }),

  // 전역 머지 상태
  mergeStatus: null,
  setMergeStatus: (mergeStatus) => set({ mergeStatus }),
  updateMergeStatusStep: (step, status) =>
    set((s) => {
      if (!s.mergeStatus) return s;
      return {
        mergeStatus: {
          ...s.mergeStatus,
          steps: s.mergeStatus.steps.map((p) =>
            p.step === step ? { ...p, status } : p
          ),
        },
      };
    }),

  // 위키화 완료 메모 추적
  wikifiedNoteIds: new Set<string>(),
  addWikifiedNotes: (noteIds) =>
    set((s) => ({
      wikifiedNoteIds: new Set([...s.wikifiedNoteIds, ...noteIds]),
    })),
  clearWikifiedNotes: () => set({ wikifiedNoteIds: new Set<string>() }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
