import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const GEMINI_KEY = () => process.env.GEMINI_API_KEY!;

// 마스터 위키 고정 slug (사용자 1명 = 위키 1개)
const MASTER_SLUG = 'master-wiki';

// 모델: gemini-2.5-flash-lite (멀티모달 지원, 무료 티어 정상)
const FAST_MODEL = 'gemini-2.5-flash-lite';

// SSE 헬퍼
function sseData(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ─────────────────────────────────────────
// 429 재시도 유틸리티 (지수 백오프)
// ─────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error = new Error('알 수 없는 오류');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status !== 429) return res; // 429가 아니면 즉시 반환

    // 429 처리: Retry-After 헤더 확인 후 대기
    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : Math.min(2000 * Math.pow(2, attempt), 30000); // 2s, 4s, 8s ... 최대 30s

    console.warn(`Gemini 429 (할당량 초과) - ${attempt + 1}번째 시도, ${waitMs / 1000}초 후 재시도`);
    lastError = new Error(
      `Gemini API 할당량을 초과했습니다. ${Math.ceil(waitMs / 1000)}초 후 재시도합니다... (${attempt + 1}/${maxRetries})`
    );

    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  throw lastError;
}

// Gemini 텍스트 생성
async function geminiGenerate(
  prompt: string,
  maxTokens = 8192,
  temperature = 0.4
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini 오류: ${res.status} - ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// Gemini 멀티모달 (이미지 분석) — 이미지는 최대 2장으로 제한해 부하 감소
async function geminiMultimodal(textPrompt: string, imageUrls: string[]): Promise<string> {
  const parts: unknown[] = [{ text: textPrompt }];

  // 이미지 fetch: 최대 2장, 순차 처리 (병렬 API 부하 방지)
  for (const url of imageUrls.slice(0, 2)) {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) continue;
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const buffer = await imgRes.arrayBuffer();
      parts.push({ inline_data: { mime_type: contentType, data: Buffer.from(buffer).toString('base64') } });
    } catch {
      // 이미지 로드 실패 시 무시
    }
  }

  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${FAST_MODEL}:generateContent?key=${GEMINI_KEY()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`멀티모달 오류: ${res.status} - ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────
interface NoteData {
  id: string; title: string; type: string; content: string; images: string[];
}
interface ParsedNote {
  id: string; title: string; type: string; content: string;
}
interface MindNode { id: string; topic?: string; children?: MindNode[]; }

// ─────────────────────────────────────────
// 단계별 AI 처리 (최적화 버전)
// ─────────────────────────────────────────

/** 1단계: 새 메모들 파싱 — 이미지 메모는 순차 처리 (API 부하 감소) */
async function step1_parseNotes(notes: NoteData[]): Promise<ParsedNote[]> {
  const results: ParsedNote[] = [];

  for (const note of notes) {
    let content = '';

    if (note.type === 'mindmap') {
      try {
        const d = JSON.parse(note.content || '{}');
        const flatten = (n: MindNode, depth = 0): string =>
          '  '.repeat(depth) + `- ${n.topic || n.id}\n` +
          (n.children || []).map(c => flatten(c, depth + 1)).join('');
        content = `[마인드맵]\n${flatten(d.nodeData || d)}`;
      } catch { content = note.content || ''; }

    } else if (note.type === 'image' && note.images.length > 0) {
      try {
        content = await geminiMultimodal(
          `이미지를 분석하여 핵심 내용을 한국어 3문장으로 설명하세요. 제목: ${note.title}`,
          note.images
        );
      } catch { content = note.content?.replace(/<[^>]+>/g, '') || ''; }

    } else if (note.type === 'file') {
      const raw = note.content?.replace(/<[^>]+>/g, '') || '';
      // "---" 구분선 기준으로 AI분석 / 원본데이터 분리
      const parts = raw.split(/\n---\n/);
      const aiAnalysis = parts[0]?.trim() || '';
      // 코드블록(원본 데이터)에서 실제 텍스트 추출
      const rawDataMatch = raw.match(/```\n?([\s\S]*?)```/);
      const rawData = rawDataMatch?.[1]?.trim() || '';

      if (rawData.length > 100) {
        // 원본 데이터가 있으면 원본 우선 (AI 설명보다 실제 내용이 중요)
        content = rawData.slice(0, 5000);
        if (aiAnalysis && aiAnalysis.length > 50) {
          // AI 분석 요약도 앞에 붙임 (컨텍스트용, 짧게)
          const shortSummary = aiAnalysis.slice(0, 500);
          content = `[요약]\n${shortSummary}\n\n[원본 내용]\n${content}`;
        }
      } else {
        // 원본 데이터 없으면 AI 분석 결과 사용
        content = aiAnalysis.slice(0, 5000);
      }

    } else {
      content = note.content?.replace(/<[^>]+>/g, '') || '';
    }

    const maxLen = note.type === 'file' ? 5500 : 2000;
    results.push({
      id: note.id, title: note.title, type: note.type,
      content: content.slice(0, maxLen),
    });
  }

  return results;
}

/** 2+3단계 통합: 엔티티 추출 + 위키 통합을 단일 Gemini 호출로 처리 */
async function step2_generateWiki(
  existingWiki: string | null,
  existingVersion: number,
  parsedNotes: ParsedNote[],
  allLinkedNoteCount: number
): Promise<{ content: string; title: string; tags: string[] }> {
  const notesDetail = parsedNotes.map((n, i) =>
    `=== [메모 ${i + 1}] ${n.title} (${n.type}) ===\n${n.content}`
  ).join('\n\n');

  const isFirstTime = !existingWiki || existingWiki.trim().length < 50;
  const today = new Date().toLocaleDateString('ko-KR');

  let prompt: string;

  if (isFirstTime) {
    prompt = `당신은 회사 지식 베이스를 관리하는 위키 편집자입니다.
아래 메모들로 회사 지식 베이스 위키를 작성하세요.

━━━ 메모들 (총 ${parsedNotes.length}개) ━━━
${notesDetail}

━━━ 작성 지침 ━━━
1. 첫 줄: WIKI_TITLE: [내용에 맞는 제목]
2. 두 번째 줄: WIKI_TAGS: [태그1,태그2,태그3,...] (최대 10개)
3. 세 번째 줄부터: 마크다운 본문
   - 상단에 **마지막 업데이트**: ${today} | **메모 수**: ${allLinkedNoteCount}개
   - ## 개요, 내용 섹션들 (3~6개), ## 키워드 인덱스
   - 각 섹션 하단: > 📎 출처: [메모 제목]
   - 최소 800자, 전문적 백과사전 스타일

출력 형식:
WIKI_TITLE: 제목
WIKI_TAGS: 태그1,태그2,태그3
마크다운 본문...`;
  } else {
    const existingPreview = existingWiki.slice(0, 5000);
    prompt = `당신은 회사 지식 베이스를 관리하는 위키 편집자입니다.
기존 위키에 새 메모들을 통합하여 업데이트하세요.

━━━ 기존 위키 (v${existingVersion}) ━━━
${existingPreview}${existingWiki.length > 5000 ? '\n... (이하 생략)' : ''}

━━━ 새 메모들 (${parsedNotes.length}개) ━━━
${notesDetail}

━━━ 통합 지침 ━━━
1. 첫 줄: WIKI_TITLE: [제목 (변경 필요시만 수정)]
2. 두 번째 줄: WIKI_TAGS: [태그1,태그2,...] (최대 10개)
3. 세 번째 줄부터: 업데이트된 마크다운 본문
   - **마지막 업데이트**: ${today} | **메모 수**: ${allLinkedNoteCount}개 로 갱신
   - 새 내용을 기존 관련 섹션에 자연스럽게 통합 (중복 제거)
   - 새 주제면 새 섹션 추가
   - 기존 내용 삭제 금지, 보완만

출력 형식:
WIKI_TITLE: 제목
WIKI_TAGS: 태그1,태그2,태그3
마크다운 본문...`;
  }

  // 단일 Gemini 호출 (구 step2 + step3 통합)
  const raw = await geminiGenerate(prompt, 8192, 0.5);

  // 제목 파싱
  const lines = raw.split('\n');
  const titleLine = lines.find(l => l.startsWith('WIKI_TITLE:'));
  const tagsLine = lines.find(l => l.startsWith('WIKI_TAGS:'));

  const title = titleLine ? titleLine.replace('WIKI_TITLE:', '').trim() : '회사 지식 베이스';
  const tags = tagsLine
    ? tagsLine.replace('WIKI_TAGS:', '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 10)
    : [];

  // 본문: WIKI_TITLE, WIKI_TAGS 줄 제거
  const content = lines
    .filter(l => !l.startsWith('WIKI_TITLE:') && !l.startsWith('WIKI_TAGS:'))
    .join('\n')
    .trim();

  return { content, title, tags };
}

// ─────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { noteIds } = body;

  if (!noteIds?.length) {
    return NextResponse.json({ error: '메모 ID가 필요합니다.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  if (!GEMINI_KEY()) return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(sseData(data))); } catch {}
      };

      try {
        // ── 기존 마스터 위키 & 메모 데이터를 병렬로 조회 ──────────
        send({ step: 1, status: 'processing', message: `${noteIds.length}개 메모 분석 중...` });

        const [wikiResult, notesResult] = await Promise.all([
          supabase
            .from('wiki_pages')
            .select('*')
            .eq('slug', MASTER_SLUG)
            .eq('user_id', session.user.id)
            .single(),
          supabase
            .from('notes')
            .select('*, note_images(*)')
            .in('id', noteIds),
        ]);

        const existingWiki = wikiResult.data;
        const notes = notesResult.data;
        const isUpdate = !!existingWiki;

        if (!notes?.length) throw new Error('메모를 찾을 수 없습니다.');

        // 기존 연결 메모 조회 (위키가 있을 때만)
        let alreadyLinkedIds = new Set<string>();
        if (existingWiki) {
          const { data: existingLinks } = await supabase
            .from('note_wiki_links')
            .select('note_id')
            .eq('wiki_id', existingWiki.id);
          alreadyLinkedIds = new Set((existingLinks || []).map((l: { note_id: string }) => l.note_id));
        }

        const newNoteIds = noteIds.filter((id: string) => !alreadyLinkedIds.has(id));
        const allNoteIds = [...new Set([...Array.from(alreadyLinkedIds), ...noteIds])];

        // ── 1단계: 메모 파싱 (이미지 병렬) ─────────────────────────
        const noteDataList: NoteData[] = notes.map((note) => {
          const images = (note.note_images as Array<{ original_url?: string; annotated_url?: string }> | null) || [];
          return {
            id: note.id as string,
            title: note.title as string,
            type: note.note_type as string,
            content: ((note.content_json as string) || (note.raw_text as string) || ''),
            images: images.map(img => img.annotated_url || img.original_url || '').filter(Boolean),
          };
        });

        const parsedNotes = await step1_parseNotes(noteDataList);
        send({ step: 1, status: 'done' });

        // ── 2단계: 엔티티 추출 (skip — step3에 통합) ─────────────
        send({ step: 2, status: 'processing', message: '키워드 분석 중...' });
        // 바로 done (실제 작업은 step3에서 동시에 처리)
        send({ step: 2, status: 'done' });

        // ── 3단계: 위키 생성/통합 (단일 Gemini 호출) ─────────────
        send({
          step: 3,
          status: 'processing',
          message: isUpdate
            ? `기존 위키(v${existingWiki.version})에 통합 중...`
            : '새 지식 베이스 생성 중...',
        });

        const { content: newContent, title: newTitle, tags: newTags } = await step2_generateWiki(
          isUpdate ? (existingWiki.content as string) : null,
          isUpdate ? (existingWiki.version as number) : 0,
          parsedNotes,
          allNoteIds.length
        );
        send({ step: 3, status: 'done' });

        // ── 4단계: DB 저장 ─────────────────────────────────────
        send({ step: 4, status: 'processing', message: '위키 저장 중...' });

        let wikiId: string;
        const newVersion = isUpdate ? (existingWiki.version as number) + 1 : 1;

        if (isUpdate) {
          const { error: updateErr } = await supabase
            .from('wiki_pages')
            .update({
              title: newTitle,
              content: newContent,
              tags: newTags,
              version: newVersion,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingWiki.id);
          if (updateErr) throw new Error('위키 업데이트 실패: ' + updateErr.message);
          wikiId = existingWiki.id as string;
        } else {
          const { data: newWiki, error: insertErr } = await supabase
            .from('wiki_pages')
            .insert({
              slug: MASTER_SLUG,
              title: newTitle,
              content: newContent,
              tags: newTags,
              user_id: session.user.id,
              version: 1,
              is_published: true,
            })
            .select()
            .single();
          if (insertErr) throw new Error('위키 생성 실패: ' + insertErr.message);
          wikiId = newWiki.id as string;
        }

        // note_wiki_links & wiki_history 병렬 저장
        const savePromises: Promise<void>[] = [];

        if (newNoteIds.length > 0) {
          const links = newNoteIds.map((noteId: string) => ({ note_id: noteId, wiki_id: wikiId }));
          savePromises.push(
            Promise.resolve(
              supabase.from('note_wiki_links').upsert(links, { onConflict: 'note_id,wiki_id', ignoreDuplicates: true })
            ).then(() => {})
          );
        }

        savePromises.push(
          Promise.resolve(
            supabase.from('wiki_history').insert({
              wiki_id: wikiId,
              content: newContent,
              version: newVersion,
              changed_by: session.user.id,
              change_summary: `${noteIds.length}개 메모 추가 (총 ${allNoteIds.length}개)`,
            })
          ).then(() => {}).catch(() => {})
        );

        await Promise.all(savePromises);
        send({ step: 4, status: 'done' });

        // ── 5단계: 임베딩 (비동기 fire-and-forget) ──────────────
        send({ step: 5, status: 'processing', message: '검색 인덱스 업데이트 중...' });
        // 임베딩은 결과를 기다리지 않음 (완료 응답 속도 향상)
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
          body: JSON.stringify({ wikiId, text: `${newTitle}\n${newTags.join(' ')}` }),
        }).catch(() => {});
        send({ step: 5, status: 'done' });

        // 완료
        send({
          done: true,
          slug: MASTER_SLUG,
          wikiId,
          isUpdate,
          version: newVersion,
          title: newTitle,
          newNotesAdded: newNoteIds.length,
          totalNotes: allNoteIds.length,
        });

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '위키 생성 오류';
        console.error('merge 오류:', err);
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
