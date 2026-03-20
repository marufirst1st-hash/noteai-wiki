'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NoteType } from '@/types';
import { FileText, Network, Image, Upload, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

const TextEditor = dynamic(() => import('@/components/editors/TextEditor').then(m => m.TextEditor), { ssr: false });
const MindmapEditor = dynamic(() => import('@/components/editors/MindmapEditor').then(m => m.MindmapEditor), { ssr: false });
const ImageEditor = dynamic(() => import('@/components/editors/ImageEditor').then(m => m.ImageEditor), { ssr: false });
const FileEditor = dynamic(() => import('@/components/editors/FileEditor').then(m => m.FileEditor), { ssr: false });

const noteTypes = [
  {
    type: 'text' as NoteType,
    icon: FileText,
    title: '텍스트 메모',
    desc: 'TipTap 리치 에디터 - 헤딩, 리스트, 코드블록, 표 지원',
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
  },
  {
    type: 'mindmap' as NoteType,
    icon: Network,
    title: '마인드맵',
    desc: 'Mind Elixir - 아이디어를 시각적으로 구조화',
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-950',
    border: 'border-purple-200 dark:border-purple-800',
  },
  {
    type: 'image' as NoteType,
    icon: Image,
    title: '이미지 어노테이션',
    desc: 'Fabric.js - 이미지에 화살표, 텍스트, 도형 추가',
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-200 dark:border-green-800',
  },
  {
    type: 'file' as NoteType,
    icon: Upload,
    title: '파일 분석',
    desc: 'Excel/CSV/PDF 업로드 → AI 자동 분석',
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-950',
    border: 'border-orange-200 dark:border-orange-800',
  },
];

interface Props {
  userId: string;
}

export function NoteNewClient({ userId }: Props) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<NoteType | null>(null);

  if (!selectedType) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">새 메모 작성</h1>
            <p className="text-sm text-gray-500 mt-0.5">메모 타입을 선택하세요</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {noteTypes.map(({ type, icon: Icon, title, desc, color, bg, border }) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={cn(
                'text-left p-6 rounded-xl border-2 transition-all hover:shadow-md group',
                bg, border
              )}
            >
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-white dark:bg-gray-900 shadow-sm group-hover:scale-110 transition-transform')}>
                <Icon className={cn('w-6 h-6', color)} />
              </div>
              <h3 className={cn('font-bold text-lg mb-2', color)}>{title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{desc}</p>
              <div className={cn('flex items-center gap-1 mt-4 text-sm font-medium', color)}>
                선택하기 <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const EditorProps = {
    userId,
    onBack: () => setSelectedType(null),
    onSave: (noteId: string) => router.push(`/note/${noteId}`),
  };

  return (
    <div className="h-full">
      {selectedType === 'text' && <TextEditor {...EditorProps} />}
      {selectedType === 'mindmap' && <MindmapEditor {...EditorProps} />}
      {selectedType === 'image' && <ImageEditor {...EditorProps} />}
      {selectedType === 'file' && <FileEditor {...EditorProps} />}
    </div>
  );
}
