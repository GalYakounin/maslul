import type { SupabaseClient } from '@supabase/supabase-js';
import { useRealtimeRows } from './useRealtimeRows';

// עטיפה דקה סביב useRealtimeRows. בעל העסק מסנן לפי business_id,
// השליח לפי courier_id — זה כל ההבדל בין שני הצדדים.
export function useShifts<T>(
  supabase: SupabaseClient,
  options: {
    enabled: boolean;
    select: string;
    column: 'business_id' | 'courier_id';
    value: string | null | undefined;
  }
) {
  const { rows, loading, refetch } = useRealtimeRows<T>(supabase, {
    ...options,
    table: 'shifts',
    orderBy: 'invited_at',
  });

  return { shifts: rows, loading, refetch };
}
