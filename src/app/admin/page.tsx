'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Users, UserPlus, Pencil, Trash2, ShieldCheck, Shield,
  X, Check, Eye, EyeOff, AlertCircle, RefreshCw, Crown
} from 'lucide-react';
import toast from 'react-hot-toast';

interface UserRow {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
}

interface UserFormData {
  email: string;
  password: string;
  name: string;
  is_admin: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState('');

  // 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // 폼 데이터
  const [form, setForm] = useState<UserFormData>({ email: '', password: '', name: '', is_admin: false });
  const [editForm, setEditForm] = useState({ name: '', password: '', is_admin: false });
  const [showPw, setShowPw] = useState(false);
  const [showEditPw, setShowEditPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) { toast.error('권한이 없습니다.'); router.push('/dashboard'); return; }
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      const isAdmin = session.user.app_metadata?.is_admin === true || session.user.app_metadata?.role === 'admin';
      if (!isAdmin) { toast.error('관리자 전용 페이지입니다.'); router.push('/dashboard'); return; }
      setMyId(session.user.id);
      fetchUsers();
    });
  }, [router, fetchUsers, supabase.auth]);

  // 사용자 추가
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const token = await getToken();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || '추가 실패'); setSubmitting(false); return; }
    toast.success(`${form.email} 계정이 추가되었습니다.`);
    setShowAddModal(false);
    setForm({ email: '', password: '', name: '', is_admin: false });
    fetchUsers();
    setSubmitting(false);
  };

  // 사용자 수정
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setSubmitting(true);
    const token = await getToken();
    const body: Record<string, unknown> = { name: editForm.name, is_admin: editForm.is_admin };
    if (editForm.password) body.password = editForm.password;
    const res = await fetch(`/api/admin/users/${editUser.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || '수정 실패'); setSubmitting(false); return; }
    toast.success('계정이 수정되었습니다.');
    setEditUser(null);
    fetchUsers();
    setSubmitting(false);
  };

  // 사용자 삭제
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    const token = await getToken();
    const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || '삭제 실패'); setSubmitting(false); return; }
    toast.success(`${deleteTarget.email} 계정이 삭제되었습니다.`);
    setDeleteTarget(null);
    fetchUsers();
    setSubmitting(false);
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-6 h-6 text-yellow-500" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">관리자 페이지</h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              회원 계정을 추가·수정·삭제합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchUsers} className="btn-secondary flex items-center gap-2 text-sm px-3 py-2">
              <RefreshCw className="w-4 h-4" /> 새로고침
            </button>
            <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> 새 계정 추가
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{users.length}</p>
            <p className="text-sm text-gray-500 mt-1">전체 회원</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-yellow-500">{users.filter(u => u.is_admin).length}</p>
            <p className="text-sm text-gray-500 mt-1">관리자</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-blue-500">{users.filter(u => !u.is_admin).length}</p>
            <p className="text-sm text-gray-500 mt-1">일반 사용자</p>
          </div>
        </div>

        {/* User Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">회원 목록</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 불러오는 중...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-left">
                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">권한</th>
                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">가입일</th>
                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">마지막 로그인</th>
                    <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${u.is_admin ? 'bg-yellow-500' : 'bg-primary-500'}`}>
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {u.name}
                            {u.id === myId && <span className="ml-1 text-xs text-primary-500">(나)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{u.email}</td>
                      <td className="px-6 py-4">
                        {u.is_admin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
                            <ShieldCheck className="w-3 h-3" /> 관리자
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            <Shield className="w-3 h-3" /> 일반
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(u.created_at)}</td>
                      <td className="px-6 py-4 text-gray-500">{formatDate(u.last_sign_in_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setEditUser(u); setEditForm({ name: u.name, password: '', is_admin: u.is_admin }); }}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 transition-colors"
                            title="수정"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {u.id !== myId && (
                            <button
                              onClick={() => setDeleteTarget(u)}
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 transition-colors"
                              title="삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── 신규 계정 추가 모달 ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-bold text-lg text-gray-900 dark:text-white">새 계정 추가</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">이름</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="input-field" placeholder="홍길동" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">이메일 <span className="text-red-500">*</span></label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                  className="input-field" placeholder="user@example.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">비밀번호 <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm({...form, password: e.target.value})}
                    className="input-field pr-10" placeholder="6자 이상" minLength={6} required />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <input type="checkbox" id="add-admin" checked={form.is_admin}
                  onChange={e => setForm({...form, is_admin: e.target.checked})}
                  className="w-4 h-4 accent-yellow-500" />
                <label htmlFor="add-admin" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer">
                  <ShieldCheck className="w-4 h-4 text-yellow-500" /> 관리자 권한 부여
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary flex-1">취소</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? '추가 중...' : '계정 추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 계정 수정 모달 ── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-bold text-lg text-gray-900 dark:text-white">계정 수정</h2>
              <button onClick={() => setEditUser(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm text-gray-500">
                이메일: <span className="font-medium text-gray-700 dark:text-gray-300">{editUser.email}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">이름</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  새 비밀번호 <span className="text-gray-400 font-normal">(변경 시에만 입력)</span>
                </label>
                <div className="relative">
                  <input type={showEditPw ? 'text' : 'password'} value={editForm.password}
                    onChange={e => setEditForm({...editForm, password: e.target.value})}
                    className="input-field pr-10" placeholder="변경하지 않으면 비워두세요" minLength={6} />
                  <button type="button" onClick={() => setShowEditPw(!showEditPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showEditPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <input type="checkbox" id="edit-admin" checked={editForm.is_admin}
                  onChange={e => setEditForm({...editForm, is_admin: e.target.checked})}
                  className="w-4 h-4 accent-yellow-500" />
                <label htmlFor="edit-admin" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer">
                  <ShieldCheck className="w-4 h-4 text-yellow-500" /> 관리자 권한
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditUser(null)} className="btn-secondary flex-1">취소</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">계정 삭제</h2>
                <p className="text-sm text-gray-500">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="font-medium text-gray-900 dark:text-white">{deleteTarget.email}</span> 계정을 삭제하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">취소</button>
              <button onClick={handleDelete} disabled={submitting}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50">
                {submitting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
