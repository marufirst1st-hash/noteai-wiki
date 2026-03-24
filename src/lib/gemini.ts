/**
 * Gemini API 공통 유틸리티
 */

const FAST_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_KEY = () => process.env.GEMINI_API_KEY!;

// ── 429 재시도 유틸 ─────────────────────────────────────────
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter
      ? parseInt(retryAfter) * 1000
      : Math.min(2000 * Math.pow(2, attempt), 30000);
    await new Promise(r => setTimeout(r, waitMs));
  }
  throw new Error('Gemini API 할당량 초과 — 잠시 후 다시 시도해주세요.');
}

// ── 텍스트 생성 ─────────────────────────────────────────────
export async function geminiText(
  prompt: string,
  maxTokens = 8192,
  temperature = 0.3
): Promise<string> {
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${FAST_MODEL}:generateContent?key=${GEMINI_KEY()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini 오류: ${res.status} — ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── 멀티모달 (이미지+텍스트) ────────────────────────────────
export async function geminiMultimodal(
  textPrompt: string,
  imageUrls: string[]
): Promise<string> {
  const parts: unknown[] = [{ text: textPrompt }];
  for (const url of imageUrls.slice(0, 2)) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || 'image/jpeg';
      const buf = await r.arrayBuffer();
      parts.push({ inline_data: { mime_type: ct, data: Buffer.from(buf).toString('base64') } });
    } catch { /* ignore */ }
  }
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${FAST_MODEL}:generateContent?key=${GEMINI_KEY()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini 멀티모달 오류: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── SSE 헬퍼 ────────────────────────────────────────────────
export function sseMsg(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── 마크다운 텍스트 전처리 ────────────────────────────────
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}
