import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = supabase
    .from('notes')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (type) query = query.eq('note_type', type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // DB 컬럼명 → 코드 필드명 매핑
  const mapped = (data || []).map(normalizeNote);
  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const body = await req.json();

  // 코드 필드명 → DB 컬럼명 매핑
  const dbData = denormalizeNote(body);

  const { data, error } = await supabase
    .from('notes')
    .insert({ ...dbData, user_id: session.user.id, status: 'active' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = normalizeNote(data);

  // Trigger embedding (non-blocking)
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
    body: JSON.stringify({ noteId: data.id }),
  }).catch(() => {});

  return NextResponse.json(result);
}

// DB 컬럼 → 코드 인터페이스 변환
function normalizeNote(row: Record<string, unknown>) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    note_type: row.note_type,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // content: content_json 우선, 없으면 raw_text
    content: (row.content as string) ?? (row.content_json as string) ?? (row.raw_text as string) ?? null,
    // tags: DB에 있으면 그대로, 없으면 빈 배열
    tags: (row.tags as string[]) ?? [],
    // metadata: DB에 있으면 그대로
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    thumbnail_url: (row.thumbnail_url as string) ?? null,
    // note_images가 join된 경우 처리
    note_images: row.note_images,
  };
}

// 코드 인터페이스 → DB 컬럼 변환
function denormalizeNote(body: Record<string, unknown>) {
  const dbData: Record<string, unknown> = {};

  // 기본 필드
  if (body.title !== undefined) dbData.title = body.title;
  if (body.note_type !== undefined) dbData.note_type = body.note_type;
  if (body.status !== undefined) dbData.status = body.status;

  // content → content_json (DB 컬럼)
  // ⚠️ raw_text는 전체 원문을 보존해야 하므로 절대 자르지 않음
  if (body.content !== undefined) {
    dbData.content_json = body.content;
    dbData.raw_text = typeof body.content === 'string'
      ? body.content.replace(/<[^>]+>/g, '')
      : '';
  }

  // tags → DB에 tags 컬럼 없으면 extracted_entities에 저장
  if (body.tags !== undefined) {
    // tags 컬럼이 있으면 저장 시도, 없으면 무시
    dbData.extracted_entities = { tags: body.tags };
  }

  // metadata는 무시 (DB 컬럼 없음)

  return dbData;
}
