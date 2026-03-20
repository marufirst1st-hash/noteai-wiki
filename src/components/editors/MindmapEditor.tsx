'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Plus, Minus, RefreshCw, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

interface MindNode {
  id: string;
  topic: string;
  children?: MindNode[];
  style?: { background?: string; color?: string };
}

interface MindData {
  nodeData: MindNode;
}

interface Props {
  userId: string;
  onBack: () => void;
  onSave: (noteId: string) => void;
  initialTitle?: string;
  initialContent?: string;
  noteId?: string;
}

// Simple canvas-based mindmap
function SimpleMindmap({ data, onChange }: { data: MindData; onChange: (d: MindData) => void }) {
  const [nodes, setNodes] = useState<MindNode[]>(data.nodeData.children || []);
  const [rootTopic, setRootTopic] = useState(data.nodeData.topic);
  const [editingId, setEditingId] = useState<string | null>(null);

  const addNode = () => {
    const newNode: MindNode = {
      id: Date.now().toString(),
      topic: '새 노드',
      children: [],
      style: { background: '#6366f1', color: '#fff' },
    };
    const updated = [...nodes, newNode];
    setNodes(updated);
    onChange({ nodeData: { ...data.nodeData, topic: rootTopic, children: updated } });
  };

  const removeNode = (id: string) => {
    const updated = nodes.filter((n) => n.id !== id);
    setNodes(updated);
    onChange({ nodeData: { ...data.nodeData, topic: rootTopic, children: updated } });
  };

  const updateNodeTopic = (id: string, topic: string) => {
    const updated = nodes.map((n) => n.id === id ? { ...n, topic } : n);
    setNodes(updated);
    onChange({ nodeData: { ...data.nodeData, topic: rootTopic, children: updated } });
  };

  const addChildNode = (parentId: string) => {
    const newChild: MindNode = {
      id: Date.now().toString(),
      topic: '하위 노드',
      children: [],
      style: { background: '#8b5cf6', color: '#fff' },
    };
    const updated = nodes.map((n) =>
      n.id === parentId ? { ...n, children: [...(n.children || []), newChild] } : n
    );
    setNodes(updated);
    onChange({ nodeData: { ...data.nodeData, topic: rootTopic, children: updated } });
  };

  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

  const changeColor = (id: string, color: string) => {
    const updated = nodes.map((n) => n.id === id ? { ...n, style: { ...n.style, background: color } } : n);
    setNodes(updated);
    onChange({ nodeData: { ...data.nodeData, topic: rootTopic, children: updated } });
  };

  return (
    <div className="flex-1 overflow-auto p-8 bg-gray-50 dark:bg-gray-950">
      {/* Root Node */}
      <div className="flex justify-center mb-8">
        <div className="relative">
          <input
            value={rootTopic}
            onChange={(e) => {
              setRootTopic(e.target.value);
              onChange({ nodeData: { ...data.nodeData, topic: e.target.value, children: nodes } });
            }}
            className="px-6 py-3 rounded-2xl bg-primary-600 text-white font-bold text-lg text-center border-none outline-none min-w-[200px] shadow-lg"
            placeholder="중심 주제"
          />
        </div>
      </div>

      {/* Branches */}
      <div className="relative">
        {/* Connection lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          {nodes.map((node, i) => {
            const x1 = '50%';
            const y1 = '0';
            const x2 = `${(i / (nodes.length - 1 || 1)) * 80 + 10}%`;
            const y2 = '80px';
            return (
              <line key={node.id} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#6366f1" strokeWidth="2" strokeDasharray="5,5" opacity="0.5" />
            );
          })}
        </svg>

        <div className="flex flex-wrap justify-center gap-6 relative z-10">
          {nodes.map((node) => (
            <div key={node.id} className="flex flex-col items-center gap-2">
              <div
                className="relative group rounded-xl px-4 py-2 text-white font-medium text-sm shadow-md min-w-[120px] text-center"
                style={{ background: node.style?.background || '#6366f1' }}
              >
                {editingId === node.id ? (
                  <input
                    autoFocus
                    value={node.topic}
                    onChange={(e) => updateNodeTopic(node.id, e.target.value)}
                    onBlur={() => setEditingId(null)}
                    className="bg-transparent text-white border-none outline-none text-sm text-center w-full"
                  />
                ) : (
                  <span onDoubleClick={() => setEditingId(node.id)}>{node.topic}</span>
                )}
                <div className="absolute -top-2 -right-2 hidden group-hover:flex gap-1">
                  <button
                    onClick={() => removeNode(node.id)}
                    className="w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-600"
                  >×</button>
                </div>
              </div>

              {/* Color picker */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => changeColor(node.id, c)}
                    className="w-4 h-4 rounded-full hover:scale-110 transition-transform"
                    style={{ background: c }}
                  />
                ))}
              </div>

              {/* Children */}
              {node.children && node.children.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center ml-4 mt-2">
                  {node.children.map((child) => (
                    <div
                      key={child.id}
                      className="rounded-lg px-3 py-1.5 text-white text-xs font-medium shadow"
                      style={{ background: child.style?.background || '#8b5cf6' }}
                    >
                      {child.topic}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => addChildNode(node.id)}
                className="text-xs text-gray-400 hover:text-primary-600 transition-colors"
              >
                + 하위
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add Node Button */}
      <div className="flex justify-center mt-8">
        <button
          onClick={addNode}
          className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors"
        >
          <Plus className="w-4 h-4" />
          노드 추가
        </button>
      </div>
    </div>
  );
}

export function MindmapEditor({ userId, onBack, onSave, initialTitle = '', initialContent = '', noteId }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [mindData, setMindData] = useState<MindData>(() => {
    try {
      if (initialContent) return JSON.parse(initialContent);
    } catch {}
    return {
      nodeData: {
        id: 'root',
        topic: title || '중심 주제',
        children: [
          { id: '1', topic: '아이디어 1', children: [], style: { background: '#6366f1', color: '#fff' } },
          { id: '2', topic: '아이디어 2', children: [], style: { background: '#8b5cf6', color: '#fff' } },
        ],
      },
    };
  });

  const handleSave = async () => {
    if (!title.trim()) { toast.error('제목을 입력하세요.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: JSON.stringify(mindData),
        note_type: 'mindmap',
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
      toast.success('마인드맵이 저장되었습니다!');
      onSave(savedId!);
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
          placeholder="마인드맵 제목..."
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
            <span key={tag} className="inline-flex items-center gap-1 text-xs bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
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

      {/* Hint */}
      <div className="px-4 py-2 bg-purple-50 dark:bg-purple-950 border-b border-purple-100 dark:border-purple-900">
        <p className="text-xs text-purple-600 dark:text-purple-400">
          💡 노드를 더블클릭하여 편집 | + 하위 버튼으로 자식 노드 추가 | 색상 점으로 노드 색상 변경
        </p>
      </div>

      {/* Mindmap */}
      <SimpleMindmap data={mindData} onChange={setMindData} />
    </div>
  );
}
