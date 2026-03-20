'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MergeProgress } from '@/types';
import { X, GitMerge, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const MERGE_STEPS: MergeProgress[] = [
  { step: 1, totalSteps: 5, label: '멀티모달 파싱 (텍스트 + 이미지 + 마인드맵)', status: 'waiting' },
  { step: 2, totalSteps: 5, label: '엔티티 추출 (사람/장소/개념/키워드)', status: 'waiting' },
  { step: 3, totalSteps: 5, label: '중복/충돌 해결 및 정보 통합', status: 'waiting' },
  { step: 4, totalSteps: 5, label: '위키 구조 설계 (섹션/TOC 생성)', status: 'waiting' },
  { step: 5, totalSteps: 5, label: '마크다운 위키 문서 작성', status: 'waiting' },
];

interface Props {
  noteIds: string[];
  onClose: () => void;
}

export function MergeModal({ noteIds, onClose }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState<MergeProgress[]>(MERGE_STEPS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wikiTitle, setWikiTitle] = useState('');
  const [done, setDone] = useState(false);
  const [wikiSlug, setWikiSlug] = useState('');
  const [error, setError] = useState('');

  const updateStep = (stepNum: number, status: MergeProgress['status']) => {
    setSteps((prev) => prev.map((s) => s.step === stepNum ? { ...s, status } : s));
  };

  const handleMerge = async () => {
    if (!wikiTitle.trim()) { toast.error('위키 제목을 입력하세요.'); return; }
    setIsProcessing(true);
    setError('');

    try {
      // Step 1 start
      updateStep(1, 'processing');

      const response = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteIds, title: wikiTitle }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '위키 생성 실패');
      }

      // Stream progress
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.step) updateStep(data.step, data.status);
              if (data.slug) setWikiSlug(data.slug);
              if (data.done) setDone(true);
              if (data.error) throw new Error(data.error);
            } catch (e) {
              // skip parse errors
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
      setError(msg);
      setIsProcessing(false);
    }
  };

  const handleViewWiki = () => {
    router.push(`/wiki/${wikiSlug}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-950 rounded-xl flex items-center justify-center">
              <GitMerge className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">위키로 합치기</h2>
              <p className="text-xs text-gray-500">{noteIds.length}개 메모 → 위키 문서</p>
            </div>
          </div>
          {!isProcessing && <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>}
        </div>

        <div className="p-6">
          {!isProcessing && !done ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  위키 제목 *
                </label>
                <input
                  value={wikiTitle}
                  onChange={(e) => setWikiTitle(e.target.value)}
                  className="input-field"
                  placeholder="예: 프로젝트 기획 위키"
                  autoFocus
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Gemini AI가 선택한 {noteIds.length}개의 메모를 분석하여 체계적인 위키 문서를 생성합니다.
                <br />처리 시간: 약 30~60초
              </p>
              <button onClick={handleMerge} className="btn-primary w-full py-3">
                <GitMerge className="w-4 h-4 mr-2" />
                AI 위키 생성 시작
              </button>
            </>
          ) : done ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">위키 생성 완료!</h3>
              <p className="text-sm text-gray-500 mb-6">"{wikiTitle}" 위키가 성공적으로 생성되었습니다.</p>
              <div className="flex gap-3">
                <button onClick={handleViewWiki} className="btn-primary flex-1 py-2.5">
                  위키 보기
                </button>
                <button onClick={onClose} className="btn-secondary flex-1 py-2.5">
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <div>
              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-950 rounded-lg p-3 mb-4 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-3">
                {steps.map((step) => (
                  <div
                    key={step.step}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      step.status === 'processing' ? 'bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800' :
                      step.status === 'done' ? 'bg-green-50 dark:bg-green-950' :
                      step.status === 'error' ? 'bg-red-50 dark:bg-red-950' :
                      'bg-gray-50 dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {step.status === 'done' && <CheckCircle className="w-5 h-5 text-green-600" />}
                      {step.status === 'processing' && <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />}
                      {step.status === 'waiting' && (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                          <span className="text-xs text-gray-400">{step.step}</span>
                        </div>
                      )}
                      {step.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
                    </div>
                    <span className={`text-sm ${
                      step.status === 'processing' ? 'font-medium text-primary-700 dark:text-primary-300' :
                      step.status === 'done' ? 'text-green-700 dark:text-green-300' :
                      step.status === 'error' ? 'text-red-700 dark:text-red-300' :
                      'text-gray-500 dark:text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
