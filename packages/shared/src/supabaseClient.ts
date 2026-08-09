import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// כל אפליקציה יוצרת קליינט משלה מ-import.meta.env שלה (src/lib/supabase.ts) —
// פונקציית מפעל ולא ייצוא ישיר, כדי לא לקשור את הספרייה המשותפת לקובץ env ספציפי.
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'חסרים משתני סביבה של Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). בדקו את קובץ ה-.env.'
    );
  }
  return createClient(url, anonKey);
}
