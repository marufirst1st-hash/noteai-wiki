'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MergeProgress } from '@/types';
import { X, CheckCircle, Loader2, AlertCircle, Database, RefreshCw, BookOpen, Layers, GitMerge } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore, INITIAL_STEPS } from '@/store/appStore';
import { addError } from '@/components/ui/ErrorLog';

interface Props {
  noteIds: string[];
  onClose: () => void;
}

// 새 파이프라인 단계
const PIPELINE_STEPS = [
  { step: 1, label: '메모 준비', desc: '선택한 메모 내용 추출 및 위키화 형식 확인', icon: BookOpen },
  { step: 2, label: '중복 확인', desc: '통합 위키와 중복 내용 분석', icon: Layers },
  { step: 3, label: '섹션별 통합', desc: '관련 섹션에 내용 추가 또는 새 섹션 생성', icon: GitMerge },
  { step: 4, label: '저장', desc: 'DB에 위키 저장', icon: Database },
  { step: 5, label: '검색 인덱스', desc: '검색 인덱스 갱신', icon: RefreshCw },
];

type StepStatus = 'waiting' | 'processing' | 'done' | 'error';

interface StepState {
  step: number;
  label: string;
  desc: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  status: StepStatus;
  message?: string;
}

export function MergeModal({ noteIds, onClose }: Props) {
  const router = useRouter();
  const { setMergeStatus, updateMergeStatusStep, addWikifiedNotes } = useAppStore();

  const [done, setDone] = useState(false);
  const [isUpdate, setIsUpdate] = useState(false);
  const [wikiVersion, setWikiVersion] = useState(1);
  const [totalNotes, setTotalNotes] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [steps, setSteps] = useState<StepState[]>(
    PIPELINE_STEPS.map(s => ({ ...s, status: 'waiting' }))
  );

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    handleMerge();
    return () => { isMountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStep = (stepNum: number, status: StepStatus, message?: string) => {
    setSteps(prev => prev.map(s => s.step === stepNum ? { ...s, status, message } : s));
    updateMergeStatusStep(stepNum, status as MergeProgress['status']);
  };

  const handleMerge = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError('');
    setSteps(PIPELINE_STEPS.map(s => ({ ...s, status: 'waiting' })));

    setMergeStatus({
      isRunning: true,
      title: '지식 베이스 통합',
      noteIds,
      steps: INITIAL_STEPS.map(s => ({ ...s })),
    });

    try {
      updateStep(1, 'processing', '메모 데이터 준비 중...');

      // 새 API 엔드포인트 사용
      const response = await fetch('/api/wiki/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteIds }),
      });

      if (!response.ok) {
        const errText = await response.text();
        addError(`wiki/merge API 오류 ${response.status}`, errText.slice(0, 400), 'MergeModal');
        let errMsg = '위키 병합 실패';
        try { errMsg = JSON.parse(errText)?.error || errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
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
                updateStep(data.step, data.status as StepStatus, data.message as string);
              }

              if (data.done) {
                addWikifiedNotes(noteIds);
                setMergeStatus({
                  isRunning: false,
                  title: '지식 베이스 통합',
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
                    ? `위키 v${data.version} 업데이트 완료! (총 ${data.totalNotes}개 메모)`
                    : `위키 생성 완료! (${data.totalNotes}개 메모)`;
                  toast.success(msg, { duration: 8000 });
                }
              }

              if (data.error) {
                addError(`위키 병합 오류: ${data.error}`, undefined, 'wiki/merge SSE');
                throw new Error(data.error as string);
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && !parseErr.message.includes('JSON')) throw parseErr;
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
      addError(msg, err instanceof Error ? err.stack?.slice(0, 300) : undefined, 'MergeModal');
      setMergeStatus({ isRunning: false, title: '지식 베이스 통합', noteIds, steps: INITIAL_STEPS, error: msg });
      if (isMountedRef.current) {
        setError(msg);
        setIsProcessing(false);
        // 실패한 단계 error 상태로
        setSteps(prev => prev.map(s => s.status === 'processing' ? { ...s, status: 'error' } : s));
      } else {
        toast.error(`위키 병합 실패: ${msg}`);
      }
    }
  };

  const handleClose = () => {
    if (isProcessing) {
      toast('위키 병합이 백그라운드에서 계속 진행됩니다.', { icon: '⚙️', duration: 3000 });
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
              <h2 className="font-bold text-gray-900 dark:text-white">통합 위키 병합</h2>
              <p className="text-xs text-gray-500">{noteIds.length}개 메모 → 중복 확인 후 섹션별 통합</p>
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
          {done ? (
            /* ── 완료 화면 ── */
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                {isUpdate ? `위키 v${wikiVersion} 업데이트 완료!` : '위키 첫 생성 완료!'}
              </h3>
              <p className="text-sm text-gray-500 mb-1">
                총 <span className="font-semibold text-indigo-600">{totalNotes}개</span> 메모 반영
              </p>
              <p className="text-xs text-gray-400 mb-6">
                중복 내용은 제외하고 새 정보만 해당 섹션에 추가했습니다.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { router.push('/wiki'); onClose(); }}
                  className="btn-primary flex-1 py-2.5"
                >
                  위키 보기
                </button>
                <button onClick={onClose} className="btn-secondary flex-1 py-2.5">닫기</button>
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
                      ? '중복을 확인하며 섹션별로 통합하고 있습니다...'
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
                    <p className="text-xs whitespace-pre-line">{error}</p>
                    {(error.includes('할당량') || error.includes('429')) && (
                      <p className="text-xs text-amber-600 mt-1.5 font-medium">
                        💡 Gemini API 무료 플랜 한도 초과. 잠시 후 재시도해주세요.
                      </p>
                    )}
                    <button
                      onClick={handleMerge}
                      disabled={isProcessing}
                      className="mt-2 text-xs underline text-red-700 disabled:opacity-50"
                    >
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

              {/* 단계 목록 */}
              <div className="space-y-2">
                {steps.map(step => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.step}
                      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                        step.status === 'processing'
                          ? 'bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800'
                          : step.status === 'done'
                          ? 'bg-green-50 dark:bg-green-950/50'
                          : step.status === 'error'
                          ? 'bg-red-50 dark:bg-red-950/50'
                          : 'bg-gray-50 dark:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                        {step.status === 'done' && <CheckCircle className="w-5 h-5 text-green-500" />}
                        {step.status === 'processing' && <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />}
                        {step.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                        {step.status === 'waiting' && (
                          <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                            <Icon className="w-2.5 h-2.5 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium block ${
                          step.status === 'processing' ? 'text-indigo-700 dark:text-indigo-300'
                          : step.status === 'done' ? 'text-green-700 dark:text-green-400'
                          : step.status === 'error' ? 'text-red-600'
                          : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {step.label}
                        </span>
                        <span className="text-xs text-gray-400 block">
                          {step.status === 'processing' && step.message
                            ? `→ ${step.message}`
                            : step.desc}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isProcessing && (
                <p className="text-xs text-gray-400 text-center mt-3">
                  X를 눌러 닫아도 백그라운드에서 계속 진행됩니다
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
