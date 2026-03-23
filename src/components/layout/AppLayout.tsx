'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  BookOpen, LayoutDashboard, Globe, Search,
  Plus, Menu, X, Moon, Sun, LogOut, Crown
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const meta = session?.user?.app_metadata;
      setIsAdmin(meta?.is_admin === true || meta?.role === 'admin');
    });
  }, [supabase.auth]);

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: '대시보드' },
    { href: '/wiki', icon: Globe, label: '위키' },
    { href: '/search', icon: Search, label: '검색' },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    toast.success('로그아웃되었습니다.');
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-all duration-300 flex-shrink-0',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100 dark:border-gray-800">
          {sidebarOpen && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-gray-900 dark:text-white text-sm">NoteAI Wiki</span>
            </Link>
          )}
          {!sidebarOpen && (
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center mx-auto">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              'p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
              !sidebarOpen && 'mt-2'
            )}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* New Note Button */}
        <div className="px-3 py-3">
          <Link
            href="/note/new"
            className={cn(
              'flex items-center gap-2 w-full rounded-lg bg-primary-600 text-white font-medium text-sm hover:bg-primary-700 transition-colors',
              sidebarOpen ? 'px-4 py-2.5' : 'p-2.5 justify-center'
            )}
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && '새 메모'}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100',
                  !sidebarOpen && 'justify-center px-2'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span>{label}</span>}
              </Link>
            );
          })}

          {/* 관리자 메뉴 */}
          {isAdmin && (
            <>
              {sidebarOpen && (
                <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  관리자
                </p>
              )}
              {!sidebarOpen && <div className="border-t border-gray-100 dark:border-gray-800 my-2" />}
              <Link
                href="/admin"
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === '/admin'
                    ? 'bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-yellow-50 dark:hover:bg-yellow-950 hover:text-yellow-700 dark:hover:text-yellow-300',
                  !sidebarOpen && 'justify-center px-2'
                )}
              >
                <Crown className="w-5 h-5 flex-shrink-0 text-yellow-500" />
                {sidebarOpen && <span>회원 관리</span>}
              </Link>
            </>
          )}
        </nav>

        {/* Bottom Actions */}
        <div className="px-3 pb-4 space-y-1 border-t border-gray-100 dark:border-gray-800 pt-3">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
              !sidebarOpen && 'justify-center px-2'
            )}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
            {sidebarOpen && (theme === 'dark' ? '라이트 모드' : '다크 모드')}
          </button>
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors',
              !sidebarOpen && 'justify-center px-2'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && '로그아웃'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
