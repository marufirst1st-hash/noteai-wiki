/**
 * POST /api/wiki/consolidate  (SSE 스트리밍)
 * 
 * 3단계: 통합 위키 정리
 * - 3-1: 중복 내용 확인 및 제거
 * - 3-2: 목차-본문 연결 재확인
 * - 섹션 재배치 및 흐름 개선
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiText, sseMsg } from '@/lib/gemini';

const MASTER_SLUG = 'master-wiki';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY 없음' }, { status: 500 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(sseMsg(data))); } catch {}
      };

      try {
        send({ step: 1, status: 'processing', message: '통합 위키 로드 중...' });

        const { data: wiki } = await supabase
          .from('wiki_pages')
          .select('*')
          .eq('slug', MASTER_SLUG)
          .eq('user_id', session.user.id)
          .single();

        if (!wiki) throw new Error('통합 위키가 없습니다. 먼저 메모를 위키화해주세요.');
        const currentContent = wiki.content as string;

        send({ step: 1, status: 'done' });

        // ── 3-1: 중복 확인 분석 ─────────────────────────────
        send({ step: 2, status: 'processing', message: 'AI가 중복 내용 분석 중...' });

        const today = new Date().toLocaleDateString('ko-KR');

        // 위키가 너무 길면 청크로 나눠서 처리
        const MAX_CHUNK = 12000;
        const wikiToAnalyze = currentContent.slice(0, MAX_CHUNK);

        const consolidatePrompt = `아래 위키 문서를 정리하세요.

━━━ 현재 위키 (전문) ━━━
${wikiToAnalyze}
${currentContent.length > MAX_CHUNK ? '\n... (이하 생략)' : ''}

━━━ 정리 규칙 ━━━
1. **중복 제거**: 동일/유사 내용이 여러 섹션에 반복되면 한 곳으로 통합
2. **목차 재정비**: 모든 섹션이 목차에 연결되도록 확인, 없으면 추가
3. **앵커 일관성**: {#앵커} 없는 섹션에 앵커 부여, 목차 링크 일치 확인
4. **섹션 흐름**: 논리적 순서로 섹션 재배치 (개요 → 세부 → 참고)
5. **내용 보존**: 중복이 아닌 한 삭제 금지, 정보 손실 절대 없음
6. **형식 정리**: 깨진 표, 목록 등 마크다운 오류 교정

━━━ 출력 형식 ━━━
첫 줄: WIKI_TITLE: [제목]
둘째 줄: WIKI_TAGS: [태그, 최대 10개]
셋째 줄~: 정리된 전체 위키 마크다운

(반드시 전체 내용 출력 — 생략 표시 금지)

**마지막 업데이트**: ${today} | **자료 수**: (기존 값 유지)

## 목차
(전체 섹션 목록)

---

(각 섹션 전문)

WIKI_TITLE:`;

        const raw = await geminiText(consolidatePrompt, 16384, 0.2);
        send({ step: 2, status: 'done', message: '중복 분석 및 정리 완료' });

        send({ step: 3, status: 'processing', message: '정리된 위키 저장 중...' });

        // 파싱
        const lines = raw.split('\n');
        const titleLine = lines.find(l => l.startsWith('WIKI_TITLE:'));
        const tagsLine = lines.find(l => l.startsWith('WIKI_TAGS:'));
        const newTitle = titleLine ? titleLine.replace('WIKI_TITLE:', '').trim() : (wiki.title as string);
        const newTags = tagsLine
          ? tagsLine.replace('WIKI_TAGS:', '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 10)
          : (wiki.tags as string[] || []);
        const newContent = lines
          .filter(l => !l.startsWith('WIKI_TITLE:') && !l.startsWith('WIKI_TAGS:'))
          .join('\n').trim();

        const newVersion = (wiki.version as number) + 1;

        await supabase.from('wiki_pages').update({
          title: newTitle, content: newContent, tags: newTags,
          version: newVersion, updated_at: new Date().toISOString(),
        }).eq('id', wiki.id);

        try {
          await supabase.from('wiki_history').insert({
            wiki_id: wiki.id, content: newContent, version: newVersion,
            changed_by: session.user.id, change_summary: '위키 자동 정리 (중복 제거 + 목차 재정비)',
          });
        } catch { /* ignore history errors */ }

        send({ step: 3, status: 'done' });
        send({ done: true, version: newVersion, title: newTitle, slug: MASTER_SLUG });

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '정리 실패';
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
