'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TableExtension from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  CheckSquare, Quote, Minus, Table, Image, Link2, Heading1,
  Heading2, Heading3, Undo, Redo, ArrowLeft, Save, Tag
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  onBack: () => void;
  onSave: (noteId: string) => void;
  initialTitle?: string;
  initialContent?: string;
  noteId?: string;
}

function ToolbarButton({ onClick, active, children, title }: {
  onClick: () => void; active?: boolean; children: React.ReactNode; title?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={cn(
        'p-1.5 rounded text-sm transition-colors',
        active
          ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      )}
    >
      {children}
    </button>
  );
}

export function TextEditor({ userId, onBack, onSave, initialTitle = '', initialContent = '', noteId }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExtension,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableExtension.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Color,
      TextStyle,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: '내용을 입력하세요...' }),
    ],
    content: initialContent || '',
    editorProps: {
      attributes: { class: 'ProseMirror focus:outline-none p-4 min-h-[400px]' },
    },
  });

  const addTag = () => {
    const tag = tagInput.trim().replace(/^#/, '');
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('제목을 입력하세요.'); return; }
    setSaving(true);
    try {
      const content = editor?.getHTML() || '';
      const payload = {
        title: title.trim(),
        content,
        note_type: 'text',
        tags,
        metadata: {},
      };

      let savedId = noteId;
      if (noteId) {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('저장 실패');
      } else {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('저장 실패');
        const data = await res.json();
        savedId = data.id;
      }

      toast.success('저장되었습니다!');
      onSave(savedId!);
    } catch (err) {
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const insertImage = () => {
    const url = prompt('이미지 URL을 입력하세요:');
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  };

  const setLink = () => {
    const url = prompt('링크 URL:');
    if (url) editor?.chain().focus().setLink({ href: url }).run();
  };

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 text-xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
          placeholder="메모 제목..."
        />
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          <Save className="w-4 h-4 mr-2" />
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <Tag className="w-4 h-4 text-gray-400" />
        <div className="flex flex-wrap gap-1.5 flex-1">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full">
              #{tag}
              <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-red-500">×</button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
            placeholder="태그 추가..."
            className="text-xs bg-transparent border-none outline-none text-gray-600 dark:text-gray-400 placeholder:text-gray-400 min-w-[100px]"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="굵게"><Bold className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="기울임"><Italic className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="취소선"><Strikethrough className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="코드"><Code className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="제목 1"><Heading1 className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="제목 2"><Heading2 className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="제목 3"><Heading3 className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="목록"><List className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="번호 목록"><ListOrdered className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="체크리스트"><CheckSquare className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="인용"><Quote className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선"><Minus className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()} title="표"><Table className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={insertImage} title="이미지"><Image className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="링크"><Link2 className="w-4 h-4" /></ToolbarButton>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="실행 취소"><Undo className="w-4 h-4" /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="다시 실행"><Redo className="w-4 h-4" /></ToolbarButton>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
