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
      const raw = note.content || '';

      // 케이스1: 새 방식 — 원본 텍스트가 그대로 저장된 경우 (코드블록 없음)
      // 케이스2: 구 방식 — "## 파일 분석 결과" + 코드블록 안에 실제 내용
      const codeBlockMatch = raw.match(/```\n?([\s\S]*?)```/);
      const insideBlock = codeBlockMatch?.[1]?.trim() || '';

      let actualContent: string;

      if (insideBlock.length > 200) {
        // 구 방식: 코드블록 안의 원본 데이터 사용
        // "## 시트: Sheet1\n이름,부서..." 또는 "[페이지 1]\n내용..." 형태
        actualContent = insideBlock;
      } else {
        // 새 방식 또는 원본 그대로: content 전체 사용
        // "## 파일 분석 결과" 같은 헤더가 있으면 제거
        actualContent = raw
          .replace(/^## 파일 분석 결과[\s\S]*?```[\s\S]*?```/m, '')
          .replace(/<[^>]+>/g, '')
          .trim();
        if (!actualContent) actualContent = raw.replace(/<[^>]+>/g, '').trim();
      }

      content = actualContent.slice(0, 6000);

    } else {
      content = note.content?.replace(/<[^>]+>/g, '') || '';
    }

    const maxLen = note.type === 'file' ? 6000 : 2000;
    results.push({
      id: note.id, title: note.title, type: note.type,
      content: content.slice(0, maxLen),
    });
  }

  return results;
}

// ─────────────────────────────────────────
// 위키 섹션 파서 유틸리티
// ─────────────────────────────────────────

