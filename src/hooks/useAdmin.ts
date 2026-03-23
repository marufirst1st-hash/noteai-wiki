'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const meta = session?.user?.app_metadata;
      setIsAdmin(meta?.is_admin === true || meta?.role === 'admin');
      setLoading(false);
    });
  }, [supabase.auth]);

  return { isAdmin, loading };
}
