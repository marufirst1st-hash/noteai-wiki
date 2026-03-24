'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export function WikiDeleteButton({ wikiId }: { wikiId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 4000);
      return;
    }
    setDeleting(true);
    await supabase.from('note_wiki_links').delete().eq('wiki_id', wikiId);
    await supabase.from('wiki_history').delete().eq('wiki_id', wikiId);
    const { error } = await supabase.from('wiki_pages').delete().eq('id', wikiId);
    if (error) {
      toast.error('삭제 실패: ' + error.message);
      setDeleting(false);
      setConfirm(false);
      return;
    }
    toast.success('위키가 삭제되었습니다.');
    router.refresh();
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
        confirm
          ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
          : 'text-red-500 border border-red-200 hover:bg-red-50 dark:hover:bg-red-950 dark:border-red-800'
      }`}
    >
      <Trash2 className="w-4 h-4" />
      {deleting ? '삭제 중...' : confirm ? '한 번 더 클릭하여 확인' : '위키 삭제'}
    </button>
  );
}
