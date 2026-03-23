'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MergeProgress } from '@/types';
import { X, GitMerge, CheckCircle, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore, INITIAL_STEPS } from '@/store/appStore';

interface Props {
  noteIds: string[];
  onClose: () => void;
}

export function MergeModal({ noteIds, onClose }: Props) {
  const router = useRouter();
  const { setMergeStatus, updateMergeStatusStep, addWikifiedNotes } = useAppStore();

  const [wikiTitle, setWikiTitle] = useState('');
  const [finalTitleRef] = useState({ value: '' }); // ref-like 로컬 추적
  const [done, setDone] = useState(false);
  const [wikiSlug, setWikiSlug] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoStartTimer, setAutoStartTimer] = useState<number | null>(3);
  const [error, setError] = useState('');
  const [currentStepMessage, setCurrentStepMessage] = useState(''); // 현재 단계 상세 메시지
  const [stepExtraData, setStepExtraData] = useState<Record<number, string>>({}); // 단계별 추가 정보

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // 3초 카운트다운 후 자동 시작
  useEffect(() => {
    isMountedRef.current = true;

    timerRef.current = setInterval(() => {
      setAutoStartTimer((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
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

  // 카운트다운 종료 → 자동 시작
  useEffect(() => {
    if (autoStartTimer === null && !isProcessing && !done) {
      handleMerge();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartTimer]);

  const handleMerge = async () => {
    if (isProcessing) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setAutoStartTimer(null);

    const finalTitle =
      wikiTitle.trim() ||
      `위키 ${new Date().toLocaleDateString('ko-KR')} (메모 ${noteIds.length}개)`;
    if (!wikiTitle.trim()) setWikiTitle(finalTitle);
    finalTitleRef.value = finalTitle;

    setIsProcessing(true);
    setError('');

    // 전역 store에 머지 시작 알림
    setMergeStatus({
      isRunning: true,
      title: finalTitle,
      noteIds,
      steps: INITIAL_STEPS.map((s) => ({ ...s })),
    });

    const updateStep = (stepNum: number, status: MergeProgress['status']) => {
      updateMergeStatusStep(stepNum, status);
      // 모달이 마운트 중이면 로컬 store도 업데이트 (이미 전역으로 처리)
    };

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

              if (data.step) {
                updateStep(data.step, data.status);
                // 서버에서 보내는 메시지 표시
                if (data.message && data.status === 'processing') {
                  setCurrentStepMessage(data.message as string);
                }
                // 단계별 추가 데이터 (키워드, 섹션 등)
                if (data.data && data.status === 'done') {
                  const stepData = data.data as Record<string, unknown>;
                  let extraInfo = '';
                  if (stepData.keywords) extraInfo = (stepData.keywords as string[]).join(', ');
                  else if (stepData.duplicates !== undefined) extraInfo = `중복 ${stepData.duplicates}건, 모순 ${stepData.contradictions}건`;
                  else if (stepData.sections) extraInfo = (stepData.sections as string[]).join(' · ');
                  if (extraInfo) {
                    setStepExtraData((prev) => ({ ...prev, [data.step as number]: extraInfo }));
                  }
                }
              }

              if (data.slug) {
                finalSlug = data.slug;
                if (isMountedRef.current) setWikiSlug(data.slug);
              }

              if (data.done) {
                // 완료 처리
                addWikifiedNotes(noteIds);
                setMergeStatus({
                  isRunning: false,
                  title: finalTitle,
                  noteIds,
                  steps: INITIAL_STEPS.map((s) => ({ ...s, status: 'done' as const })),
                  completedAt: Date.now(),
                  wikiSlug: finalSlug,
                });

                if (isMountedRef.current) {
                  setDone(true);
                  setIsProcessing(false);
                } else {
                  // 모달 닫힌 상태 → 토스트 알림
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
      const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
      setMergeStatus({
        isRunning: false,
        title: finalTitleRef.value,
        noteIds,
        steps: INITIAL_STEPS,
        error: msg,
      });
      if (isMountedRef.current) {
        setError(msg);
        setIsProcessing(false);
      } else {
        toast.error(`위키 생성 실패: ${msg}`);
      }
    }
  };

  // 모달 닫기
  const handleClose = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isProcessing) {
      toast('위키 생성이 백그라운드에서 계속 진행됩니다.', { icon: '⚙️', duration: 3000 });
    }
    onClose();
  };

  // store steps 읽기 (진행 표시용)
  const steps = useAppStore((s) => s.mergeStatus?.steps ?? INITIAL_STEPS);
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
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title={isProcessing ? '닫아도 백그라운드에서 계속 진행됩니다' : '닫기'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* 완료 */}
          {done ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">위키 생성 완료!</h3>
              <p className="text-sm text-gray-500 mb-6">"{wikiTitle}" 위키가 성공적으로 생성되었습니다.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { router.push(`/wiki/${wikiSlug}`); onClose(); }}
                  className="btn-primary flex-1 py-2.5"
                >
                  위키 보기
                </button>
                <button onClick={onClose} className="btn-secondary flex-1 py-2.5">
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 제목 입력 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  위키 제목
                  {!isProcessing && autoStartTimer !== null && (
                    <span className="ml-2 text-xs text-primary-500 font-normal animate-pulse">
                      ({autoStartTimer}초 후 자동 시작...)
                    </span>
                  )}
                </label>
                <input
                  value={wikiTitle}
                  onChange={(e) => setWikiTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isProcessing) handleMerge(); }}
                  disabled={isProcessing}
                  className="input-field disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder={`위키 ${new Date().toLocaleDateString('ko-KR')} (메모 ${noteIds.length}개)`}
                  autoFocus={!isProcessing}
                />
                {!isProcessing && (
                  <p className="text-xs text-gray-400 mt-1">
                    Enter 또는 카운트다운 후 자동 시작 · 빈칸이면 기본 제목 사용
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

              {/* 진행 중 */}
              {isProcessing && (
                <>
                  {/* 프로그레스 바 */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span className="font-medium">AI 위키 생성 중...</span>
                      <span>{completedSteps}/{steps.length} 완료</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-primary-500 to-primary-600 h-2.5 rounded-full transition-all duration-700"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* 백그라운드 안내 */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 dark:bg-blue-950/50 rounded-lg px-3 py-2 mb-4">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <span>X를 눌러 닫아도 백그라운드에서 계속 진행되며, 완료 시 알림이 표시됩니다</span>
                  </div>

                  {/* 단계 목록 */}
                  <div className="space-y-2">
                    {steps.map((step) => (
                      <div
                        key={step.step}
                        className={`flex items-start gap-3 p-2.5 rounded-lg transition-all ${
                          step.status === 'processing'
                            ? 'bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800'
                            : step.status === 'done'
                            ? 'bg-green-50 dark:bg-green-950/50'
                            : 'bg-gray-50 dark:bg-gray-800/50'
                        }`}
                      >
                        <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                          {step.status === 'done' && <CheckCircle className="w-5 h-5 text-green-500" />}
                          {step.status === 'processing' && <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />}
                          {step.status === 'waiting' && (
                            <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                              <span className="text-[10px] text-gray-400">{step.step}</span>
                            </div>
                          )}
                          {step.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm block ${
                            step.status === 'processing' ? 'font-medium text-primary-700 dark:text-primary-300' :
                            step.status === 'done' ? 'text-green-700 dark:text-green-400 line-through opacity-70' :
                            'text-gray-400 dark:text-gray-500'
                          }`}>
                            {step.label}
                          </span>
                          {/* 진행 중 단계 상세 메시지 */}
                          {step.status === 'processing' && currentStepMessage && (
                            <span className="text-xs text-primary-500 dark:text-primary-400 mt-0.5 block">
                              → {currentStepMessage}
                            </span>
                          )}
                          {/* 완료된 단계 추가 정보 */}
                          {step.status === 'done' && stepExtraData[step.step] && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 block truncate">
                              {stepExtraData[step.step]}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* 시작 버튼 */}
              {!isProcessing && (
                <button onClick={handleMerge} className="btn-primary w-full py-3 mt-2">
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
