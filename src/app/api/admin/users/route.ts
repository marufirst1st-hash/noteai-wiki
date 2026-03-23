import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// 관리자 권한 확인
async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const isAdmin = user.app_metadata?.is_admin === true || user.app_metadata?.role === 'admin';
  return isAdmin ? user : null;
}

// GET: 전체 사용자 목록
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.user_metadata?.name || u.email?.split('@')[0] || '-',
    is_admin: u.app_metadata?.is_admin === true || u.app_metadata?.role === 'admin',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed: !!u.email_confirmed_at,
  }));

  return NextResponse.json({ users });
}

// POST: 신규 사용자 추가
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  const { email, password, name, is_admin } = await req.json();
  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 });

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: name || email.split('@')[0] },
    app_metadata: { is_admin: !!is_admin, role: is_admin ? 'admin' : 'user', provider: 'email', providers: ['email'] },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ user: data.user });
}
