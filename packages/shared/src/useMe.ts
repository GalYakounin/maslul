import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Me } from './types';

// עוטף את me() RPC — תפקיד + פרופיל בבקשה אחת בעליית האפליקציה.
// userId ריק (אין session) לא שולח בקשה בכלל.
//
// התוצאה נשמרת יחד עם המשתמש שעבורו נטענה. כך ברגע ההתחברות, עוד לפני
// שה-effect רץ, loading כבר true — אחרת לפריים אחד me=null נקרא כחשבון
// בלי תפקיד, והמסך מהבהב בהודעת שגיאה לפני שהוא מגיע למקום הנכון.
export function useMe(supabase: SupabaseClient, userId: string | undefined) {
  const [result, setResult] = useState<{ userId: string; me: Me | null } | null>(null);

  useEffect(() => {
    // ביציאה מנקים, כדי שהתחברות חוזרת תטען מחדש ולא תציג פרופיל ישן.
    if (!userId) {
      setResult(null);
      return;
    }

    let cancelled = false;

    supabase.rpc('me').then(({ data, error }) => {
      if (cancelled) return;
      setResult({ userId, me: error ? null : (data as Me) });
    });

    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const current = result && result.userId === userId ? result : null;
  return { me: current?.me ?? null, loading: !!userId && !current };
}
