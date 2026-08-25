import type { SupabaseClient } from '@supabase/supabase-js';
import { haversineMatrix, type DurationMatrix, type Point } from './optimize';

// ═══════════════ ספק מטריצת הזמנים ═══════════════
// כל התלות במקור זמני הנסיעה מרוכזת בקובץ הזה, בדיוק כפי ש-
// addressSearch.ts מרכז את התלות בספקי הכתובות. האלגוריתם ב-
// optimize.ts אינו יודע ואינו צריך לדעת מאיפה הגיעו המספרים.
//
// המעבר ל-OSRM עצמי, אם וכאשר יגיע (spec.md §3.2), הוא החלפת
// המימוש כאן ואפס שינוי באלגוריתם.

export type MatrixSource = 'provider' | 'estimate';

export interface MatrixResult {
  durations: DurationMatrix;
  source: MatrixSource;
  /** מלא רק כאשר source='estimate' — למה לא הצלחנו לקבל נתון אמיתי */
  reason?: string;
}

const MESSAGES: Record<string, string> = {
  quota_exceeded: 'מכסת שירות המסלולים נגמרה להיום.',
  provider_unreachable: 'שירות המסלולים אינו זמין כרגע.',
  provider_error: 'שירות המסלולים החזיר שגיאה.',
  missing_api_key: 'שירות המסלולים אינו מוגדר.',
  unroutable_point: 'לאחת הכתובות אין דרך נסיעה — בדקו את הנעיצה על המפה.',
  bad_matrix: 'שירות המסלולים החזיר תשובה לא תקינה.',
};

/**
 * מטריצת זמני נסיעה בין הנקודות, בשניות. אינדקס 0 הוא המסעדה.
 *
 * **נופל רך בכוונה.** אם הספק אינו זמין, מוחזרת הערכה ממרחק אווירי
 * עם source='estimate'. בשעת עומס במסעדה עדיף סדר סביר על שום סדר —
 * אבל **חובה על הקורא להציג את ההבדל למשתמש**. הערכה שמוצגת כנתון
 * אמיתי היא בדיוק אותו כשל של קואורדינטה שגויה בשקט: היא נראית
 * תקינה עד שהשליח עומד במקום הלא נכון.
 */
export async function getDurationMatrix(
  supabase: SupabaseClient,
  points: Point[]
): Promise<MatrixResult> {
  const estimate = (reason: string): MatrixResult => ({
    durations: haversineMatrix(points),
    source: 'estimate',
    reason,
  });

  try {
    const { data, error } = await supabase.functions.invoke('duration-matrix', {
      body: { points },
    });

    if (error) {
      // גוף התשובה נושא את הקוד המדויק; ה-error של supabase-js הוא גנרי.
      let code = '';
      try {
        code = (await (error as { context?: Response }).context?.json())?.error ?? '';
      } catch {
        /* התשובה אינה JSON — נשארים עם הודעה כללית */
      }
      return estimate(MESSAGES[code] ?? 'שירות המסלולים אינו זמין כרגע.');
    }

    const durations = data?.durations;
    if (!Array.isArray(durations) || durations.length !== points.length) {
      return estimate(MESSAGES.bad_matrix);
    }

    return { durations, source: 'provider' };
  } catch {
    return estimate('שירות המסלולים אינו זמין כרגע.');
  }
}
