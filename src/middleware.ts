import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const path = request.nextUrl.pathname;

  // 로그인 필요 경로
  const protectedPaths = ['/dashboard', '/note', '/wiki', '/search', '/admin'];
  const isProtected = protectedPaths.some((p) => path.startsWith(p));
  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 관리자 전용 경로
  if (path.startsWith('/admin')) {
    const meta = session?.user?.app_metadata;
    const isAdmin = meta?.is_admin === true || meta?.role === 'admin';
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js|api/).*)'],
};
