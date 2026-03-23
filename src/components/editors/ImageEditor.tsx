'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Save, Upload, ArrowRight, Type, Square, Circle, Pen, Undo, Redo, Minus, Plus, Tag } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

interface Props {
  userId: string;
  onBack: () => void;
  onSave: (noteId: string) => void;
  noteId?: string;
  initialTitle?: string;
}

type DrawTool = 'select' | 'arrow' | 'text' | 'rect' | 'circle' | 'pen';

export function ImageEditor({ userId, onBack, onSave, noteId, initialTitle = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<unknown>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [title, setTitle] = useState(initialTitle);
  const [tool, setTool] = useState<DrawTool>('select');
  const [color, setColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [fabricLoaded, setFabricLoaded] = useState(false);
  const supabase = createClient();

  // Load fabric dynamically
  useEffect(() => {
    import('fabric').then((f) => {
      setFabricLoaded(true);
    });
  }, []);

  const initCanvas = useCallback(async (imgUrl: string) => {
    if (!canvasRef.current || !imgUrl) return;
    const { fabric } = await import('fabric');
    
    if (fabricRef.current) {
      (fabricRef.current as { dispose: () => void }).dispose();
    }

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
    });
    fabricRef.current = canvas;

    // Load image
    fabric.Image.fromURL(imgUrl, (img) => {
      const scale = Math.min(800 / (img.width || 800), 600 / (img.height || 600));
      img.scale(scale);
      img.set({ left: 0, top: 0, selectable: false });
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
    }, { crossOrigin: 'anonymous' });
  }, []);

  useEffect(() => {
    if (imageUrl && fabricLoaded) {
      initCanvas(imageUrl);
    }
  }, [imageUrl, fabricLoaded, initCanvas]);

  // Tool change
  useEffect(() => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current as {
      isDrawingMode: boolean;
      freeDrawingBrush: { color: string; width: number };
      renderAll: () => void;
    };
    
    canvas.isDrawingMode = tool === 'pen';
    if (tool === 'pen') {
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = strokeWidth;
    }
    canvas.renderAll();
  }, [tool, color, strokeWidth]);

  const addShape = async (type: string) => {
    if (!fabricRef.current) return;
    const { fabric } = await import('fabric');
    const canvas = fabricRef.current as {
      add: (obj: unknown) => void;
      renderAll: () => void;
      getActiveObject: () => unknown;
      remove: (obj: unknown) => void;
    };

    if (type === 'rect') {
      const rect = new fabric.Rect({
        left: 100, top: 100, width: 150, height: 100,
        fill: 'transparent', stroke: color, strokeWidth,
      });
      canvas.add(rect);
    } else if (type === 'circle') {
      const circle = new fabric.Circle({
        left: 100, top: 100, radius: 60,
        fill: 'transparent', stroke: color, strokeWidth,
      });
      canvas.add(circle);
    } else if (type === 'text') {
      const text = new fabric.IText('텍스트 입력', {
        left: 100, top: 100, fill: color, fontSize: 20, fontWeight: 'bold',
      });
      canvas.add(text);
      (text as { enterEditing: () => void }).enterEditing();
    } else if (type === 'arrow') {
      const line = new fabric.Line([100, 100, 250, 250], {
        stroke: color, strokeWidth, selectable: true,
      });
      canvas.add(line);
    }
    canvas.renderAll();
  };

  const handleToolClick = (t: DrawTool) => {
    setTool(t);
    if (t === 'rect') addShape('rect');
    else if (t === 'circle') addShape('circle');
    else if (t === 'text') addShape('text');
    else if (t === 'arrow') addShape('arrow');
  };

  const handleUndo = async () => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current as {
      getObjects: () => unknown[];
      remove: (obj: unknown) => void;
      renderAll: () => void;
    };
    const objects = canvas.getObjects();
    if (objects.length > 0) {
      canvas.remove(objects[objects.length - 1]);
      canvas.renderAll();
    }
  };

  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('images').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('images').getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (err) {
      toast.error('이미지 업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('제목을 입력하세요.'); return; }
    if (!imageUrl) { toast.error('이미지를 업로드하세요.'); return; }
    setSaving(true);
    try {
      let annotatedUrl = imageUrl;
      let annotationData: Record<string, unknown> = {};

      if (fabricRef.current) {
        const canvas = fabricRef.current as {
          toDataURL: (opts: { format: string; quality: number }) => string;
          toJSON: () => Record<string, unknown>;
        };
        const dataUrl = canvas.toDataURL({ format: 'png', quality: 0.9 });
        annotationData = canvas.toJSON();

        // Upload annotated image
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const annotPath = `${userId}/annotated-${Date.now()}.png`;
        const { error: uploadErr } = await supabase.storage.from('annotated').upload(annotPath, blob);
        if (!uploadErr) {
          const { data } = supabase.storage.from('annotated').getPublicUrl(annotPath);
          annotatedUrl = data.publicUrl;
        }
      }

      // Save note
      const payload = {
        title: title.trim(),
        content: `![annotated](${annotatedUrl})`,
        note_type: 'image',
        tags,
        metadata: { originalUrl: imageUrl, annotationData },
      };

      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();

      // Save note_images record (DB 컬럼명: original_url, fabric_json)
      await supabase.from('note_images').insert({
        note_id: data.id,
        original_url: imageUrl,
        annotated_url: annotatedUrl,
        fabric_json: annotationData,
        ai_description: title,
        file_size: 0,
      });

      toast.success('이미지 메모가 저장되었습니다!');
      onSave(data.id);
    } catch (err) {
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().replace(/^#/, '');
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagInput('');
  };

  const tools: { id: DrawTool; icon: React.ReactNode; label: string }[] = [
    { id: 'select', icon: <span className="text-xs font-bold">S</span>, label: '선택' },
    { id: 'arrow', icon: <ArrowRight className="w-4 h-4" />, label: '화살표' },
    { id: 'text', icon: <Type className="w-4 h-4" />, label: '텍스트' },
    { id: 'rect', icon: <Square className="w-4 h-4" />, label: '사각형' },
    { id: 'circle', icon: <Circle className="w-4 h-4" />, label: '원' },
    { id: 'pen', icon: <Pen className="w-4 h-4" />, label: '펜' },
  ];

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
          placeholder="이미지 메모 제목..."
        />
        <button onClick={handleSave} disabled={saving || !imageUrl} className="btn-primary">
          <Save className="w-4 h-4 mr-2" />
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <Tag className="w-4 h-4 text-gray-400" />
        <div className="flex flex-wrap gap-1.5 flex-1">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
              #{tag}
              <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-red-500">×</button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="태그 추가..."
            className="text-xs bg-transparent border-none outline-none text-gray-600 dark:text-gray-400 placeholder:text-gray-400 min-w-[100px]"
          />
        </div>
      </div>

      {!imageUrl ? (
        /* Upload Area */
        <div className="flex-1 flex items-center justify-center p-8">
          <label className="flex flex-col items-center gap-4 p-12 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl cursor-pointer hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950 transition-all">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-white">이미지 업로드</p>
              <p className="text-sm text-gray-500 mt-1">PNG, JPG, GIF, WEBP 지원</p>
            </div>
            {uploading && <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadImage(f); }}
            />
          </label>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-col gap-2 p-3 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {tools.map((t) => (
              <button
                key={t.id}
                onClick={() => handleToolClick(t.id)}
                title={t.label}
                className={`p-2.5 rounded-lg transition-colors ${
                  tool === t.id ? 'bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {t.icon}
              </button>
            ))}
            <div className="h-px bg-gray-200 dark:bg-gray-700" />
            <button onClick={handleUndo} title="실행 취소" className="p-2.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <Undo className="w-4 h-4" />
            </button>
            <div className="h-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 px-1">색상</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 px-1">두께</label>
              <div className="flex items-center gap-1">
                <button onClick={() => setStrokeWidth(Math.max(1, strokeWidth - 1))} className="p-1"><Minus className="w-3 h-3" /></button>
                <span className="text-xs w-4 text-center">{strokeWidth}</span>
                <button onClick={() => setStrokeWidth(Math.min(20, strokeWidth + 1))} className="p-1"><Plus className="w-3 h-3" /></button>
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 flex items-start justify-start p-4">
            <canvas ref={canvasRef} className="shadow-xl rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
