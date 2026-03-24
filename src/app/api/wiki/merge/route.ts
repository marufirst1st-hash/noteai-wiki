/**
 * POST /api/wiki/merge  (SSE 스트리밍)
 * 
 * 2단계: 위키화된 메모들 → 통합 위키에 병합
 * 
 * 흐름:
 *  Step1: 메모 원문 추출 + 위키화 (wikified_content 없으면 즉석 변환)
 *  Step2: 통합 위키와 중복 내용 확인
 *  Step3: 중복 제외 후 섹션별 병합
 *  Step4: DB 저장
 *  Step5: 검색 인덱스
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiText, geminiMultimodal, sseMsg, stripHtml } from '@/lib/gemini';

const MASTER_SLUG = 'master-wiki';

interface MindNode { id: string; topic?: string; children?: MindNode[]; }
function flattenMindmap(node: MindNode, depth = 0): string {
  return '  '.repeat(depth) + `- ${node.topic || node.id}\n` +
    (node.children || []).map(c => flattenMindmap(c, depth + 1)).join('');
}

// 섹션 목록 추출 (## 헤딩)
function extractSections(content: string): Array<{ title: string; anchor: string }> {
  return (content.match(/^## .+/gm) || [])
    .filter(h => !h.startsWith('## 목차'))
    .map(h => {
      const full = h.replace(/^## /, '');
      const anchorMatch = full.match(/\{#([^}]+)\}/);
      const anchor = anchorMatch ? anchorMatch[1] : '';
      const title = full.replace(/\s*\{#[^}]+\}/, '').trim();
      return { title, anchor };
    });
}

// 목차 재생성
function rebuildToc(content: string): string {
  const sections = extractSections(content);
  if (sections.length === 0) return content;

  const tocLines = sections.map(s => {
    const href = s.anchor || s.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '-').replace(/-+/g, '-');
    return `- [${s.title}](#${href})`;
  });
  const newToc = `## 목차\n${tocLines.join('\n')}`;

  // 기존 목차 교체 또는 맨 앞 삽입
  const tocRegex = /^## 목차[\s\S]*?(?=\n---\n|\n## (?!목차)|$)/m;
  if (tocRegex.test(content)) return content.replace(tocRegex, newToc + '\n');

  // 날짜 줄 다음에 삽입
  return content.replace(
    /(\*\*마지막 업데이트\*\*:[^\n]*\n)/,
    `$1\n${newToc}\n\n---\n\n`
  ) || newToc + '\n\n---\n\n' + content;
}

// 날짜/자료수 갱신
function updateHeader(content: string, noteCount: number): string {
  const today = new Date().toLocaleDateString('ko-KR');
  return content.replace(
    /\*\*마지막 업데이트\*\*:.*?\|.*?\*\*자료 수\*\*:[^\n]*/,
    `**마지막 업데이트**: ${today} | **자료 수**: ${noteCount}개`
  );
}

