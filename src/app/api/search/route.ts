import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query?.trim()) return NextResponse.json({ error: '검색어 필요' }, { status: 400 });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return NextResponse.json({ error: 'API 키 없음' }, { status: 500 });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  try {
    // Get query embedding
    const embedRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: query }] },
        }),
      }
    );
    if (!embedRes.ok) throw new Error('임베딩 실패');
    const embedData = await embedRes.json();
    const queryEmbedding = embedData.embedding?.values;
    if (!queryEmbedding) throw new Error('임베딩 없음');

    // Search notes
    const { data: noteResults } = await supabase.rpc('search_notes', {
      query_embedding: queryEmbedding,
      user_id_param: session.user.id,
      match_threshold: 0.5,
      match_count: 10,
    });

    // Search wikis
    const { data: wikiResults } = await supabase.rpc('search_wikis', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 5,
    });

    const results = [
      ...(noteResults || []).map((r: Record<string, unknown>) => ({ ...r, type: 'note' })),
      ...(wikiResults || []).map((r: Record<string, unknown>) => ({ ...r, type: 'wiki' })),
    ].sort((a, b) => (b.similarity as number) - (a.similarity as number));

    return NextResponse.json(results);
  } catch (err: unknown) {
    // Fallback: keyword search
    const { data: notesFallback } = await supabase
      .from('notes')
      .select('id, title, content, note_type, created_at')
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .ilike('title', `%${query}%`)
      .limit(10);

    const { data: wikisFallback } = await supabase
      .from('wiki_pages')
      .select('id, title, content, created_at')
      .ilike('title', `%${query}%`)
      .limit(5);

    return NextResponse.json([
      ...(notesFallback || []).map((n) => ({ ...n, type: 'note', similarity: 0.5 })),
      ...(wikisFallback || []).map((w) => ({ ...w, type: 'wiki', similarity: 0.5 })),
    ]);
  }
}
