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
  const [analysis, setAnalysis] = useState('');
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showRawContent, setShowRawContent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 파일 업로드 & 파싱 ──────────────────────────────────
  const handleFileChange = async (file: File) => {
    setFileName(file.name);
    setFileSize(file.size);
    setParseResult(null);
    setParseError('');
    setAnalysis('');

    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const supported = ['pdf', 'xlsx', 'xls', 'csv', 'txt', 'md'];

    if (!supported.includes(ext)) {
      setParseError(`지원하지 않는 파일 형식입니다. (지원: ${supported.join(', ')})`);
      return;
    }

    setParsing(true);
    try {
      // 서버사이드 파싱 API 호출 (PDF/Excel 실제 텍스트 추출)
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

      // 파싱 성공 → AI 분석 시작
      await analyzeContent(data.text, file.name, data);
    } catch (err) {
      setParseError('파일 업로드 중 오류가 발생했습니다.');
      console.error('파일 파싱 오류:', err);
    } finally {
      setParsing(false);
    }
  };

  // ── AI 분석 ──────────────────────────────────────────────
  const analyzeContent = async (text: string, fname: string, parsed: ParseResult) => {
    if (!text?.trim() || text.trim().length < 20) {
      setAnalysis(`## 파일 분석 결과\n\n**파일명**: ${fname}\n\n추출된 텍스트가 너무 짧습니다.`);
      return;
    }

    setAnalyzing(true);
    try {
      // AI 분석에는 앞 5000자만 전송 (토큰 절약)
      const contentForAI = text.slice(0, 5000);

      const res = await fetch('/api/analyze-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentForAI, fileName: fname }),
      });

      if (res.ok) {
        const data = await res.json();
        setAnalysis(data.analysis || '');
      } else {
        // API 실패 시 기본 분석
        setAnalysis(buildFallbackAnalysis(fname, parsed));
      }
    } catch {
      setAnalysis(buildFallbackAnalysis(fname, parsed));
    } finally {
      setAnalyzing(false);
    }
  };

  // 폴백 분석 (AI 실패 시)
  const buildFallbackAnalysis = (fname: string, parsed: ParseResult): string => {
    let meta = `## 파일 분석 결과\n\n**파일명**: ${fname}\n**문자 수**: ${parsed.charCount.toLocaleString()}자\n`;
    if (parsed.pageCount) meta += `**페이지 수**: ${parsed.pageCount}페이지\n`;
    if (parsed.sheetCount) {
      meta += `**시트 수**: ${parsed.sheetCount}개\n`;
      parsed.sheets?.forEach((s) => {
        meta += `  - ${s.name}: ${s.rowCount}행 × ${s.colCount}열\n`;
      });
    }
    if (parsed.lineCount) meta += `**라인 수**: ${parsed.lineCount.toLocaleString()}줄\n`;
    meta += `\n### 내용 미리보기\n\`\`\`\n${parsed.preview}\n\`\`\``;
    return meta;
  };

  // ── 저장 ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) { toast.error('제목을 입력하세요.'); return; }
    if (!parseResult) { toast.error('파일을 업로드하세요.'); return; }

    setSaving(true);
    try {
      // content = AI 분석 결과 + 구분선 + 실제 원본 텍스트 전체
      // 위키화 시 원본 데이터를 AI가 읽을 수 있도록 전체 저장
      const rawText = parseResult.text;
      const maxRaw = 50000; // 최대 5만자 저장 (위키화 활용)

      let contentToSave = '';
      if (analysis) {
        contentToSave = analysis;
        // 원본 데이터도 함께 저장 (위키화 시 참조용)
        contentToSave += `\n\n---\n## 원본 데이터\n\`\`\`\n${rawText.slice(0, maxRaw)}\n\`\`\``;
      } else {
        contentToSave = rawText.slice(0, maxRaw);
      }

      // 파일 메타 정보
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
        content: contentToSave,
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
      toast.success('파일 메모가 저장되었습니다!');
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

  const isReady = !!parseResult && !parsing && !analyzing;

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
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  ✓ 추출 완료 · {parseResult.charCount.toLocaleString()}자
                  {parseResult.pageCount && ` · ${parseResult.pageCount}페이지`}
                  {parseResult.sheetCount && ` · ${parseResult.sheetCount}시트`}
                </p>
              )}
              {parseError && <p className="text-sm text-red-600 mt-1">⚠ {parseError}</p>}
            </div>
          ) : (
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-white">파일 업로드</p>
              <p className="text-sm text-gray-500 mt-1">PDF, Excel, CSV, TXT 지원 (최대 20MB)</p>
              <p className="text-xs text-gray-400 mt-1">실제 파일 내용을 추출하여 AI가 분석합니다</p>
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

        {/* ── AI 분석 중 ── */}
        {analyzing && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-xl">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">AI 분석 중...</p>
              <p className="text-xs text-blue-500 mt-0.5">Gemini가 파일 내용을 분석하고 있습니다</p>
            </div>
          </div>
        )}

        {/* ── AI 분석 결과 ── */}
        {analysis && (
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
              </span>
              AI 분석 결과
            </h3>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {analysis}
            </div>
          </div>
        )}

        {/* ── 원본 데이터 미리보기 (토글) ── */}
        {parseResult && (
          <div>
            <button
              onClick={() => setShowRawContent((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {showRawContent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              추출된 원본 텍스트 보기 ({parseResult.charCount.toLocaleString()}자)
            </button>
            {showRawContent && (
              <pre className="mt-2 bg-gray-50 dark:bg-gray-900 rounded-xl p-4 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                {parseResult.text.slice(0, 3000)}
                {parseResult.text.length > 3000 && `\n\n... (${(parseResult.text.length - 3000).toLocaleString()}자 더 있음)`}
              </pre>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
