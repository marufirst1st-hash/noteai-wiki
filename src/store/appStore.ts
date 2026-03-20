import { create } from 'zustand';
import { Note, WikiPage, MergeProgress } from '@/types';

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

  // Merge
  mergeProgress: MergeProgress[];
  isMerging: boolean;
  setMergeProgress: (progress: MergeProgress[]) => void;
  updateMergeStep: (step: number, status: MergeProgress['status']) => void;
  setIsMerging: (isMerging: boolean) => void;

  // UI
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

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

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
