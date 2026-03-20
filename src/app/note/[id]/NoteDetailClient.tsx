'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { ArrowLeft, Edit, Trash2, Tag, Clock, FileText, Network, Image, Upload } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';

const TextEditor = dynamic(() => import('@/components/editors/TextEditor').then(m => m.TextEditor), { ssr: false });
const MindmapEditor = dynamic(() => import('@/components/editors/MindmapEditor').then(m => m.MindmapEditor), { ssr: false });

interface Props {
  note: Note & { note_images?: Array<{ public_url: string; annotated_url?: string }> };
  userId: string;
}

const typeIcons = {
  text: FileText,
  mindmap: Network,
  image: Image,
  file: Upload,
};

const typeColors = {
  text: 'text-blue-600',
  mindmap: 'text-purple-600',
  image: 'text-green-600',
  file: 'text-orange-600',
};

export function NoteDetailClient({ note, userId }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      toast.success('메모가 삭제되었습니다.');
      router.push('/dashboard');
    } catch {
      toast.error('삭제에 실패했습니다.');
      setDeleting(false);
    }
  };

  if (editing && note.note_type === 'text') {
    return (
      <TextEditor
        userId={userId}
        onBack={() => setEditing(false)}
        onSave={() => { setEditing(false); router.refresh(); }}
        initialTitle={note.title}
        initialContent={note.content || ''}
        noteId={note.id}
      />
    );
  }

  if (editing && note.note_type === 'mindmap') {
    return (
      <MindmapEditor
        userId={userId}
        onBack={() => setEditing(false)}
        onSave={() => { setEditing(false); router.refresh(); }}
        initialTitle={note.title}
        initialContent={note.content || ''}
        noteId={note.id}
      />
    );
  }

  const TypeIcon = typeIcons[note.note_type];
  const typeColor = typeColors[note.note_type];

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/dashboard')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setEditing(true)}
          className="btn-secondary"
          disabled={note.note_type === 'image' || note.note_type === 'file'}
        >
          <Edit className="w-4 h-4 mr-2" />
          편집
        </button>
        <button onClick={handleDelete} disabled={deleting} className="btn-danger">
          <Trash2 className="w-4 h-4 mr-2" />
          삭제
        </button>
      </div>

      {/* Note card */}
      <div className="card p-8">
        {/* Meta */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800`}>
            <TypeIcon className={`w-5 h-5 ${typeColor}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              {formatRelativeTime(note.updated_at)}
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">{note.title}</h1>

        {/* Tags */}
        {note.tags && note.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {note.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-3 py-1 rounded-full">
                <Tag className="w-3 h-3" />#{tag}
              </span>
            ))}
          </div>
        )}

        <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
          {/* Text note */}
          {note.note_type === 'text' && (
            <div className="prose-wiki" dangerouslySetInnerHTML={{ __html: note.content || '' }} />
          )}

          {/* Mindmap note */}
          {note.note_type === 'mindmap' && (
            <div>
              {note.content && (() => {
                try {
                  const data = JSON.parse(note.content);
                  const renderNode = (node: { topic: string; children?: Array<{ id: string; topic: string; children?: Array<{ id: string; topic: string }> }>; id?: string }, depth = 0): React.ReactNode => (
                    <div key={node.id || node.topic} style={{ marginLeft: depth * 24 }} className="mb-2">
                      <span className={`inline-block px-3 py-1 rounded-lg text-sm font-medium ${depth === 0 ? 'bg-primary-600 text-white text-base' : depth === 1 ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                        {node.topic}
                      </span>
                      {node.children?.map((child) => renderNode(child, depth + 1))}
                    </div>
                  );
                  return <div>{renderNode(data.nodeData)}</div>;
                } catch {
                  return <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl text-sm">{note.content}</pre>;
                }
              })()}
            </div>
          )}

          {/* Image note */}
          {note.note_type === 'image' && (
            <div className="space-y-4">
              {note.note_images?.map((img, i) => (
                <div key={i}>
                  <img
                    src={img.annotated_url || img.public_url}
                    alt="annotated"
                    className="max-w-full rounded-xl shadow-md"
                  />
                </div>
              ))}
              {note.content && (
                <div className="prose-wiki">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* File note */}
          {note.note_type === 'file' && (
            <div className="prose-wiki">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content || ''}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
