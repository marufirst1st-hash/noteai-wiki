'use client';

import { useAppStore } from '@/store/appStore';
import { useRouter } from 'next/navigation';
import { GitMerge, CheckCircle, Loader2, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function MergeProgressBar() {
  const router = useRouter();
  const { mergeStatus, setMergeStatus } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!mergeStatus) return null;

  const { isRunning, title, steps, completedAt, wikiSlug, error } = mergeStatus;
  const completedSteps = steps.filter((s) => s.status === 'done').length;
  const progressPercent = (completedSteps / steps.length) * 100;
  const currentStep = steps.find((s) => s.status === 'processing');
  const isDone = !isRunning && completedAt && !error;
  const isError = !!error;

  // 완료 후 5초 뒤 자동 숨김 (클릭 전까지)
  const handleDismiss = () => setMergeStatus(null);

  const handleGoWiki = () => {
    if (wikiSlug) {
      router.push(`/wiki/${wikiSlug}`);
      setMergeStatus(null);
    }
  };

  return (
    <div
      className={`
        fixed bottom-5 right-5 z-50
        w-80 rounded-2xl shadow-2xl border
        transition-all duration-300
        ${isDone
          ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
          : isError
          ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
        }
      `}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        {/* 아이콘 */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isDone ? 'bg-green-100 dark:bg-green-900' :
          isError ? 'bg-red-100 dark:bg-red-900' :
          'bg-primary-100 dark:bg-primary-900'
        }`}>
          {isDone
            ? <CheckCircle className="w-4 h-4 text-green-600" />
            : isError
            ? <X className="w-4 h-4 text-red-600" />
            : <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
          }
        </div>

        {/* 제목 및 상태 */}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold truncate ${
            isDone ? 'text-green-700 dark:text-green-300' :
            isError ? 'text-red-700 dark:text-red-300' :
            'text-gray-900 dark:text-white'
          }`}>
            {isDone ? '✅ 위키 생성 완료!' :
             isError ? '❌ 위키 생성 실패' :
             '⚙️ 위키 생성 중...'}
          </p>
          <p className="text-xs text-gray-500 truncate">{title}</p>
        </div>

        {/* 접기/펴기 + 닫기 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isDone && !isError && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title={collapsed ? '펼치기' : '접기'}
            >
              {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 프로그레스 바 (진행 중) */}
      {isRunning && (
        <div className="px-4 pb-1">
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary-500 to-primary-400 h-1.5 rounded-full transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>{currentStep ? currentStep.label : '준비 중...'}</span>
            <span>{completedSteps}/{steps.length}</span>
          </div>
        </div>
      )}

      {/* 단계 목록 (접히지 않은 경우만) */}
      {isRunning && !collapsed && (
        <div className="px-4 pb-3 mt-2 space-y-1.5">
          {steps.map((step) => (
            <div key={step.step} className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">
                {step.status === 'done' && (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                )}
                {step.status === 'processing' && (
                  <Loader2 className="w-3.5 h-3.5 text-primary-500 animate-spin" />
                )}
                {step.status === 'waiting' && (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                )}
              </div>
              <span className={`text-xs leading-tight ${
                step.status === 'done' ? 'text-green-600 dark:text-green-400 line-through opacity-60' :
                step.status === 'processing' ? 'text-primary-600 dark:text-primary-400 font-medium' :
                'text-gray-400 dark:text-gray-500'
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 완료 상태 액션 */}
      {isDone && (
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={handleGoWiki}
            className="flex-1 text-xs font-medium py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1"
          >
            <GitMerge className="w-3.5 h-3.5" />
            위키 보러 가기
          </button>
          <button
            onClick={handleDismiss}
            className="text-xs font-medium py-2 px-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      )}

      {/* 오류 상태 */}
      {isError && (
        <div className="px-4 pb-4">
          <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>
          <button
            onClick={handleDismiss}
            className="w-full text-xs font-medium py-2 px-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
