import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const GEMINI_KEY = () => process.env.GEMINI_API_KEY!;

// 마스터 위키 고정 slug (사용자 1명 = 위키 1개)
const MASTER_SLUG = 'master-wiki';

// SSE 헬퍼
function sseData(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// Gemini 텍스트 생성
async function geminiGenerate(
  prompt: string,
  model = 'gemini-2.5-flash',
  temperature = 0.4,
  maxTokens = 8192
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY()}`,
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
    throw new Error(`Gemini(${model}) 오류: ${res.status} - ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// Gemini 멀티모달
async function geminiMultimodal(textPrompt: string, imageUrls: string[]): Promise<string> {
  const parts: unknown[] = [{ text: textPrompt }];
  for (const url of imageUrls.slice(0, 4)) {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) continue;
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const buffer = await imgRes.arrayBuffer();
      parts.push({ inline_data: { mime_type: contentType, data: Buffer.from(buffer).toString('base64') } });
    } catch {
      parts.push({ text: `[이미지: ${url}]` });
    }
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!res.ok) throw new Error(`멀티모달 오류: ${res.status}`);
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
  id: string; title: string; type: string; content: string; images: string[];
}
interface MindNode { id: string; topic?: string; children?: MindNode[]; }
interface EntityResult {
  concepts: string[]; keywords: string[]; tags: string[]; summary: string;
  people: string[]; places: string[]; dates: string[];
}

// ─────────────────────────────────────────
// 단계별 AI 처리
// ─────────────────────────────────────────

