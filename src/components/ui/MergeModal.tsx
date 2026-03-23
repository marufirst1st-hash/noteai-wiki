'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MergeProgress } from '@/types';
import { X, GitMerge, CheckCircle, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

const MERGE_STEPS: MergeProgress[] = [
  { step: 1, totalSteps: 5, label: '멀티모달 파싱 (텍스트 + 이미지 + 마인드맵)', status: 'waiting' },
  { step: 2, totalSteps: 5, label: '엔티티 추출 (사람/장소/개념/키워드)', status: 'waiting' },
  { step: 3, totalSteps: 5, label: '중복/충돌 해결 및 정보 통합', status: 'waiting' },
  { step: 4, totalSteps: 5, label: '위키 구조 설계 (섹션/TOC 생성)', status: 'waiting' },
  { step: 5, totalSteps: 5, label: '마크다운 위키 문서 작성', status: 'waiting' },
];

// 전역 상태: 모달 닫혀도 진행 중인 머지 추적
let globalMergeRunning = false;

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
  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(null); // 자동 시작 카운트다운
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // 모달 열리면 3초 카운트다운 후 자동 시작
  useEffect(() => {
    isMountedRef.current = true;
    setAutoStartTimer(3);

    timerRef.current = setInterval(() => {
      setAutoStartTimer((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // 제목이 없으면 기본값으로 자동 시작
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 카운트다운 0 되면 자동 시작
  useEffect(() => {
    if (autoStartTimer === null && !isProcessing && !done) {
      // 카운트다운 종료 → 자동 시작
      handleMerge();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartTimer]);

  const updateStep = (stepNum: number, status: MergeProgress['status']) => {
    if (isMountedRef.current) {
      setSteps((prev) => prev.map((s) => s.step === stepNum ? { ...s, status } : s));
    }
  };

  const handleMerge = async () => {
    if (isProcessing) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setAutoStartTimer(null);

    const finalTitle = wikiTitle.trim() || `위키 ${new Date().toLocaleDateString('ko-KR')} (메모 ${noteIds.length}개)`;
    if (!wikiTitle.trim()) setWikiTitle(finalTitle);

    setIsProcessing(true);
    setError('');
    globalMergeRunning = true;

    try {
      updateStep(1, 'processing');

      const response = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteIds, title: finalTitle }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '위키 생성 실패');
      }

      // SSE 스트림 수신
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let finalSlug = '';

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
              if (data.slug) {
                finalSlug = data.slug;
                if (isMountedRef.current) setWikiSlug(data.slug);
              }
              if (data.done) {
                globalMergeRunning = false;
                if (isMountedRef.current) {
                  setDone(true);
                  setIsProcessing(false);
                } else {
                  // 모달이 닫힌 상태 → 토스트로 알림
                  toast.success(
                    (t) => (
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">🎉 위키 생성 완료!</span>
                        <span className="text-sm text-gray-600">"{finalTitle}"</span>
                        <button
                          className="text-sm text-blue-600 underline text-left mt-1"
                          onClick={() => {
                            toast.dismiss(t.id);
                            router.push(`/wiki/${finalSlug}`);
                          }}
                        >
                          위키 보러 가기 →
                        </button>
                      </div>
                    ),
                    { duration: 10000 }
                  );
                }
              }
              if (data.error) throw new Error(data.error);
            } catch {
              // JSON 파싱 오류 무시
            }
          }
        }
      }
    } catch (err: unknown) {
      globalMergeRunning = false;
      const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
      if (isMountedRef.current) {
        setError(msg);
        setIsProcessing(false);
      } else {
        toast.error(`위키 생성 실패: ${msg}`);
      }
    }
  };

  // 모달 닫기 (진행 중이어도 닫을 수 있음 - 백그라운드 계속 진행)
  const handleClose = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isProcessing) {
      toast('위키 생성이 백그라운드에서 계속 진행됩니다.', {
        icon: '⚙️',
        duration: 4000,
      });
    }
    onClose();
  };

  const handleViewWiki = () => {
    router.push(`/wiki/${wikiSlug}`);
    onClose();
  };

  const completedSteps = steps.filter((s) => s.status === 'done').length;
  const progressPercent = (completedSteps / steps.length) * 100;

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
          {/* 진행 중이어도 닫기 가능 */}
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title={isProcessing ? '닫아도 백그라운드에서 계속 진행됩니다' : '닫기'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* 완료 상태 */}
          {done ? (
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
            <>
              {/* 제목 입력 (진행 중에도 표시, 단 비활성화) */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  위키 제목
                  {!isProcessing && autoStartTimer !== null && (
                    <span className="ml-2 text-xs text-primary-500 font-normal">
                      ({autoStartTimer}초 후 자동 시작...)
                    </span>
                  )}
                </label>
                <input
                  value={wikiTitle}
                  onChange={(e) => setWikiTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isProcessing) handleMerge();
                  }}
                  disabled={isProcessing}
                  className="input-field disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder={`위키 ${new Date().toLocaleDateString('ko-KR')} (메모 ${noteIds.length}개)`}
                  autoFocus={!isProcessing}
                />
                {!isProcessing && (
                  <p className="text-xs text-gray-400 mt-1">
                    Enter를 누르거나 카운트다운이 끝나면 자동으로 시작됩니다. 빈칸이면 기본 제목이 사용됩니다.
                  </p>
                )}
              </div>

              {/* 오류 */}
              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-950 rounded-lg p-3 mb-4 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* 진행 상태 (처리 중일 때) */}
              {isProcessing && (
                <>
                  {/* 프로그레스 바 */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>진행 중...</span>
                      <span>{completedSteps}/{steps.length} 단계</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* 안내 메시지 */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 mb-4">
                    <Sparkles className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
                    X를 눌러 닫아도 백그라운드에서 계속 생성됩니다
                  </div>
                </>
              )}

              {/* 단계 목록 */}
              {isProcessing && (
                <div className="space-y-2.5">
                  {steps.map((step) => (
                    <div
                      key={step.step}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                        step.status === 'processing'
                          ? 'bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800'
                          : step.status === 'done'
                          ? 'bg-green-50 dark:bg-green-950'
                          : step.status === 'error'
                          ? 'bg-red-50 dark:bg-red-950'
                          : 'bg-gray-50 dark:bg-gray-800'
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
                      <span
                        className={`text-sm ${
                          step.status === 'processing'
                            ? 'font-medium text-primary-700 dark:text-primary-300'
                            : step.status === 'done'
                            ? 'text-green-700 dark:text-green-300'
                            : step.status === 'error'
                            ? 'text-red-700 dark:text-red-300'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 시작 전: 즉시 시작 버튼 */}
              {!isProcessing && (
                <button
                  onClick={handleMerge}
                  className="btn-primary w-full py-3 mt-2"
                >
                  <GitMerge className="w-4 h-4 mr-2" />
                  지금 바로 시작
                  {autoStartTimer !== null && (
                    <span className="ml-2 text-xs opacity-80">({autoStartTimer}초)</span>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
