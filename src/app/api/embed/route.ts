import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const { noteId, wikiId, text } = await req.json();
  if (!text && !noteId && !wikiId) {
    return NextResponse.json({ error: '파라미터 필요' }, { status: 400 });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return NextResponse.json({ error: 'API 키 없음' }, { status: 500 });

  try {
    let contentText = text;

    if (!contentText && noteId) {
      const supabase = createAdminClient();
      const { data } = await supabase.from('notes').select('title, content').eq('id', noteId).single();
      contentText = `${data?.title}\n${data?.content || ''}`;
    }

    if (!contentText) return NextResponse.json({ error: '내용 없음' }, { status: 400 });

    // Gemini text-embedding-004
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: contentText.slice(0, 2000) }] },
        }),
      }
    );

    if (!response.ok) throw new Error('임베딩 API 오류');
    const data = await response.json();
    const embedding = data.embedding?.values;
    if (!embedding) throw new Error('임베딩 값 없음');

    const supabase = createAdminClient();
    if (noteId) {
      await supabase.from('note_embeddings').upsert({
        note_id: noteId,
        embedding,
        model: 'text-embedding-004',
      });
    } else if (wikiId) {
      await supabase.from('wiki_embeddings').upsert({
        wiki_id: wikiId,
        embedding,
        model: 'text-embedding-004',
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '임베딩 오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
