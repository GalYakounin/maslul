import type { SupabaseClient } from '@supabase/supabase-js';
import type { RouteStopWithDelivery, RouteWithStops } from './types';
import { useRealtimeRows } from './useRealtimeRows';

export const ROUTES_SELECT =
  '*, route_stops(*, deliveries(*)), couriers(courier_id, name, phone)';

// סדר העצירות ממוין כאן ולא בשאילתה: PostgREST ממיין משאב מקושר רק
// דרך פרמטר נפרד, וה-hook הגנרי מקבל מיון אחד בלבד. המיון הזה אינו
// קישוט — `sequence` הוא כל המוצר.
export function sortStops(stops: RouteStopWithDelivery[]): RouteStopWithDelivery[] {
  return [...stops].sort((a, b) => a.sequence - b.sequence);
}

export function useRoutes(
  supabase: SupabaseClient,
  column: 'business_id' | 'courier_id',
  value: string | null | undefined
) {
  const { rows, loading, refetch } = useRealtimeRows<RouteWithStops>(supabase, {
    enabled: true,
    table: 'routes',
    select: ROUTES_SELECT,
    column,
    value,
    orderBy: 'created_at',
  });

  return { routes: rows, loading, refetch };
}
