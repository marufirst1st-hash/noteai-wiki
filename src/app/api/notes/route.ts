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
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const body = await req.json();
  const { data, error } = await supabase
    .from('notes')
    .insert({ ...body, user_id: session.user.id, status: 'active' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger embedding (non-blocking)
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') || '' },
    body: JSON.stringify({ noteId: data.id }),
  }).catch(() => {});

  return NextResponse.json(data);
}
