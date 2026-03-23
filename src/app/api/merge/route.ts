import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';

const GEMINI_KEY = () => process.env.GEMINI_API_KEY!;

// SSE 헬퍼
function sseData(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// Gemini 텍스트 생성 (gemini-2.5-flash)
async function geminiGenerate(
  prompt: string,
  model = 'gemini-2.5-flash',
  temperature = 0.4,
  maxTokens = 4096
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
    throw new Error(`Gemini(${model}) 오류: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// Gemini 멀티모달 (텍스트 + 이미지 URL)
async function geminiMultimodal(
  textPrompt: string,
  imageUrls: string[]
): Promise<string> {
  const parts: unknown[] = [{ text: textPrompt }];

  // 이미지는 최대 5개까지 (토큰 절약)
  for (const url of imageUrls.slice(0, 5)) {
    try {
      // URL에서 이미지 fetch → base64로 변환
      const imgRes = await fetch(url);
      if (!imgRes.ok) continue;
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      parts.push({
        inline_data: { mime_type: contentType, data: base64 },
      });
    } catch {
      // 이미지 fetch 실패 시 URL 텍스트로 대체
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini 멀티모달 오류: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// JSON 응답 파싱 (Gemini가 markdown 코드블록으로 감싸는 경우 처리)
function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// 단계별 실제 AI 처리 함수
// ─────────────────────────────────────────

/** 1단계: 멀티모달 파싱 - 각 메모의 핵심 내용 + 이미지 분석 */
async function step1_multimodalParsing(notes: NoteData[]): Promise<ParsedNote[]> {
  const results: ParsedNote[] = [];

  for (const note of notes) {
    let parsedContent = '';

    if (note.type === 'mindmap') {
      // 마인드맵 JSON 구조를 텍스트로 변환
      try {
        const mindData = JSON.parse(note.content || '{}');
        const flatten = (node: MindNode, depth = 0): string => {
          const indent = '  '.repeat(depth);
          let text = `${indent}- ${node.topic || node.id}\n`;
          for (const child of node.children || []) {
            text += flatten(child, depth + 1);
          }
          return text;
        };
        parsedContent = `[마인드맵 구조]\n${flatten(mindData.nodeData || mindData)}`;
      } catch {
        parsedContent = note.content || '';
      }
    } else if (note.type === 'image' && note.images.length > 0) {
      // 이미지가 있으면 Gemini Vision으로 분석
      const imagePrompt = `이 이미지를 분석하여 주요 내용을 한국어로 설명해주세요.
메모 제목: ${note.title}
텍스트 내용: ${note.content?.replace(/<[^>]+>/g, '').slice(0, 500) || '없음'}

이미지에서 보이는 내용, 텍스트, 도형, 주석 등을 모두 추출하세요.
JSON 없이 자연어로만 답변하세요.`;

      try {
        parsedContent = await geminiMultimodal(imagePrompt, note.images);
      } catch {
        parsedContent = note.content?.replace(/<[^>]+>/g, '') || '';
      }
    } else if (note.type === 'file') {
      // 파일 메모: AI 분석 결과 + 원본 데이터 모두 활용
      // content에는 "AI 분석\n---\n원본 데이터" 형식으로 저장됨
      const raw = note.content?.replace(/<[^>]+>/g, '') || '';

      // 원본 데이터 코드블록 추출 (```...``` 사이)
      const codeBlockMatch = raw.match(/```[\s\S]*?```/);
      const aiAnalysisPart = raw.split('---')[0]?.trim() || '';
      const rawDataPart = codeBlockMatch
        ? codeBlockMatch[0].replace(/```\n?/g, '').trim()
        : raw;

      // AI 분석 + 원본 데이터 앞부분 합산 (파일은 더 많이 허용)
      parsedContent = [
        aiAnalysisPart.slice(0, 2000),
        rawDataPart ? `\n[원본 데이터 앞부분]\n${rawDataPart.slice(0, 6000)}` : '',
      ].filter(Boolean).join('\n');
    } else {
      // 텍스트 메모 - HTML 태그 제거
      parsedContent = note.content?.replace(/<[^>]+>/g, '') || '';
    }

    // 타입별 content 길이 제한 (파일은 더 많이)
    const maxLen = note.type === 'file' ? 8000 : 3000;
    results.push({
      id: note.id,
      title: note.title,
      type: note.type,
      content: parsedContent.slice(0, maxLen),
      images: note.images,
    });
  }

  return results;
}

