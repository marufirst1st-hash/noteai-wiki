import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return null;
  const isAdmin = user.app_metadata?.is_admin === true || user.app_metadata?.role === 'admin';
  return isAdmin ? user : null;
}

// PATCH: 사용자 수정 (이름, 비밀번호, 관리자 권한)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin(req);
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.user_metadata = { name: body.name };
  if (body.password) updates.password = body.password;
  if (body.is_admin !== undefined) {
    updates.app_metadata = {
      is_admin: body.is_admin,
      role: body.is_admin ? 'admin' : 'user',
      provider: 'email',
      providers: ['email'],
    };
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(id, updates);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ user: data.user });
}

// DELETE: 사용자 삭제
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin(req);
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  const { id } = await params;

  // 자기 자신은 삭제 불가
  if (admin.id === id) return NextResponse.json({ error: '자신의 계정은 삭제할 수 없습니다.' }, { status: 400 });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
