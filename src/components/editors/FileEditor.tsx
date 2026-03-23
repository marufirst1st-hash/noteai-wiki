'use client';

import { useState, useRef } from 'react';
import { ArrowLeft, Save, Upload, FileText, Table, File, Loader2, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  userId: string;
  onBack: () => void;
  onSave: (noteId: string) => void;
  noteId?: string;
  initialTitle?: string;
}

export function FileEditor({ userId, onBack, onSave, noteId, initialTitle = '' }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const parseFile = async (file: File) => {
    setFileName(file.name);
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv' || ext === 'txt' || ext === 'md') {
      const text = await file.text();
      const preview = text.slice(0, 10000);
      setFileContent(preview);
      analyzeContent(preview.slice(0, 5000), file.name);

    } else if (ext === 'pdf') {
      const text = await file.text();
      const cleaned = text.replace(/[^\x20-\x7E\n가-힣ㄱ-ㅎㅏ-ㅣ]/g, ' ').slice(0, 10000);
      setFileContent(cleaned);
      analyzeContent(cleaned.slice(0, 5000), file.name);

    } else if (ext === 'xlsx' || ext === 'xls') {
      // ✅ xlsx는 바이너리 파일 → ArrayBuffer로 읽어야 함
      // ⚠️ xlsx 패키지는 .default가 없으므로 named import 사용
      try {
        const xlsxModule = await import('xlsx');
        // CJS 모듈: read, utils가 최상위에 있음 (default 없음)
        const { read, utils } = xlsxModule.default ?? xlsxModule;
        const arrayBuffer = await file.arrayBuffer();
        const workbook = read(arrayBuffer, { type: 'array' });

        // 모든 시트 데이터 추출
        const sheetsData: string[] = [];
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          // CSV 형식으로 변환
          const csv = utils.sheet_to_csv(worksheet);
          sheetsData.push(`## 시트: ${sheetName}\n${csv}`);
        });

        const combined = sheetsData.join('\n\n');
        const preview = combined.slice(0, 10000);
        setFileContent(preview);
        analyzeContent(preview.slice(0, 5000), file.name);
      } catch (err) {
        console.error('xlsx 파싱 오류:', err);
        toast.error('Excel 파일 파싱에 실패했습니다.');
        const fallback = `파일명: ${file.name}\n크기: ${(file.size / 1024).toFixed(1)} KB\n(파싱 실패 - 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다)`;
        setFileContent(fallback);
        setAnalysis(`## 파일 업로드 완료\n\n**파일명**: ${file.name}\n**크기**: ${(file.size / 1024).toFixed(1)} KB\n\n> Excel 파일을 파싱하는 중 오류가 발생했습니다.`);
      }

    } else {
      // 기타 파일: 텍스트로 읽기 시도
      try {
        const text = await file.text();
        const preview = text.slice(0, 5000);
        setFileContent(preview);
        analyzeContent(preview.slice(0, 3000), file.name);
      } catch {
        const fallback = `파일명: ${file.name}\n크기: ${(file.size / 1024).toFixed(1)} KB\n(텍스트로 읽을 수 없는 파일 형식)`;
        setFileContent(fallback);
        setAnalysis(`## 파일 업로드 완료\n\n**파일명**: ${file.name}\n**크기**: ${(file.size / 1024).toFixed(1)} KB`);
      }
    }
  };

  const analyzeContent = async (content: string, fname: string) => {
    // 내용이 비어있거나 너무 짧으면 로컬 분석으로 대체
    const cleanContent = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
    if (!cleanContent || cleanContent.length < 10) {
      setAnalysis(`## 파일 분석 결과\n\n**파일명**: ${fname}\n**문자 수**: ${content.length}\n\n내용이 너무 짧거나 분석할 수 없는 형식입니다.`);
      return;
    }

    setAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cleanContent, fileName: fname }),
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysis(data.analysis || '');
      } else {
        // API 실패 시 로컬 분석으로 폴백
        const lines = cleanContent.split('\n').filter((l) => l.trim());
        setAnalysis(
          `## 파일 분석 결과\n\n**파일명**: ${fname}\n**라인 수**: ${lines.length}\n**문자 수**: ${cleanContent.length}\n\n### 내용 미리보기\n\`\`\`\n${cleanContent.slice(0, 500)}\n\`\`\``
        );
      }
    } catch {
      setAnalysis(
        `## 파일 업로드 완료\n\n**파일명**: ${fname}\n**크기**: ${(content.length / 1024).toFixed(1)} KB`
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('제목을 입력하세요.'); return; }
    if (!fileContent) { toast.error('파일을 업로드하세요.'); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content: analysis || fileContent,
        note_type: 'file',
        tags,
        metadata: { fileName, rawContent: fileContent.slice(0, 1000) },
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
        <button onClick={handleSave} disabled={saving || !fileContent} className="btn-primary">
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

      <div className="flex-1 overflow-y-auto p-6">
        {/* Upload Zone */}
        <label className={`flex flex-col items-center gap-4 p-10 border-2 border-dashed rounded-2xl cursor-pointer transition-all mb-6 ${
          fileContent
            ? 'border-green-400 bg-green-50 dark:bg-green-950'
            : 'border-gray-300 dark:border-gray-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950'
        }`}>
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center">
            {fileName ? getFileIcon(fileName) : <Upload className="w-8 h-8 text-orange-600" />}
          </div>
          {fileName ? (
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-white">{fileName}</p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">✓ 파일 로드 완료</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-white">파일 업로드</p>
              <p className="text-sm text-gray-500 mt-1">Excel, CSV, PDF, TXT 지원 (최대 10MB)</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.txt,.md"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
          />
        </label>

        {/* Analysis */}
        {analyzing && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-xl mb-4">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="text-sm text-blue-700 dark:text-blue-300">AI가 파일을 분석하고 있습니다...</span>
          </div>
        )}

        {analysis && (
          <div className="prose-wiki">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600" />
              </span>
              AI 분석 결과
            </h3>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
              {analysis}
            </div>
          </div>
        )}

        {fileContent && !analysis && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">파일 내용 미리보기</h3>
            <pre className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-h-[300px] overflow-y-auto">
              {fileContent.slice(0, 2000)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
