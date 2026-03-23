'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MergeProgress } from '@/types';
import { X, GitMerge, CheckCircle, Loader2, AlertCircle, Sparkles, Database, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore, INITIAL_STEPS } from '@/store/appStore';

interface Props {
  noteIds: string[];
  onClose: () => void;
}

// 단계 라벨 (마스터 위키 통합용)
const MERGE_STEPS = [
  { step: 1, label: '메모 내용 분석 (이미지 포함)' },
  { step: 2, label: '키워드 & 개념 추출' },
  { step: 3, label: '위키에 통합' },
  { step: 4, label: '저장' },
  { step: 5, label: '검색 인덱스 업데이트' },
];

export function MergeModal({ noteIds, onClose }: Props) {
  const router = useRouter();
  const { setMergeStatus, updateMergeStatusStep, addWikifiedNotes } = useAppStore();

  const [done, setDone] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [wikiVersion, setWikiVersion] = useState(1);
  const [totalNotes, setTotalNotes] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [currentStepMessage, setCurrentStepMessage] = useState('');
  const [stepExtraData, setStepExtraData] = useState<Record<number, string>>({});
  const [steps, setSteps] = useState(MERGE_STEPS.map(s => ({ ...s, status: 'waiting' as MergeProgress['status'] })));

  const isMountedRef = useRef(true);

  // 마운트 즉시 자동 시작
  useEffect(() => {
    isMountedRef.current = true;
    handleMerge();
    return () => { isMountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStep = (stepNum: number, status: MergeProgress['status']) => {
    setSteps(prev => prev.map(s => s.step === stepNum ? { ...s, status } : s));
    updateMergeStatusStep(stepNum, status);
  };

  const handleMerge = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError('');

    setMergeStatus({
      isRunning: true,
      title: '지식 베이스 위키',
      noteIds,
      steps: INITIAL_STEPS.map(s => ({ ...s })),
    });

    try {
      updateStep(1, 'processing');

      const response = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteIds }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '위키 생성 실패');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.step) {
                updateStep(data.step, data.status);
                if (data.message && data.status === 'processing') {
                  setCurrentStepMessage(data.message as string);
                }
                if (data.data && data.status === 'done') {
                  const d = data.data as Record<string, unknown>;
                  let extra = '';
                  if (d.keywords) extra = (d.keywords as string[]).join(', ');
                  if (extra) setStepExtraData(prev => ({ ...prev, [data.step as number]: extra }));
                }
              }

              if (data.done) {
                addWikifiedNotes(noteIds);
                setMergeStatus({
                  isRunning: false,
                  title: '지식 베이스 위키',
                  noteIds,
                  steps: INITIAL_STEPS.map(s => ({ ...s, status: 'done' as const })),
                  completedAt: Date.now(),
                  wikiSlug: 'master-wiki',
                });

                if (isMountedRef.current) {
                  setDone(true);
                  setIsUpdate(data.isUpdate as boolean);
                  setWikiVersion(data.version as number);
                  setTotalNotes(data.totalNotes as number);
                  setIsProcessing(false);
                } else {
                  const msg = data.isUpdate
                    ? `위키 v${data.version}으로 업데이트! (총 ${data.totalNotes}개 메모 반영)`
                    : `위키 첫 생성 완료! (${data.totalNotes}개 메모)`;
                  toast.success(
                    (t) => (
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">🎉 {msg}</span>
                        <button
                          className="text-sm text-blue-600 underline text-left mt-1"
                          onClick={() => { toast.dismiss(t.id); router.push('/wiki/master-wiki'); }}
                        >
                          위키 보러 가기 →
                        </button>
                      </div>
                    ),
                    { duration: 10000 }
                  );
                }
              }

              if (data.error) throw new Error(data.error as string);
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Unexpected token') {
                throw parseErr;
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
      setMergeStatus({ isRunning: false, title: '지식 베이스 위키', noteIds, steps: INITIAL_STEPS, error: msg });
      if (isMountedRef.current) {
        setError(msg);
        setIsProcessing(false);
      } else {
        toast.error(`위키 업데이트 실패: ${msg}`);
      }
    }
  };

  const handleClose = () => {
    if (isProcessing) {
      toast('위키 업데이트가 백그라운드에서 계속 진행됩니다.', { icon: '⚙️', duration: 3000 });
    }
    onClose();
  };

  const completedCount = steps.filter(s => s.status === 'done').length;
  const progressPercent = (completedCount / steps.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950 rounded-xl flex items-center justify-center">
              <Database className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">지식 베이스 업데이트</h2>
              <p className="text-xs text-gray-500">{noteIds.length}개 메모 → 마스터 위키에 통합</p>
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
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                {isUpdate ? `위키 v${wikiVersion}으로 업데이트 완료!` : '위키 첫 생성 완료!'}
              </h3>
              <p className="text-sm text-gray-500 mb-2">
                총 <span className="font-semibold text-indigo-600">{totalNotes}개</span> 메모가 반영된 지식 베이스가 구축됐습니다.
              </p>
              <p className="text-xs text-gray-400 mb-6">
                {isUpdate ? '새 메모가 기존 위키에 자연스럽게 통합됐습니다.' : '앞으로 메모를 추가할수록 위키가 풍부해집니다.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { router.push('/wiki/master-wiki'); onClose(); }}
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
              {/* 안내 배너 */}
              {!error && (
                <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg px-3 py-2.5 mb-4">
                  <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 animate-spin" />
                  <span>
                    {isProcessing
                      ? 'AI가 메모를 분석해 마스터 위키에 통합하고 있습니다...'
                      : '잠시 후 자동으로 시작됩니다.'}
                  </span>
                </div>
              )}

              {/* 오류 */}
              {error && (
                <div className="flex items-start gap-2 text-red-600 bg-red-50 dark:bg-red-950 rounded-lg p-3 mb-4 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">오류 발생</p>
                    <p className="text-xs">{error}</p>
                    <button onClick={handleMerge} className="mt-2 text-xs underline text-red-700">
                      다시 시도
                    </button>
                  </div>
                </div>
              )}

              {/* 프로그레스 바 */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span className="font-medium">진행 상황</span>
                  <span>{completedCount}/{steps.length}</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-700"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* 백그라운드 안내 */}
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 dark:bg-blue-950/50 rounded-lg px-3 py-2 mb-4">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span>X를 눌러 닫아도 백그라운드에서 계속 진행되며, 완료 시 알림이 표시됩니다</span>
                </div>
              )}

              {/* 단계 목록 */}
              <div className="space-y-2">
                {steps.map(step => (
                  <div
                    key={step.step}
                    className={`flex items-start gap-3 p-2.5 rounded-lg transition-all ${
                      step.status === 'processing'
                        ? 'bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800'
                        : step.status === 'done'
                        ? 'bg-green-50 dark:bg-green-950/50'
                        : 'bg-gray-50 dark:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                      {step.status === 'done' && <CheckCircle className="w-5 h-5 text-green-500" />}
                      {step.status === 'processing' && <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />}
                      {(step.status === 'waiting' || !step.status) && (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                          <span className="text-[10px] text-gray-400">{step.step}</span>
                        </div>
                      )}
                      {step.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm block ${
                        step.status === 'processing'
                          ? 'font-medium text-indigo-700 dark:text-indigo-300'
                          : step.status === 'done'
                          ? 'text-green-700 dark:text-green-400 line-through opacity-70'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {step.label}
                      </span>
                      {step.status === 'processing' && currentStepMessage && (
                        <span className="text-xs text-indigo-500 mt-0.5 block">→ {currentStepMessage}</span>
                      )}
                      {step.status === 'done' && stepExtraData[step.step] && (
                        <span className="text-xs text-gray-400 mt-0.5 block truncate">{stepExtraData[step.step]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
