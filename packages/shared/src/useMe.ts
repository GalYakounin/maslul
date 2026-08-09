import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Me } from './types';

// עוטף את me() RPC — תפקיד + פרופיל בבקשה אחת בעליית האפליקציה.
// enabled=false (למשל: אין session) לא שולח בקשה בכלל.
export function useMe(supabase: SupabaseClient, enabled: boolean) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setMe(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase.rpc('me').then(({ data, error }) => {
      if (cancelled) return;
      setMe(error ? null : (data as Me));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [supabase, enabled]);

  return { me, loading };
}