/** 2단계: 엔티티 추출 - 사람/장소/개념/날짜/키워드 JSON */
async function step2_entityExtraction(parsedNotes: ParsedNote[]): Promise<EntityResult> {
  const notesText = parsedNotes.map((n, i) =>
    `=== 메모 ${i + 1}: ${n.title} (${n.type}) ===\n${n.content}`
  ).join('\n\n');

  const prompt = `다음 메모들에서 핵심 엔티티를 추출하여 JSON으로 반환하세요.

${notesText}

다음 JSON 형식으로만 답변하세요 (마크다운 코드블록 포함 가능):
{
  "people": ["사람 이름 목록"],
  "places": ["장소 목록"],
  "concepts": ["핵심 개념/주제 목록"],
  "dates": ["날짜/기간 목록"],
  "keywords": ["중요 키워드 목록 (최대 15개)"],
  "tags": ["위키 태그 목록 (최대 8개)"],
  "summary": "전체 메모들의 핵심을 2~3문장으로 요약"
}`;

  const response = await geminiGenerate(prompt, 'gemini-2.5-flash', 0.2, 1024);
  const parsed = parseJsonResponse(response) as EntityResult | null;

  return parsed || {
    people: [],
    places: [],
    concepts: [],
    dates: [],
    keywords: [],
    tags: [],
    summary: '',
  };
}

/** 3단계: 충돌 해결 - 중복/모순 감지 및 통합 결정 */
async function step3_conflictResolution(
  parsedNotes: ParsedNote[],
  entities: EntityResult
): Promise<ConflictResult> {
  const notesText = parsedNotes.map((n, i) =>
    `[메모 ${i + 1}] ${n.title}\n${n.content.slice(0, 1500)}`
  ).join('\n\n---\n\n');

  const prompt = `다음 메모들을 분석하여 중복 내용과 모순 내용을 찾아 JSON으로 반환하세요.

핵심 키워드: ${entities.keywords.join(', ')}

${notesText}

다음 JSON 형식으로만 답변하세요:
{
  "duplicates": [
    {
      "topic": "중복된 주제",
      "memo_indices": [메모 번호들],
      "merged_content": "통합된 내용"
    }
  ],
  "contradictions": [
    {
      "topic": "모순된 주제",
      "description": "어떤 모순인지 설명",
      "resolution": "해결 방법 또는 두 입장 병기"
    }
  ],
  "unique_contributions": [
    {
      "memo_index": 메모번호,
      "unique_info": "이 메모만의 고유한 정보"
    }
  ]
}`;

  const response = await geminiGenerate(prompt, 'gemini-2.5-flash', 0.2, 1024);
  const parsed = parseJsonResponse(response) as ConflictResult | null;

  return parsed || {
    duplicates: [],
    contradictions: [],
    unique_contributions: [],
  };
}

/** 4단계: 구조 설계 - TOC + 섹션 아웃라인 */
async function step4_structureDesign(
  title: string,
  parsedNotes: ParsedNote[],
  entities: EntityResult,
  conflicts: ConflictResult
): Promise<StructureResult> {
  const prompt = `다음 정보를 바탕으로 위키 문서 구조를 설계하세요.

위키 제목: ${title}

핵심 개념: ${entities.concepts.slice(0, 8).join(', ')}
키워드: ${entities.keywords.slice(0, 10).join(', ')}
요약: ${entities.summary}

메모 제목들: ${parsedNotes.map((n, i) => `${i + 1}. ${n.title} (${n.type})`).join(', ')}
중복 주제: ${conflicts.duplicates.map(d => d.topic).join(', ') || '없음'}
모순 사항: ${conflicts.contradictions.length}건

다음 JSON 형식으로만 답변하세요:
{
  "sections": [
    {
      "level": 2,
      "heading": "섹션 제목",
      "description": "이 섹션에 포함할 내용",
      "source_memos": [관련 메모 인덱스들]
    }
  ],
  "toc_summary": "문서 전체 한 줄 설명"
}

규칙:
- 섹션은 4~8개 사이로
- 개요, 본론(2~5개), 결론 순서 권장
- 모순이 있으면 "논쟁 및 다양한 관점" 섹션 포함`;

  const response = await geminiGenerate(prompt, 'gemini-2.5-flash', 0.3, 1024);
  const parsed = parseJsonResponse(response) as StructureResult | null;

  return parsed || {
    sections: [
      { level: 2, heading: '개요', description: '전체 내용 요약', source_memos: [] },
      { level: 2, heading: '주요 내용', description: '핵심 정보', source_memos: [] },
      { level: 2, heading: '출처', description: '원본 메모', source_memos: [] },
    ],
    toc_summary: title,
  };
}

