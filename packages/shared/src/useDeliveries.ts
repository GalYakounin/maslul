import type { SupabaseClient } from '@supabase/supabase-js';
import type { Delivery } from './types';
import { useRealtimeRows } from './useRealtimeRows';

export function useDeliveries(supabase: SupabaseClient, businessId: string | null | undefined) {
  const { rows, loading, refetch } = useRealtimeRows<Delivery>(supabase, {
    enabled: true,
    table: 'deliveries',
    select: '*',
    column: 'business_id',
    value: businessId,
    orderBy: 'created_at',
  });

  return { deliveries: rows, loading, refetch };
}
