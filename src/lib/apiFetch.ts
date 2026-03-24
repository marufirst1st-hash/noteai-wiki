/**
 * API 호출 시 오류를 ErrorLog에 자동으로 기록하는 fetch wrapper
 * 사용법: import { apiFetch } from '@/lib/apiFetch'
 *         const data = await apiFetch('/api/merge', { method: 'POST', body: ... })
 */
import { addError } from '@/components/ui/ErrorLog';

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      let detail = '';
      try {
        const clone = res.clone();
        detail = await clone.text();
      } catch { /* ignore */ }
      addError(
        `API 오류 ${res.status}: ${url}`,
        detail.slice(0, 500),
        'apiFetch'
      );
    }
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addError(`네트워크 오류: ${url}`, msg, 'apiFetch');
    throw err;
  }
}
