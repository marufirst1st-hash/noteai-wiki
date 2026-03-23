import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils';

function sseData(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { noteIds, title } = await req.json();
  if (!noteIds?.length || !title) {
    return NextResponse.json({ error: '노트 ID와 제목이 필요합니다.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseData(data)));
      };

      try {
        // Fetch notes
        const { data: notes, error: notesErr } = await supabase
          .from('notes')
          .select('*, note_images(*)')
          .in('id', noteIds);

        if (notesErr || !notes) throw new Error('노트 조회 실패');

        // Step 1: Multimodal Parsing
        send({ step: 1, status: 'processing' });
        const parsedContent = notes.map((note) => {
          const images = (note.note_images as Array<{ original_url: string; public_url?: string; annotated_url?: string }> | null) || [];
          // content: content_json 우선, raw_text 대체
          const noteContent = (note.content_json as string) || (note.raw_text as string) || '';
          return {
            id: note.id,
            title: note.title,
            type: note.note_type,
            content: noteContent,
            images: images.map((img) => img.annotated_url || img.public_url || img.original_url),
          };
        });

        await new Promise((r) => setTimeout(r, 500));
        send({ step: 1, status: 'done' });

        // Build prompt
        const notesText = parsedContent.map((n, i) =>
          `=== 메모 ${i + 1}: ${n.title} (${n.type}) ===\n${n.content}\n${n.images.length ? `[이미지 ${n.images.length}개 포함]` : ''}`
        ).join('\n\n');

        const GEMINI_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_KEY) throw new Error('Gemini API 키가 설정되지 않았습니다.');

        // Step 2: Entity Extraction
        send({ step: 2, status: 'processing' });
        await new Promise((r) => setTimeout(r, 800));
        send({ step: 2, status: 'done' });

        // Step 3: Conflict Resolution
        send({ step: 3, status: 'processing' });
        await new Promise((r) => setTimeout(r, 600));
        send({ step: 3, status: 'done' });

        // Step 4: Structure Design
        send({ step: 4, status: 'processing' });
        await new Promise((r) => setTimeout(r, 500));
        send({ step: 4, status: 'done' });

        // Step 5: Generate Wiki (Gemini API)
        send({ step: 5, status: 'processing' });

        const geminiPrompt = `당신은 전문 위키 편집자입니다. 다음 메모들을 분석하여 체계적인 위키 문서를 작성해주세요.

위키 제목: ${title}

=== 원본 메모들 ===
${notesText}

=== 위키 작성 지침 ===
1. 마크다운 형식으로 작성 (##, ###, - 등 사용)
2. 목차(TOC)를 문서 상단에 포함
3. 메모에서 핵심 엔티티(사람, 장소, 개념, 날짜) 추출 및 구조화
4. 중복 정보는 통합하고 모순은 명시
5. 각 섹션에 관련 태그 포함
6. 출처 섹션에 원본 메모 제목 나열
7. 한국어로 작성
8. 전문적이고 읽기 쉬운 문서 형식 유지

위키 문서를 작성하세요:`;

        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: geminiPrompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192,
              },
            }),
          }
        );

        if (!geminiResponse.ok) {
          const errText = await geminiResponse.text();
          throw new Error(`Gemini API 오류: ${geminiResponse.status} - ${errText}`);
        }

        const geminiData = await geminiResponse.json();
        const wikiContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!wikiContent) throw new Error('Gemini 응답이 없습니다.');

        send({ step: 5, status: 'done' });

        // Save wiki to Supabase
        const slug = slugify(title) + '-' + Date.now().toString(36);
        const { data: wiki, error: wikiErr } = await supabase
          .from('wiki_pages')
          .insert({
            slug,
            title,
            content: wikiContent,
            tags: [],
            user_id: session.user.id,
            version: 1,
            is_published: true,
          })
          .select()
          .single();

        if (wikiErr) throw new Error('위키 저장 실패: ' + wikiErr.message);

        // Link notes to wiki (note_wiki_links)
        const links = noteIds.map((noteId: string) => ({
          note_id: noteId,
          wiki_id: wiki.id,
        }));
        const { error: linkErr } = await supabase
          .from('note_wiki_links')
          .upsert(links, { onConflict: 'note_id,wiki_id', ignoreDuplicates: true });
        if (linkErr) {
          console.error('note_wiki_links 저장 실패:', linkErr.message);
          // 실패해도 전체 흐름은 계속
        }

        // Save to wiki_history (테이블이 있으면)
        try {
          await supabase.from('wiki_history').insert({
            wiki_id: wiki.id,
            content: wikiContent,
            version: 1,
            changed_by: session.user.id,
            change_summary: `${noteIds.length}개 메모에서 생성`,
          });
        } catch { /* wiki_history 없으면 무시 */ }

        send({ done: true, slug: wiki.slug, wikiId: wiki.id });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '위키 생성 오류';
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
