/**
 * POST /api/note/refine
 * 
 * 1-1가: 메모 내용 정리
 * - 중복 문장 제거
 * - 오타 교정
 * - 긴 내용 핵심 위주로 간추림
 * - 원문의 모든 정보는 보존 (삭제 아님, 압축만)
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

  // 메모 조회
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

  // 타입별 원문 추출
  let originalText = '';
  if (noteType === 'mindmap') {
    try {
      const d = JSON.parse(rawContent || '{}');
      originalText = `[마인드맵]\n${flattenMindmap(d.nodeData || d)}`;
    } catch { originalText = stripHtml(rawContent); }
  } else if (noteType === 'image' && images.length > 0) {
    originalText = await geminiMultimodal(
      `이미지의 모든 텍스트와 핵심 정보를 빠짐없이 추출하세요. 제목: ${note.title}`,
      images
    );
  } else {
    originalText = stripHtml(rawContent);
  }

  if (!originalText.trim()) {
    return NextResponse.json({ error: '정리할 내용이 없습니다.' }, { status: 400 });
  }

  // AI 정리
  const prompt = `아래 메모를 정리하세요.

━━━ 정리 규칙 ━━━
1. 중복 문장/내용 통합 (중복 제거, 정보는 보존)
2. 명백한 오타/띄어쓰기 교정
3. 긴 나열은 그룹화 (정보 손실 없이)
4. 구조: 제목이 있으면 제목 유지, 없으면 적절한 소제목 부여
5. 원문의 모든 정보 유지 (임의 삭제 금지)
6. 형식: 마크다운 (## 소제목, - 목록, **강조**)

━━━ 원문 ━━━
제목: ${note.title}
${originalText}

━━━ 정리된 메모 (마크다운) ━━━`;

  try {
    const refined = await geminiText(prompt, 4096, 0.2);

    // DB에 정리된 내용 저장 (raw_text에 저장, content_json은 유지)
    await supabase.from('notes').update({
      raw_text: refined,
      content_json: refined,
      updated_at: new Date().toISOString(),
    }).eq('id', noteId).eq('user_id', session.user.id);

    return NextResponse.json({
      success: true,
      // original은 응답 미리보기용으로만 사용 (실제 저장은 refined 전체가 DB에 저장됨)
      originalLength: originalText.length,
      refined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '정리 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
