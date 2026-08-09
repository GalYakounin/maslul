import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// טעינת שורות + מנוי Realtime עליהן, עבור טבלה שמסוננת בעמודה אחת.
// שני הצדדים של המוצר צורכים את אותה תבנית ונבדלים רק בטבלה ובעמודה:
// משמרות לפי business_id או courier_id, משלוחים לפי business_id.
//
// בכל אירוע טוענים מחדש ולא מתקנים את המערך מהמטען: המטען מכיל את
// השורה בלבד, בלי הישויות המקושרות (שם שליח, שם עסק). בקשה אחת קצרה
// מחזירה מצב עקבי, ומול תקציב של שתי שניות זה אינו צוואר בקבוק.
export function useRealtimeRows<T>(
  supabase: SupabaseClient,
  options: {
    enabled: boolean;
    table: string;
    select: string;
    column: string;
    value: string | null | undefined;
    orderBy: string;
  }
) {
  const { enabled, table, select, column, value, orderBy } = options;
  const active = enabled && !!value;

  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(active);

  const refetch = useCallback(async () => {
    if (!active) return;
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq(column, value)
      .order(orderBy, { ascending: false });

    if (!error) setRows((data ?? []) as T[]);
    setLoading(false);
  }, [supabase, table, select, column, value, orderBy, active]);

  useEffect(() => {
    if (!active) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    refetch();

    const channel = supabase
      .channel(`${table}-${column}-${value}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${column}=eq.${value}` },
        () => {
          if (!cancelled) refetch();
        }
      )
      .subscribe((status) => {
        // מנוי שנכשל הוא הכשל השקט המסוכן: המסך ייראה תקין ופשוט לא
        // יתעדכן. הסיבה הנפוצה — הטבלה לא נוספה לפרסום supabase_realtime.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[${table}] מנוי Realtime נכשל (${status}). עדכונים חיים לא יגיעו.`);
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, table, column, value, active, refetch]);

  return { rows, loading, refetch };
}