/** 5단계: 위키 마크다운 생성 - 앞 단계 결과물 기반 최종 작성 */
async function step5_generateWiki(
  title: string,
  parsedNotes: ParsedNote[],
  entities: EntityResult,
  conflicts: ConflictResult,
  structure: StructureResult
): Promise<string> {
  const notesDetail = parsedNotes.map((n, i) =>
    `=== [메모 ${i + 1}] ${n.title} (${n.type}) ===\n${n.content}`
  ).join('\n\n');

  const sectionsOutline = structure.sections.map((s) =>
    `${'#'.repeat(s.level)} ${s.heading}\n  → ${s.description} (메모 ${s.source_memos.join(', ')})`
  ).join('\n');

  const conflictNotes = conflicts.contradictions.length > 0
    ? `\n모순/논쟁 사항:\n${conflicts.contradictions.map(c => `- ${c.topic}: ${c.resolution}`).join('\n')}`
    : '';

  const prompt = `당신은 전문 위키 편집자입니다. 아래 분석 결과를 바탕으로 완성도 높은 위키 문서를 마크다운으로 작성하세요.

━━━ 위키 제목 ━━━
${title}

━━━ AI 분석 결과 ━━━
핵심 개념: ${entities.concepts.join(', ')}
주요 키워드: ${entities.keywords.join(', ')}
관련 인물: ${entities.people.join(', ') || '없음'}
장소: ${entities.places.join(', ') || '없음'}
날짜/기간: ${entities.dates.join(', ') || '없음'}
전체 요약: ${entities.summary}
${conflictNotes}

━━━ 문서 구조 (반드시 이 구조를 따르세요) ━━━
${sectionsOutline}

━━━ 원본 메모들 ━━━
${notesDetail}

━━━ 작성 지침 ━━━
1. 반드시 문서 맨 위에 ## 목차 섹션 추가 (내부 링크 포함)
2. 위 문서 구조의 섹션 순서와 제목을 그대로 사용
3. 각 섹션에 원본 메모의 내용을 재구성하여 작성 (단순 복붙 금지)
4. 중복 내용은 한 곳으로 통합, 모순은 명시
5. 중요 개념에 **굵게** 표시, 핵심 용어 정의 포함
6. 맨 아래 ## 출처 섹션에 원본 메모 제목과 유형 나열
7. 맨 아래 ## 태그 섹션: ${entities.tags.map(t => `#${t}`).join(' ')}
8. 한국어로 작성, 전문적이고 읽기 쉬운 문체
9. 최소 800자 이상의 충분한 내용 작성

위키 문서를 작성하세요:`;

  return await geminiGenerate(prompt, 'gemini-2.5-flash', 0.6, 8192);
}

// ─────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────
interface NoteData {
  id: string;
  title: string;
  type: string;
  content: string;
  images: string[];
}

interface ParsedNote {
  id: string;
  title: string;
  type: string;
  content: string;
  images: string[];
}

interface MindNode {
  id: string;
  topic?: string;
  children?: MindNode[];
}

interface EntityResult {
  people: string[];
  places: string[];
  concepts: string[];
  dates: string[];
  keywords: string[];
  tags: string[];
  summary: string;
}

interface ConflictResult {
  duplicates: { topic: string; memo_indices: number[]; merged_content: string }[];
  contradictions: { topic: string; description: string; resolution: string }[];
  unique_contributions: { memo_index: number; unique_info: string }[];
}

interface StructureResult {
  sections: { level: number; heading: string; description: string; source_memos: number[] }[];
  toc_summary: string;
}

// ─────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { noteIds, title } = await req.json();
  if (!noteIds?.length || !title) {
    return NextResponse.json({ error: '노트 ID와 제목이 필요합니다.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  if (!GEMINI_KEY()) {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(sseData(data))); } catch {}
      };

      try {
        // 노트 조회
        const { data: notes, error: notesErr } = await supabase
          .from('notes')
          .select('*, note_images(*)')
          .in('id', noteIds);

        if (notesErr || !notes) throw new Error('노트 조회 실패');

        // NoteData 정규화
        const noteDataList: NoteData[] = notes.map((note) => {
          const images = (note.note_images as Array<{
            original_url?: string; public_url?: string; annotated_url?: string;
          }> | null) || [];
          return {
            id: note.id as string,
            title: note.title as string,
            type: note.note_type as string,
            content: ((note.content_json as string) || (note.raw_text as string) || ''),
            images: images
              .map((img) => img.annotated_url || img.public_url || img.original_url || '')
              .filter(Boolean),
          };
        });

        // ── 1단계: 멀티모달 파싱 ──────────────────
        send({ step: 1, status: 'processing', message: '이미지 분석 및 콘텐츠 파싱 중...' });
        const parsedNotes = await step1_multimodalParsing(noteDataList);
        send({ step: 1, status: 'done' });

        // ── 2단계: 엔티티 추출 ────────────────────
        send({ step: 2, status: 'processing', message: '핵심 개념·키워드 추출 중...' });
        const entities = await step2_entityExtraction(parsedNotes);
        send({ step: 2, status: 'done', data: { keywords: entities.keywords.slice(0, 5) } });

        // ── 3단계: 충돌 해결 ─────────────────────
        send({ step: 3, status: 'processing', message: '중복/모순 분석 중...' });
        const conflicts = await step3_conflictResolution(parsedNotes, entities);
        send({
          step: 3,
          status: 'done',
          data: {
            duplicates: conflicts.duplicates.length,
            contradictions: conflicts.contradictions.length,
          },
        });

        // ── 4단계: 구조 설계 ─────────────────────
        send({ step: 4, status: 'processing', message: '위키 구조 및 목차 설계 중...' });
        const structure = await step4_structureDesign(title, parsedNotes, entities, conflicts);
        send({
          step: 4,
          status: 'done',
          data: { sections: structure.sections.map((s) => s.heading) },
        });

        // ── 5단계: 위키 생성 ─────────────────────
        send({ step: 5, status: 'processing', message: '위키 문서 작성 중 (Gemini 2.5 Flash)...' });
        const wikiContent = await step5_generateWiki(
          title, parsedNotes, entities, conflicts, structure
        );
        if (!wikiContent) throw new Error('위키 내용 생성 실패');
        send({ step: 5, status: 'done' });

        // ── DB 저장 ───────────────────────────────
        const slug = slugify(title) + '-' + Date.now().toString(36);
        const { data: wiki, error: wikiErr } = await supabase
          .from('wiki_pages')
          .insert({
            slug,
            title,
            content: wikiContent,
            tags: entities.tags,
            user_id: session.user.id,
            version: 1,
            is_published: true,
          })
          .select()
          .single();

        if (wikiErr) throw new Error('위키 저장 실패: ' + wikiErr.message);

        // note_wiki_links 저장
        const links = noteIds.map((noteId: string) => ({
          note_id: noteId,
          wiki_id: wiki.id,
        }));
        const { error: linkErr } = await supabase
          .from('note_wiki_links')
          .upsert(links, { onConflict: 'note_id,wiki_id', ignoreDuplicates: true });
        if (linkErr) console.error('note_wiki_links 저장 실패:', linkErr.message);

        // wiki_history 저장
        try {
          await supabase.from('wiki_history').insert({
            wiki_id: wiki.id,
            content: wikiContent,
            version: 1,
            changed_by: session.user.id,
            change_summary: `${noteIds.length}개 메모에서 AI 5단계 파이프라인으로 생성`,
          });
        } catch { /* wiki_history 없으면 무시 */ }

        // 위키 임베딩 자동 생성 (non-blocking)
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/embed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            wikiId: wiki.id,
            text: `${title}\n${entities.summary}\n${entities.keywords.join(' ')}`,
          }),
        }).catch(() => {});

        send({ done: true, slug: wiki.slug, wikiId: wiki.id });

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