/** 마크다운에서 ## 섹션 목록 추출 */
function extractSections(wikiContent: string): string[] {
  return (wikiContent.match(/^## .+/gm) || []).map(h => h.replace(/^## /, '').replace(/\s*\{#[^}]+\}/, '').trim());
}

/** 기존 위키의 목차 블록을 새 목차로 교체 */
function replaceToc(wikiContent: string, newToc: string): string {
  // ## 목차 ... --- 사이를 교체
  const tocRegex = /^## 목차[\s\S]*?(?=\n---\n|\n## (?!목차))/m;
  if (tocRegex.test(wikiContent)) {
    return wikiContent.replace(tocRegex, newToc + '\n');
  }
  // 목차 없으면 맨 앞에 삽입
  return newToc + '\n\n---\n\n' + wikiContent;
}

/** 전체 섹션(앵커 포함) 목록으로 목차 마크다운 생성 */
function buildToc(sections: Array<{ title: string; anchor: string }>): string {
  const items = sections.map(s => `- [${s.title}](#${s.anchor})`).join('\n');
  return `## 목차\n${items}`;
}

/** 제목 → 앵커 변환 (영문·숫자만 남기고, 공백은 -, 한글은 romanize 간략화) */
function titleToAnchor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[가-힣]+/g, (m) => {
      // 한글이 섞인 경우 숫자 해시로 대체 (앵커 고유성 보장)
      let hash = 0;
      for (const c of m) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
      return 'sec-' + hash.toString(16);
    })
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

/** 기존 위키에서 특정 섹션 이름 뒤에 내용 추가 */
function insertIntoSection(wikiContent: string, sectionTitle: string, newContent: string): string {
  // "## 섹션명 {#...}" 또는 "## 섹션명" 패턴으로 찾기
  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(`(^## ${escapedTitle}(?:\\s*\\{#[^}]+\\})?)([\\s\\S]*?)(?=\\n## |$)`, 'm');
  const match = wikiContent.match(sectionRegex);
  if (!match) return wikiContent + '\n\n' + newContent; // 섹션 없으면 뒤에 추가

  const sectionEnd = match.index! + match[0].length;
  // 섹션 끝(다음 ## 직전)에 삽입
  return (
    wikiContent.slice(0, sectionEnd).trimEnd() +
    '\n\n' + newContent.trim() +
    '\n' +
    wikiContent.slice(sectionEnd)
  );
}

/** 2+3단계 통합: 위키 생성/업데이트
 *
 *  핵심 원칙:
 *  - 신규 위키: AI가 원문 전체를 위키 형식으로 변환
 *  - 기존 위키 업데이트: AI는 "새 내용을 위키 섹션 블록으로 변환"만 담당
 *    → 기존 위키는 코드에서 보존 후 AI 출력을 삽입 (AI가 기존 내용 절대 수정 불가)
 */
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

  // ── 신규 위키: AI가 전체 위키 초안 작성 ────────────────────────────────
  if (isFirstTime) {
    const prompt = `아래 자료를 위키 문서로 변환하세요. 내용을 요약하거나 축약하지 말고 원문 그대로 구조화하세요.

━━━ 자료 원문 ━━━
${notesDetail}

━━━ 출력 형식 ━━━
첫 줄: WIKI_TITLE: [제목]
두 번째 줄: WIKI_TAGS: [태그1,태그2,...] (최대 10개)
세 번째 줄부터: 마크다운 위키 본문

━━━ 위키 본문 구조 ━━━
**마지막 업데이트**: ${today} | **자료 수**: ${allLinkedNoteCount}개

## 목차
- [섹션1](#앵커1)
- [섹션2](#앵커2)

---

## 섹션1 제목 {#앵커1}
(원문 내용 그대로)

## 섹션2 제목 {#앵커2}
(원문 내용 그대로)

━━━ 작성 규칙 (엄수) ━━━
- 원문의 모든 항목을 빠짐없이 포함 (요약·생략 절대 금지)
- Q&A → 각 질문을 **Q.** / **A.** 형식으로 전부 나열
- 표 데이터 → 마크다운 표(|열1|열2|) 형식으로 전부 기재
- 절차/단계 → 번호 목록으로 순서대로 전부 기재
- 섹션 간 하이퍼링크 추가 (예: [시공 절차](#construction) 참고)
- 각 섹션 끝에 > 📎 출처: [메모 제목] 추가

WIKI_TITLE:
WIKI_TAGS:
`;

    const raw = await geminiGenerate(prompt, 16384, 0.3);
    return parseWikiOutput(raw, '회사 지식 베이스');
  }

  // ── 기존 위키 업데이트: AI는 새 내용 변환만, 코드에서 병합 ─────────────────
  // 1) 기존 섹션 목록 추출
  const existingSections = extractSections(existingWiki);

  // 2) AI에게: 새 내용을 위키 섹션 블록으로 변환 + 어느 기존 섹션에 넣을지 지정
  const sectionList = existingSections.length > 0
    ? `기존 섹션 목록:\n${existingSections.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`
    : '(기존 섹션 없음)';

  const prompt = `새 자료를 위키 섹션 블록으로 변환하세요. 기존 위키는 건드리지 않습니다.

━━━ 새로 추가할 자료 ━━━
${notesDetail}

━━━ ${sectionList}

━━━ 출력 형식 (반드시 준수) ━━━
WIKI_TITLE: [전체 위키 제목 — 기존과 동일하게 유지하거나 포괄적으로 수정]
WIKI_TAGS: [기존 태그 + 새 태그, 최대 10개]
---SECTIONS---
각 새 내용 블록을 아래 형식으로 출력:

TARGET_SECTION: [기존 섹션명 | NEW]
SECTION_TITLE: [기존 섹션명 그대로 | 새 섹션 제목]
SECTION_ANCHOR: [기존 앵커 | 새 앵커 영문]
CONTENT:
(위키 마크다운 내용 — 원문 그대로, 요약 절대 금지)
- Q&A → **Q.** / **A.** 형식으로 전부 나열
- 표 데이터 → 마크다운 표로 전부 기재
- 절차 → 번호 목록으로 전부 기재
> 📎 출처: [메모 제목]
---END---

TARGET_SECTION 규칙:
- 기존 섹션 목록에 관련 섹션이 있으면 → 그 섹션명 그대로 사용
- 새 주제라면 → "NEW"
- 여러 섹션에 나눠 넣어도 됨 (블록 반복)
`;

  const raw = await geminiGenerate(prompt, 16384, 0.3);

  // 3) AI 출력 파싱
  const { title: newTitle, tags: newTags, sectionsRaw } = parseUpdateOutput(raw);

  // 4) 코드에서 기존 위키에 새 섹션 블록 병합 (기존 내용 절대 수정 안 함)
  let updatedWiki = existingWiki;

  // 날짜/자료 수 갱신
  updatedWiki = updatedWiki.replace(
    /\*\*마지막 업데이트\*\*:.*?\|.*?\*\*자료 수\*\*:[^\n]*/,
    `**마지막 업데이트**: ${today} | **자료 수**: ${allLinkedNoteCount}개`
  );

  for (const block of sectionsRaw) {
    if (block.targetSection === 'NEW') {
      // 새 섹션: 위키 끝에 추가
      const anchor = block.anchor || titleToAnchor(block.title);
      updatedWiki = updatedWiki.trimEnd() + `\n\n## ${block.title} {#${anchor}}\n\n${block.content.trim()}\n`;
    } else {
      // 기존 섹션 내부에 삽입
      updatedWiki = insertIntoSection(updatedWiki, block.targetSection, block.content.trim());
    }
  }

  // 5) 목차 재생성 (전체 섹션 기준으로)
  const allSectionHeaders = (updatedWiki.match(/^## .+/gm) || [])
    .filter(h => !h.startsWith('## 목차'));
  const tocSections = allSectionHeaders.map(h => {
    const titlePart = h.replace(/^## /, '');
    const anchorMatch = titlePart.match(/\{#([^}]+)\}/);
    const anchor = anchorMatch ? anchorMatch[1] : titleToAnchor(titlePart.replace(/\s*\{#[^}]+\}/, '').trim());
    const title = titlePart.replace(/\s*\{#[^}]+\}/, '').trim();
    return { title, anchor };
  });
  const newToc = buildToc(tocSections);
  updatedWiki = replaceToc(updatedWiki, newToc);

  return { content: updatedWiki, title: newTitle || '회사 지식 베이스', tags: newTags };
}

/** AI 출력에서 WIKI_TITLE / WIKI_TAGS / 본문 파싱 */
function parseWikiOutput(raw: string, defaultTitle: string): { content: string; title: string; tags: string[] } {
  const lines = raw.split('\n');
  const titleLine = lines.find(l => l.startsWith('WIKI_TITLE:'));
  const tagsLine = lines.find(l => l.startsWith('WIKI_TAGS:'));
  const title = titleLine ? titleLine.replace('WIKI_TITLE:', '').trim() : defaultTitle;
  const tags = tagsLine
    ? tagsLine.replace('WIKI_TAGS:', '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 10)
    : [];
  const content = lines
    .filter(l => !l.startsWith('WIKI_TITLE:') && !l.startsWith('WIKI_TAGS:'))
    .join('\n')
    .trim();
  return { content, title, tags };
}

/** 업데이트용 AI 출력 파싱 (TARGET_SECTION / SECTION_TITLE / CONTENT 블록) */
function parseUpdateOutput(raw: string): {
  title: string;
  tags: string[];
  sectionsRaw: Array<{ targetSection: string; title: string; anchor: string; content: string }>;
} {
  const lines = raw.split('\n');
  const titleLine = lines.find(l => l.startsWith('WIKI_TITLE:'));
  const tagsLine = lines.find(l => l.startsWith('WIKI_TAGS:'));
  const title = titleLine ? titleLine.replace('WIKI_TITLE:', '').trim() : '';
  const tags = tagsLine
    ? tagsLine.replace('WIKI_TAGS:', '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 10)
    : [];

  const sectionsRaw: Array<{ targetSection: string; title: string; anchor: string; content: string }> = [];

  // ---SECTIONS--- 이후를 블록 단위로 파싱
  const sectionsStart = raw.indexOf('---SECTIONS---');
  if (sectionsStart === -1) {
    // 폴백: 전체를 하나의 NEW 섹션으로 처리
    const bodyLines = lines.filter(l => !l.startsWith('WIKI_TITLE:') && !l.startsWith('WIKI_TAGS:') && l !== '---SECTIONS---' && l !== '---END---');
    sectionsRaw.push({ targetSection: 'NEW', title: '새 내용', anchor: 'new-content-' + Date.now(), content: bodyLines.join('\n').trim() });
    return { title, tags, sectionsRaw };
  }

  const sectionsBody = raw.slice(sectionsStart + '---SECTIONS---'.length);
  // 블록 분리: TARGET_SECTION: 으로 시작하는 각 블록
  const blockRegex = /TARGET_SECTION:\s*(.+?)\nSECTION_TITLE:\s*(.+?)\nSECTION_ANCHOR:\s*(.+?)\nCONTENT:\n([\s\S]*?)(?=\nTARGET_SECTION:|\n---END---|$)/g;
  let match;
  while ((match = blockRegex.exec(sectionsBody)) !== null) {
    const targetSection = match[1].trim();
    const sectionTitle = match[2].trim();
    const anchor = match[3].trim();
    const content = match[4].trim();
    if (content) {
      sectionsRaw.push({ targetSection, title: sectionTitle, anchor, content });
    }
  }

  // 파싱 실패 시 폴백
  if (sectionsRaw.length === 0) {
    const fallback = sectionsBody.replace(/---END---/g, '').trim();
    if (fallback) {
      sectionsRaw.push({ targetSection: 'NEW', title: '새 내용', anchor: 'new-' + Date.now(), content: fallback });
    }
  }

  return { title, tags, sectionsRaw };
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
