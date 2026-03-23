import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    content: (row.content as string) ?? (row.content_json as string) ?? (row.raw_text as string) ?? null,
    tags: (row.tags as string[]) ?? (row.extracted_entities as Record<string, unknown>)?.tags ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    thumbnail_url: (row.thumbnail_url as string) ?? null,
    note_images: Array.isArray(row.note_images)
      ? (row.note_images as Record<string, unknown>[]).map(normalizeImage)
      : undefined,
  };
}

// note_images 컬럼 변환 (original_url → public_url)
function normalizeImage(img: Record<string, unknown>) {
  return {
    id: img.id,
    note_id: img.note_id,
    public_url: (img.public_url as string) ?? (img.original_url as string) ?? '',
    annotated_url: img.annotated_url,
    annotation_data: img.annotation_data ?? img.fabric_json,
    file_name: img.file_name ?? img.ai_description ?? '',
    file_size: img.file_size,
    mime_type: img.mime_type ?? 'image/*',
    created_at: img.created_at,
  };
}

// 코드 인터페이스 → DB 컬럼 변환
function denormalizeNote(body: Record<string, unknown>) {
  const dbData: Record<string, unknown> = {};
  if (body.title !== undefined) dbData.title = body.title;
  if (body.note_type !== undefined) dbData.note_type = body.note_type;
  if (body.status !== undefined) dbData.status = body.status;
  if (body.content !== undefined) {
    dbData.content_json = body.content;
    dbData.raw_text = typeof body.content === 'string'
      ? body.content.replace(/<[^>]+>/g, '').slice(0, 5000)
      : '';
  }
  if (body.tags !== undefined) {
    dbData.extracted_entities = {
      ...(typeof body.tags === 'object' ? {} : {}),
      tags: body.tags,
    };
  }
  return dbData;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { data, error } = await supabase
    .from('notes')
    .select('*, note_images(*)')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(normalizeNote(data));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const body = await req.json();
  const dbData = denormalizeNote(body);

  const { data, error } = await supabase
    .from('notes')
    .update({ ...dbData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(normalizeNote(data));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { error } = await supabase
    .from('notes')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
