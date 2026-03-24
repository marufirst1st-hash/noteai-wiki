'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

export interface ErrorEntry {
  id: string;
  time: string;
  message: string;
  detail?: string;
  source?: string;
}

// 전역 오류 저장소
const listeners: Array<(errors: ErrorEntry[]) => void> = [];
let globalErrors: ErrorEntry[] = [];

export function addError(message: string, detail?: string, source?: string) {
  const entry: ErrorEntry = {
    id: Date.now().toString(),
    time: new Date().toLocaleTimeString('ko-KR'),
    message,
    detail,
    source,
  };
  globalErrors = [entry, ...globalErrors].slice(0, 50); // 최대 50개 유지
  listeners.forEach(fn => fn([...globalErrors]));
}

export function clearErrors() {
  globalErrors = [];
  listeners.forEach(fn => fn([]));
}

function useErrorStore() {
  const [errors, setErrors] = useState<ErrorEntry[]>([...globalErrors]);
  useEffect(() => {
    listeners.push(setErrors);
    return () => {
      const idx = listeners.indexOf(setErrors);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);
  return errors;
}

export function ErrorLogPanel() {
  const errors = useErrorStore();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 전역 JS 오류 캐치
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      addError(e.message, e.filename ? `${e.filename}:${e.lineno}` : undefined, 'window.onerror');
    };
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      addError(msg, e.reason?.stack?.slice(0, 300), 'unhandledrejection');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  if (errors.length === 0 && !open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] font-mono text-xs">
      {/* 헤더 토글 버튼 */}
      <button
        onClick={toggle}
        className={`flex items-center gap-2 w-full px-3 py-2 rounded-t-lg font-semibold transition-colors ${
          errors.length > 0
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-gray-600 text-white hover:bg-gray-700'
        }`}
      >
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">
          오류 로그 {errors.length > 0 ? `(${errors.length})` : ''}
          <span className="ml-2 opacity-60">v{APP_VERSION}</span>
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {/* 오류 목록 패널 */}
      {open && (
        <div className="bg-gray-900 text-gray-100 rounded-b-lg border border-gray-700 border-t-0 max-h-72 overflow-y-auto">
          {errors.length === 0 ? (
            <p className="px-3 py-3 text-gray-400 text-center">오류 없음 ✓</p>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700">
                <span className="text-gray-400">{errors.length}개 오류</span>
                <button
                  onClick={clearErrors}
                  className="flex items-center gap-1 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> 초기화
                </button>
              </div>
              {errors.map(err => (
                <div
                  key={err.id}
                  className="border-b border-gray-800 last:border-0"
                >
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors"
                    onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="text-red-400 flex-shrink-0 mt-0.5">✕</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-red-300 truncate leading-tight">{err.message}</p>
                        <p className="text-gray-500 mt-0.5">
                          {err.time}{err.source ? ` · ${err.source}` : ''}
                        </p>
                      </div>
                      {err.detail && (
                        expandedId === err.id
                          ? <ChevronUp className="w-3 h-3 text-gray-500 flex-shrink-0 mt-0.5" />
                          : <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </button>
                  {expandedId === err.id && err.detail && (
                    <pre className="px-3 pb-2 text-yellow-300 whitespace-pre-wrap break-all text-xs leading-relaxed bg-gray-800/50">
                      {err.detail}
                    </pre>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
