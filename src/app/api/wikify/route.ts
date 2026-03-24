/**
 * POST /api/wikify
 * 
 * 1-2: 메모 → 위키 형식 변환
 * - 메모 내용을 목차+섹션+앵커 구조로 변환
 * - 정보 손실 없이 구조화만
 * - note의 wikified_content 필드에 저장
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiText, geminiMultimodal, stripHtml } from '@/lib/gemini';

interface MindNode { id: string; topic?: string; children?: MindNode[]; }

function flattenMindmap(node: MindNode, depth = 0): string {
  return '  '.repeat(depth) + `- ${node.topic || node.id}\n` +
    (node.children || []).map(c => flattenMindmap(c, depth + 1)).join('');
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY 없음' }, { status: 500 });

  const { noteId } = await req.json();
  if (!noteId) return NextResponse.json({ error: 'noteId 필요' }, { status: 400 });

  const { data: note, error } = await supabase
    .from('notes')
    .select('*, note_images(*)')
    .eq('id', noteId)
    .eq('user_id', session.user.id)
    .single();

  if (error || !note) return NextResponse.json({ error: '메모를 찾을 수 없음' }, { status: 404 });

  const noteType = note.note_type as string;
  const rawContent = (note.content_json || note.raw_text || '') as string;
  const images = ((note.note_images as Array<{ original_url?: string; annotated_url?: string }>) || [])
    .map(img => img.annotated_url || img.original_url || '').filter(Boolean);

  // 원문 추출
  let originalText = '';
  if (noteType === 'mindmap') {
    try {
      const d = JSON.parse(rawContent || '{}');
      originalText = `[마인드맵]\n${flattenMindmap(d.nodeData || d)}`;
    } catch { originalText = stripHtml(rawContent); }
  } else if (noteType === 'image' && images.length > 0) {
    originalText = await geminiMultimodal(
      `이미지의 모든 내용을 빠짐없이 텍스트로 추출하세요. 제목: ${note.title}`,
      images
    );
  } else {
    originalText = stripHtml(rawContent);
  }

  if (!originalText.trim()) {
    return NextResponse.json({ error: '위키화할 내용이 없습니다.' }, { status: 400 });
  }

  const today = new Date().toLocaleDateString('ko-KR');

  const prompt = `아래 메모를 위키 문서 형식으로 변환하세요.

━━━ 원문 (정보 손실 없이 전부 포함) ━━━
제목: ${note.title}
${originalText}

━━━ 출력 형식 ━━━
첫 번째 줄: TAGS: [태그1,태그2,...] (최대 8개, 핵심 키워드)

그 다음부터 마크다운 위키 본문:

**마지막 업데이트**: ${today}

## 목차
- [섹션1 제목](#앵커1)
- [섹션2 제목](#앵커2)

---

## 섹션1 제목 {#앵커1}
(원문 내용 전부 — 요약·생략 절대 금지)

## 섹션2 제목 {#앵커2}
(원문 내용 전부)

> 📎 출처: ${note.title}

━━━ 변환 규칙 ━━━
- 원문의 모든 항목을 빠짐없이 포함 (요약·생략 금지)
- Q&A 형태 → **Q.** / **A.** 형식으로 전부
- 표 데이터 → 마크다운 표(|열1|열2|) 전부
- 절차/단계 → 번호 목록 전부
- 앵커는 영문+숫자 (예: {#overview}, {#installation})
- 섹션 간 참조 링크 추가 권장

TAGS:`;

  try {
    // 긴 문서도 잘리지 않도록 최대 출력 토큰을 16384로 설정
    const raw = await geminiText(prompt, 16384, 0.2);

    // TAGS 파싱
    const lines = raw.split('\n');
    const tagsLine = lines.find(l => l.startsWith('TAGS:'));
    const tags = tagsLine
      ? tagsLine.replace('TAGS:', '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 8)
      : [];
    const wikifiedContent = lines
      .filter(l => !l.startsWith('TAGS:'))
      .join('\n')
      .trim();

    // DB 저장: extracted_entities에 wikified_content + tags 저장
    await supabase.from('notes').update({
      extracted_entities: {
        wikified_content: wikifiedContent,
        wikified_at: new Date().toISOString(),
        tags,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', noteId).eq('user_id', session.user.id);

    return NextResponse.json({
      success: true,
      wikifiedContent,
      tags,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '위키화 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