/** 1단계: 새 메모들 파싱 (이미지 포함) */
async function step1_parseNewNotes(notes: NoteData[]): Promise<ParsedNote[]> {
  const results: ParsedNote[] = [];
  for (const note of notes) {
    let content = '';
    if (note.type === 'mindmap') {
      try {
        const d = JSON.parse(note.content || '{}');
        const flatten = (n: MindNode, depth = 0): string =>
          '  '.repeat(depth) + `- ${n.topic || n.id}\n` + (n.children || []).map(c => flatten(c, depth + 1)).join('');
        content = `[마인드맵]\n${flatten(d.nodeData || d)}`;
      } catch { content = note.content || ''; }
    } else if (note.type === 'image' && note.images.length > 0) {
      try {
        content = await geminiMultimodal(
          `이미지를 분석하여 핵심 내용을 한국어로 설명하세요. 메모 제목: ${note.title}`,
          note.images
        );
      } catch { content = note.content?.replace(/<[^>]+>/g, '') || ''; }
    } else if (note.type === 'file') {
      const raw = note.content?.replace(/<[^>]+>/g, '') || '';
      const aiPart = raw.split('---')[0]?.trim() || '';
      const codeBlock = raw.match(/```[\s\S]*?```/)?.[0]?.replace(/```\n?/g, '').trim() || '';
      content = [aiPart.slice(0, 2000), codeBlock ? `[원본 데이터]\n${codeBlock.slice(0, 6000)}` : ''].filter(Boolean).join('\n');
    } else {
      content = note.content?.replace(/<[^>]+>/g, '') || '';
    }
    results.push({
      id: note.id, title: note.title, type: note.type,
      content: content.slice(0, note.type === 'file' ? 8000 : 3000),
      images: note.images,
    });
  }
  return results;
}

/** 2단계: 엔티티 추출 */
async function step2_extractEntities(parsedNotes: ParsedNote[]): Promise<EntityResult> {
  const text = parsedNotes.map((n, i) => `=== 메모 ${i + 1}: ${n.title} ===\n${n.content}`).join('\n\n');
  const prompt = `다음 메모들에서 핵심 정보를 추출하여 JSON으로 반환하세요:\n\n${text}\n\nJSON 형식:\n{"people":[],"places":[],"concepts":[],"dates":[],"keywords":[],"tags":[],"summary":""}`;
  const res = await geminiGenerate(prompt, 'gemini-2.5-flash', 0.2, 1024);
  return (parseJsonResponse(res) as EntityResult) || { people: [], places: [], concepts: [], dates: [], keywords: [], tags: [], summary: '' };
}

/** 3단계: 기존 위키에 새 내용 통합 (핵심 단계) */
async function step3_integrateIntoWiki(
  existingWiki: string | null,
  existingVersion: number,
  parsedNotes: ParsedNote[],
  entities: EntityResult,
  allLinkedNoteCount: number
): Promise<{ content: string; title: string; tags: string[] }> {
  const notesDetail = parsedNotes.map((n, i) =>
    `=== [새 메모 ${i + 1}] ${n.title} (${n.type}) ===\n${n.content}`
  ).join('\n\n');

  const isFirstTime = !existingWiki || existingWiki.trim().length < 50;

  let prompt: string;

  if (isFirstTime) {
    // 최초 생성
    prompt = `당신은 회사 지식 베이스를 관리하는 전문 위키 편집자입니다.
아래 메모들을 바탕으로 회사 지식 베이스 위키를 처음 작성하세요.

━━━ 추가할 메모들 (총 ${parsedNotes.length}개) ━━━
${notesDetail}

━━━ 추출된 핵심 정보 ━━━
키워드: ${entities.keywords.join(', ')}
개념: ${entities.concepts.join(', ')}
요약: ${entities.summary}

━━━ 작성 지침 ━━━
1. 문서 상단에 **마지막 업데이트** 날짜와 **총 메모 수** 표시
2. ## 개요 섹션: 이 위키가 담고 있는 지식 범위 설명
3. 내용 섹션들: 메모의 주제별로 자연스럽게 구성 (3~8개 섹션)
4. 각 섹션 하단에 출처 메모 표시: > 📎 출처: [메모 제목]
5. ## 키워드 인덱스 섹션: 태그와 주요 개념 나열
6. 전문적이고 백과사전 스타일로 작성
7. 최소 1000자 이상

이 위키의 제목도 메모 내용에 맞게 자동으로 정하고, 첫 줄에 반드시 다음 형식으로 작성:
WIKI_TITLE: [제목]

그 다음 줄부터 마크다운 본문을 작성하세요:`;
  } else {
    // 기존 위키에 새 내용 통합
    const existingPreview = existingWiki.slice(0, 6000);
    prompt = `당신은 회사 지식 베이스를 관리하는 전문 위키 편집자입니다.
기존 위키에 새 메모들의 내용을 통합하여 위키를 업데이트하세요.

━━━ 기존 위키 (v${existingVersion}) ━━━
${existingPreview}${existingWiki.length > 6000 ? '\n... (이하 생략)' : ''}

━━━ 새로 추가할 메모들 (${parsedNotes.length}개) ━━━
${notesDetail}

━━━ 새 메모 핵심 정보 ━━━
키워드: ${entities.keywords.join(', ')}
요약: ${entities.summary}

━━━ 통합 지침 ━━━
1. 문서 상단 **마지막 업데이트** 날짜를 오늘(${new Date().toLocaleDateString('ko-KR')})로 갱신
2. **총 메모 수**를 ${allLinkedNoteCount}개로 갱신
3. 새 메모 내용을 기존 관련 섹션에 자연스럽게 통합 (중복 제거, 모순 해결)
4. 새 주제라면 새 섹션을 적절한 위치에 추가
5. 각 섹션 하단 출처 메모 목록 유지/추가
6. 기존 내용을 삭제하지 말고 보완하세요
7. 전체 구조와 흐름이 자연스럽게 이어지도록

위키 제목이 더 이상 내용을 반영하지 못한다면 업데이트하고, 그렇지 않다면 유지하세요.
첫 줄에 반드시 다음 형식으로 작성:
WIKI_TITLE: [제목]

그 다음 줄부터 업데이트된 마크다운 본문을 작성하세요:`;
  }

  const raw = await geminiGenerate(prompt, 'gemini-2.5-flash', 0.5, 12000);

  // 제목 파싱
  const titleMatch = raw.match(/^WIKI_TITLE:\s*(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : '회사 지식 베이스';
  const content = raw.replace(/^WIKI_TITLE:\s*.+\n?/m, '').trim();

  // 태그 병합
  const tags = [...new Set([...entities.tags, ...entities.keywords.slice(0, 5)])].slice(0, 10);

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
        // ── 기존 마스터 위키 조회 ─────────────────
        const { data: existingWiki } = await supabase
          .from('wiki_pages')
          .select('*')
          .eq('slug', MASTER_SLUG)
          .eq('user_id', session.user.id)
          .single();

        const isUpdate = !!existingWiki;

        // 기존에 연결된 메모 ID 목록
        const { data: existingLinks } = await supabase
          .from('note_wiki_links')
          .select('note_id')
          .eq('wiki_id', existingWiki?.id || '00000000-0000-0000-0000-000000000000');

        const alreadyLinkedIds = new Set((existingLinks || []).map((l: { note_id: string }) => l.note_id));

        // 새로 추가되는 메모만 필터 (이미 연결된 메모도 포함해서 재분석)
        const newNoteIds = noteIds.filter((id: string) => !alreadyLinkedIds.has(id));
        const allNoteIds = [...new Set([...Array.from(alreadyLinkedIds), ...noteIds])];

        // ── 1단계: 새 메모 파싱 ──────────────────
        send({ step: 1, status: 'processing', message: `${noteIds.length}개 메모 분석 중...` });

        const { data: notes } = await supabase
          .from('notes')
          .select('*, note_images(*)')
          .in('id', noteIds);

        if (!notes?.length) throw new Error('메모를 찾을 수 없습니다.');

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

        const parsedNotes = await step1_parseNewNotes(noteDataList);
        send({ step: 1, status: 'done' });

        // ── 2단계: 엔티티 추출 ────────────────────
        send({ step: 2, status: 'processing', message: '키워드 및 개념 추출 중...' });
        const entities = await step2_extractEntities(parsedNotes);
        send({ step: 2, status: 'done', data: { keywords: entities.keywords.slice(0, 5) } });

        // ── 3단계: 위키 통합 생성 ─────────────────
        send({
          step: 3,
          status: 'processing',
          message: isUpdate
            ? `기존 위키(v${existingWiki.version})에 새 내용 통합 중...`
            : '새 지식 베이스 위키 생성 중...',
        });

        const { content: newContent, title: newTitle, tags: newTags } = await step3_integrateIntoWiki(
          isUpdate ? (existingWiki.content as string) : null,
          isUpdate ? (existingWiki.version as number) : 0,
          parsedNotes,
          entities,
          allNoteIds.length
        );
        send({ step: 3, status: 'done' });

        // ── 4단계: DB 저장 ────────────────────────
        send({ step: 4, status: 'processing', message: '위키 저장 중...' });

        let wikiId: string;
        const newVersion = isUpdate ? (existingWiki.version as number) + 1 : 1;

        if (isUpdate) {
          // 기존 위키 업데이트
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
          // 신규 생성
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

        // note_wiki_links 저장 (새 메모들만)
        if (newNoteIds.length > 0) {
          const links = newNoteIds.map((noteId: string) => ({ note_id: noteId, wiki_id: wikiId }));
          await supabase.from('note_wiki_links').upsert(links, { onConflict: 'note_id,wiki_id', ignoreDuplicates: true });
        }

        // wiki_history 저장
        try {
          await supabase.from('wiki_history').insert({
            wiki_id: wikiId,
            content: newContent,
            version: newVersion,
            changed_by: session.user.id,
            change_summary: `${noteIds.length}개 메모 추가 (총 ${allNoteIds.length}개 메모 반영)`,
          });
        } catch { /* wiki_history 없으면 무시 */ }

        send({ step: 4, status: 'done' });

        // ── 5단계: 임베딩 ─────────────────────────
        send({ step: 5, status: 'processing', message: '검색 인덱스 업데이트 중...' });
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
            body: JSON.stringify({
              wikiId,
              text: `${newTitle}\n${entities.summary}\n${entities.keywords.join(' ')}`,
            }),
          });
        } catch { /* 임베딩 실패해도 계속 */ }
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
