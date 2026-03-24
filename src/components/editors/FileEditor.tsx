'use client';

import { useState, useRef } from 'react';
import { ArrowLeft, Save, Upload, FileText, Table, File, Loader2, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  userId: string;
  onBack: () => void;
  onSave: (noteId: string) => void;
  noteId?: string;
  initialTitle?: string;
}

interface ParseResult {
  type: string;
  text: string;
  charCount: number;
  pageCount?: number;
  sheetCount?: number;
  sheets?: { name: string; rowCount: number; colCount: number }[];
  lineCount?: number;
  preview: string;
}

export function FileEditor({ userId, onBack, onSave, noteId, initialTitle = '' }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showRawContent, setShowRawContent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 파일 업로드 & 파싱 (텍스트 추출만) ─────────────────
  const handleFileChange = async (file: File) => {
    setFileName(file.name);
    setFileSize(file.size);
    setParseResult(null);
    setParseError('');

    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const supported = ['pdf', 'xlsx', 'xls', 'csv', 'txt', 'md'];

    if (!supported.includes(ext)) {
      setParseError(`지원하지 않는 파일 형식입니다. (지원: ${supported.join(', ')})`);
      return;
    }

    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setParseError(data.error || '파일 파싱 실패');
        return;
      }

      setParseResult(data as ParseResult);
      toast.success('파일 내용을 성공적으로 추출했습니다.');
    } catch (err) {
      setParseError('파일 업로드 중 오류가 발생했습니다.');
      console.error('파일 파싱 오류:', err);
    } finally {
      setParsing(false);
    }
  };

  // ── 저장: 원본 텍스트 전체를 그대로 저장 ────────────────
  // AI 분석은 여기서 하지 않음 — 위키화할 때 AI가 원본 내용을 직접 읽고 분석
  const handleSave = async () => {
    if (!title.trim()) { toast.error('제목을 입력하세요.'); return; }
    if (!parseResult) { toast.error('파일을 업로드하세요.'); return; }

    setSaving(true);
    try {
      const rawText = parseResult.text.slice(0, 50000);

      const metadata: Record<string, unknown> = {
        fileName,
        fileSize,
        fileType: parseResult.type,
        charCount: parseResult.charCount,
        parsedAt: new Date().toISOString(),
      };
      if (parseResult.pageCount) metadata.pageCount = parseResult.pageCount;
      if (parseResult.sheets) metadata.sheets = parseResult.sheets;

      const payload = {
        title: title.trim(),
        content: rawText,
        note_type: 'file',
        tags,
        metadata,
      };

      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('저장 실패');
      const data = await res.json();
      toast.success('파일이 저장되었습니다. 위키화 시 AI가 내용을 자동 분석합니다.');
      onSave(data.id);
    } catch {
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

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') return <Table className="w-8 h-8 text-green-600" />;
    if (ext === 'pdf') return <FileText className="w-8 h-8 text-red-600" />;
    return <File className="w-8 h-8 text-blue-600" />;
  };

  const isReady = !!parseResult && !parsing;

  // userId, noteId 사용 억제 (향후 확장용)
  void userId; void noteId;

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
          placeholder="파일 메모 제목..."
        />
        <button
          onClick={handleSave}
          disabled={saving || !isReady}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <Tag className="w-4 h-4 text-gray-400" />
        <div className="flex flex-wrap gap-1.5 flex-1">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">
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

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── 업로드 존 ── */}
        <label className={`flex flex-col items-center gap-4 p-10 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
          parseResult
            ? 'border-green-400 bg-green-50 dark:bg-green-950'
            : parseError
            ? 'border-red-400 bg-red-50 dark:bg-red-950'
            : 'border-gray-300 dark:border-gray-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950'
        }`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            parseResult ? 'bg-green-100 dark:bg-green-900' :
            parseError ? 'bg-red-100 dark:bg-red-900' :
            'bg-orange-100 dark:bg-orange-950'
          }`}>
            {parsing
              ? <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              : fileName
              ? getFileIcon(fileName)
              : <Upload className="w-8 h-8 text-orange-600" />
            }
          </div>

          {fileName ? (
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-white">{fileName}</p>
              <p className="text-sm text-gray-500 mt-0.5">{(fileSize / 1024).toFixed(1)} KB</p>
              {parsing && <p className="text-sm text-primary-600 mt-1 animate-pulse">📄 파일 내용 추출 중...</p>}
              {parseResult && !parsing && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    ✓ 전체 추출 완료 · {parseResult.charCount.toLocaleString()}자 전체 보존
                    {parseResult.pageCount && ` · ${parseResult.pageCount}페이지`}
                    {parseResult.sheetCount && ` · ${parseResult.sheetCount}시트`}
                  </p>
                  <p className="text-xs text-gray-400">저장 후 &quot;지식 베이스에 추가&quot; 시 AI가 전체 내용을 분석합니다</p>
                </div>
              )}
              {parseError && <p className="text-sm text-red-600 mt-1">⚠ {parseError}</p>}
            </div>
          ) : (
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-white">파일 업로드</p>
              <p className="text-sm text-gray-500 mt-1">PDF, Excel, CSV, TXT 지원 (최대 20MB)</p>
              <p className="text-xs text-gray-400 mt-1">파일 내용 전체를 추출하여 저장합니다</p>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.txt,.md"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }}
          />
        </label>

        {/* ── 추출된 내용 미리보기 ── */}
        {parseResult && (
          <div>
            <button
              onClick={() => setShowRawContent((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {showRawContent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              추출된 내용 미리보기 ({parseResult.charCount.toLocaleString()}자)
            </button>
            {showRawContent && (
              <pre className="mt-2 bg-gray-50 dark:bg-gray-900 rounded-xl p-4 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap">
                {/* 미리보기는 최대 3000자만 표시 (저장 데이터와 별개 — 실제 저장은 전체 보존) */}
                {parseResult.text.slice(0, 3000)}
                {parseResult.text.length > 3000 && `\n\n─── 미리보기 끝 (총 ${parseResult.charCount.toLocaleString()}자 전체가 저장됨) ───`}
              </pre>
            )}
          </div>
        )}

        {/* ── 안내 ── */}
        {parseResult && (
          <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-950 rounded-xl text-sm">
            <span className="text-lg">💡</span>
            <div className="text-indigo-700 dark:text-indigo-300">
              <p className="font-medium">저장 후 다음 단계</p>
              <p className="text-xs mt-1 text-indigo-500">
                대시보드에서 이 메모를 선택 → <strong>&quot;지식 베이스에 추가&quot;</strong> 클릭<br />
                AI가 파일 내용을 직접 읽고 분석하여 위키로 통합합니다.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