export async function POST(req: NextRequest) {
  const { noteIds } = await req.json();
  if (!noteIds?.length) return NextResponse.json({ error: 'noteIds 필요' }, { status: 400 });

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
        // ── Step 1: 메모 로드 + 위키화 ─────────────────────────
        send({ step: 1, status: 'processing', message: `${noteIds.length}개 메모 준비 중...` });

        const [wikiRes, notesRes] = await Promise.all([
          supabase.from('wiki_pages').select('*').eq('slug', MASTER_SLUG).eq('user_id', session.user.id).single(),
          supabase.from('notes').select('*, note_images(*)').in('id', noteIds),
        ]);

        const existingWiki = wikiRes.data;
        const notes = notesRes.data || [];
        if (!notes.length) throw new Error('메모를 찾을 수 없습니다.');

        const today = new Date().toLocaleDateString('ko-KR');

        // 기존 연결 메모 ID
        let alreadyLinked = new Set<string>();
        if (existingWiki) {
          const { data: links } = await supabase.from('note_wiki_links').select('note_id').eq('wiki_id', existingWiki.id);
          alreadyLinked = new Set((links || []).map((l: { note_id: string }) => l.note_id));
        }
        const newNoteIds = noteIds.filter((id: string) => !alreadyLinked.has(id));
        const totalNoteIds = [...new Set([...Array.from(alreadyLinked), ...noteIds])];

        // 각 메모의 위키화 내용 추출
        interface WikifiedNote { id: string; title: string; content: string; isNew: boolean; }
        const wikifiedNotes: WikifiedNote[] = [];

        for (const note of notes) {
          const isNew = newNoteIds.includes(note.id as string);
          const entities = (note.extracted_entities as Record<string, unknown>) || {};
          let wikiContent = (entities.wikified_content as string) || '';

          // wikified_content 없으면 즉석 변환
          if (!wikiContent) {
            const noteType = note.note_type as string;
            const rawContent = (note.content_json || note.raw_text || '') as string;
            const images = ((note.note_images as Array<{ original_url?: string; annotated_url?: string }>) || [])
              .map(img => img.annotated_url || img.original_url || '').filter(Boolean);

            let text = '';
            if (noteType === 'mindmap') {
              try {
                const d = JSON.parse(rawContent || '{}');
                text = flattenMindmap(d.nodeData || d);
              } catch { text = stripHtml(rawContent); }
            } else if (noteType === 'image' && images.length > 0) {
              text = await geminiMultimodal(`이미지 내용 추출: ${note.title}`, images);
            } else {
              text = stripHtml(rawContent);
            }
            wikiContent = text || '(내용 없음)';
          }

          wikifiedNotes.push({ id: note.id as string, title: note.title as string, content: wikiContent, isNew });
        }

        // 새 메모만 병합 대상
        const newNotes = wikifiedNotes.filter(n => n.isNew);
        send({ step: 1, status: 'done', message: `${newNotes.length}개 신규 메모 처리 완료` });

        if (newNotes.length === 0) {
          send({ done: true, message: '새로 추가할 메모가 없습니다. (이미 모두 위키에 반영됨)', isUpdate: true, version: existingWiki?.version || 1, totalNotes: totalNoteIds.length });
          controller.close();
          return;
        }

        // ── Step 2: 중복 확인 ──────────────────────────────────
        send({ step: 2, status: 'processing', message: '통합 위키와 중복 내용 확인 중...' });

        let finalContent = '';
        let newTitle = '지식 베이스';
        let newTags: string[] = [];

        if (!existingWiki || (existingWiki.content as string).trim().length < 50) {
          // ── 신규 위키 생성 ────────────────────────────────────
          send({ step: 2, status: 'done', message: '신규 위키 생성' });
          send({ step: 3, status: 'processing', message: '위키 초안 생성 중...' });

          const allContent = newNotes.map((n, i) =>
            `=== [자료 ${i + 1}] ${n.title} ===\n${n.content}`
          ).join('\n\n');

          const prompt = `아래 자료들을 하나의 통합 위키로 만드세요.

━━━ 자료 ━━━
${allContent}

━━━ 출력 형식 ━━━
첫 줄: WIKI_TITLE: [제목]
둘째 줄: WIKI_TAGS: [태그1,태그2,...] (최대 10개)
셋째 줄~: 마크다운 본문

━━━ 본문 구조 ━━━
**마지막 업데이트**: ${today} | **자료 수**: ${totalNoteIds.length}개

## 목차
- [섹션명](#앵커)

---

## 섹션명 {#앵커}
(내용 전부 — 요약·생략 절대 금지)

> 📎 출처: [자료 제목]

━━━ 규칙 ━━━
- 모든 내용 빠짐없이 포함
- Q&A → **Q.** / **A.** 전부
- 표 → 마크다운 표 전부
- 앵커: 영문+숫자

WIKI_TITLE:`;

          const raw = await geminiText(prompt, 16384, 0.2);
          const lines = raw.split('\n');
          const tl = lines.find(l => l.startsWith('WIKI_TITLE:'));
          const tagl = lines.find(l => l.startsWith('WIKI_TAGS:'));
          newTitle = tl ? tl.replace('WIKI_TITLE:', '').trim() : '지식 베이스';
          newTags = tagl ? tagl.replace('WIKI_TAGS:', '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 10) : [];
          finalContent = lines.filter(l => !l.startsWith('WIKI_TITLE:') && !l.startsWith('WIKI_TAGS:')).join('\n').trim();

        } else {
          // ── 기존 위키 업데이트 ────────────────────────────────
          const existingContent = existingWiki.content as string;
          const existingSections = extractSections(existingContent);
          const sectionList = existingSections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

          // 중복 확인: 각 새 메모에 대해 어느 섹션과 겹치는지 파악
          const newContentSummary = newNotes.map(n => `[${n.title}]: ${n.content.slice(0, 800)}`).join('\n\n');

          const dupCheckPrompt = `통합 위키에 새 자료를 추가하려 합니다. 중복 내용을 확인하세요.

━━━ 기존 위키 섹션 목록 ━━━
${sectionList || '(섹션 없음)'}

━━━ 추가할 새 자료 (요약) ━━━
${newContentSummary}

━━━ 분석 결과 출력 형식 ━━━
각 새 자료에 대해:
MATERIAL: [자료 제목]
DUPLICATE_SECTIONS: [중복 내용이 있는 기존 섹션명들, 없으면 "없음"]
TARGET_SECTION: [추가할 기존 섹션명 | NEW]
NEW_SECTION_TITLE: [TARGET이 NEW일 때 새 섹션 제목]
NEW_SECTION_ANCHOR: [TARGET이 NEW일 때 영문 앵커]
DUPLICATE_NOTES: [기존 위키에 이미 있어서 제외할 내용 설명, 없으면 "없음"]
---`;

          send({ step: 2, status: 'processing', message: 'AI 중복 분석 중...' });
          const dupAnalysis = await geminiText(dupCheckPrompt, 2048, 0.1);
          send({ step: 2, status: 'done', message: '중복 분석 완료' });

          // ── Step 3: 섹션별 병합 ─────────────────────────────
          send({ step: 3, status: 'processing', message: '섹션별 내용 통합 중...' });

          // 각 새 메모를 위키 섹션 블록으로 변환
          const mergePrompt = `새 자료를 통합 위키의 섹션 블록으로 변환하세요.

━━━ 기존 위키 섹션 목록 ━━━
${sectionList || '(없음)'}

━━━ 중복 분석 결과 ━━━
${dupAnalysis}

━━━ 추가할 새 자료 (전문) ━━━
${newNotes.map((n, i) => `=== [자료 ${i + 1}] ${n.title} ===\n${n.content}`).join('\n\n')}

━━━ 출력 형식 ━━━
WIKI_TITLE: [전체 위키 제목 — 포괄적으로]
WIKI_TAGS: [기존+새 태그, 최대 10개]
---BLOCKS---
각 추가 블록:

TARGET: [기존 섹션명 | NEW]
SECTION_TITLE: [기존 섹션명 그대로 | 새 제목]
ANCHOR: [기존 앵커 | 새 영문앵커]
CONTENT:
(위키 마크다운 — 원문 전부, 요약 금지)
(이미 위키에 있는 중복 내용은 제외)
> 📎 출처: [자료 제목]
---END---

━━━ 규칙 ━━━
- 중복 내용은 추가하지 말 것
- 원문의 새 정보는 전부 포함
- Q&A → **Q.** / **A.** 전부
- 표 → 마크다운 표 전부`;

          const mergeRaw = await geminiText(mergePrompt, 16384, 0.2);

          // 파싱
          const titleLine = mergeRaw.split('\n').find(l => l.startsWith('WIKI_TITLE:'));
          const tagsLine = mergeRaw.split('\n').find(l => l.startsWith('WIKI_TAGS:'));
          newTitle = titleLine ? titleLine.replace('WIKI_TITLE:', '').trim() : (existingWiki.title as string);
          newTags = tagsLine ? tagsLine.replace('WIKI_TAGS:', '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 10) : (existingWiki.tags as string[] || []);

          // 블록 파싱
          interface Block { target: string; title: string; anchor: string; content: string; }
          const blocks: Block[] = [];
          const blocksStart = mergeRaw.indexOf('---BLOCKS---');
          if (blocksStart !== -1) {
            const blocksBody = mergeRaw.slice(blocksStart + '---BLOCKS---'.length);
            const blockRe = /TARGET:\s*(.+?)\nSECTION_TITLE:\s*(.+?)\nANCHOR:\s*(.+?)\nCONTENT:\n([\s\S]*?)(?=\nTARGET:|\n---END---|$)/g;
            let m;
            while ((m = blockRe.exec(blocksBody)) !== null) {
              const content = m[4].trim();
              if (content) blocks.push({ target: m[1].trim(), title: m[2].trim(), anchor: m[3].trim(), content });
            }
          }

          // 기존 위키에 블록 삽입
          let updated = existingContent;

          for (const block of blocks) {
            if (block.target === 'NEW') {
              // 새 섹션: 위키 끝에 추가
              updated = updated.trimEnd() + `\n\n## ${block.title} {#${block.anchor}}\n\n${block.content}\n`;
            } else {
              // 기존 섹션에 추가 (섹션 끝, 다음 ## 직전)
              const escaped = block.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const re = new RegExp(`(^## ${escaped}(?:\\s*\\{#[^}]+\\})?)([\\s\\S]*?)(?=\\n## |$)`, 'm');
              const match = updated.match(re);
              if (match) {
                const insertAt = match.index! + match[0].length;
                updated = updated.slice(0, insertAt).trimEnd() + '\n\n' + block.content + '\n' + updated.slice(insertAt);
              } else {
                // 섹션 못찾으면 끝에 추가
                updated = updated.trimEnd() + `\n\n## ${block.title} {#${block.anchor}}\n\n${block.content}\n`;
              }
            }
          }

          // 헤더 날짜/자료수 갱신
          updated = updateHeader(updated, totalNoteIds.length);
          // 목차 재생성
          finalContent = rebuildToc(updated);
        }

        send({ step: 3, status: 'done' });

        // ── Step 4: DB 저장 ──────────────────────────────────
        send({ step: 4, status: 'processing', message: '저장 중...' });

        let wikiId: string;
        const newVersion = existingWiki ? (existingWiki.version as number) + 1 : 1;

        if (existingWiki) {
          await supabase.from('wiki_pages').update({
            title: newTitle, content: finalContent, tags: newTags,
            version: newVersion, updated_at: new Date().toISOString(),
          }).eq('id', existingWiki.id);
          wikiId = existingWiki.id as string;
        } else {
          const { data: newWiki } = await supabase.from('wiki_pages').insert({
            slug: MASTER_SLUG, title: newTitle, content: finalContent,
            tags: newTags, user_id: session.user.id, version: 1, is_published: true,
          }).select().single();
          wikiId = newWiki!.id as string;
        }

        // note_wiki_links 저장
        if (newNoteIds.length > 0) {
          await supabase.from('note_wiki_links')
            .upsert(newNoteIds.map((id: string) => ({ note_id: id, wiki_id: wikiId })), { onConflict: 'note_id,wiki_id', ignoreDuplicates: true });
        }

        // wiki_history
        try {
          await supabase.from('wiki_history').insert({
            wiki_id: wikiId, content: finalContent, version: newVersion,
            changed_by: session.user.id,
            change_summary: `메모 ${newNoteIds.length}개 추가 (총 ${totalNoteIds.length}개)`,
          });
        } catch { /* ignore */ }

        send({ step: 4, status: 'done' });

        // ── Step 5: 임베딩 ───────────────────────────────────
        send({ step: 5, status: 'processing', message: '검색 인덱스 갱신 중...' });
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
          body: JSON.stringify({ wikiId, text: `${newTitle}\n${newTags.join(' ')}` }),
        }).catch(() => {});
        send({ step: 5, status: 'done' });

        send({
          done: true, slug: MASTER_SLUG, wikiId,
          isUpdate: !!existingWiki, version: newVersion,
          title: newTitle, newNotesAdded: newNoteIds.length, totalNotes: totalNoteIds.length,
        });

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '오류 발생';
        console.error('wiki/merge 오류:', err);
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
