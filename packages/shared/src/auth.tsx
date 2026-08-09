import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

// ═══════════════ normalizePhone ═══════════════
// מנרמל טלפון ישראלי לפורמט אחיד "05XXXXXXXX" בלי קשר לאיך שהוזן
// (עם/בלי +972, עם/בלי מקפים ורווחים). חייב לרוץ בשני הצדדים
// (הרשמת שליח + חיפוש לפי טלפון בדשבורד) אחרת החיפוש לא ימצא.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) {
    return '0' + digits.slice(3);
  }
  if (digits.startsWith('0')) {
    return digits;
  }
  if (digits.length === 9) {
    // מספר בן 9 ספרות בלי ה-0 המוביל, למשל "501234567"
    return '0' + digits;
  }
  return digits;
}

// ═══════════════ translateAuthError ═══════════════
// המקום היחיד שמתרגם שגיאות Supabase לעברית. אסור להדליף מחרוזת
// שגיאה גולמית של Supabase למשתמש בשום מקום אחר באפליקציה.
const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: 'אימייל או סיסמה שגויים. בדקו ונסו שוב.',
  user_already_exists: 'כבר קיים משתמש עם האימייל הזה. נסו להתחבר במקום להירשם.',
  email_not_confirmed: 'יש לאשר את כתובת האימייל לפני ההתחברות. בדקו את תיבת הדואר.',
  weak_password: 'הסיסמה חייבת להכיל לפחות 6 תווים.',
  over_request_rate_limit: 'יותר מדי ניסיונות. המתינו כמה דקות ונסו שוב.',
  user_not_found: 'לא נמצא משתמש עם הפרטים האלה.',
  same_password: 'הסיסמה החדשה זהה לישנה.',
};

const MESSAGE_PATTERNS: Array<[RegExp, string]> = [
  [/invalid login credentials/i, CODE_MESSAGES.invalid_credentials],
  [/already registered|user already exists/i, CODE_MESSAGES.user_already_exists],
  [/email not confirmed/i, CODE_MESSAGES.email_not_confirmed],
  [/password should be at least/i, CODE_MESSAGES.weak_password],
  [/rate limit/i, CODE_MESSAGES.over_request_rate_limit],
  [/invalid email/i, 'כתובת האימייל אינה תקינה.'],
];

export function translateAuthError(error: unknown): string {
  if (!error) return '';

  const authError = error as { code?: string; message?: string };
  if (authError.code && CODE_MESSAGES[authError.code]) {
    return CODE_MESSAGES[authError.code];
  }

  const message = authError.message ?? String(error);
  for (const [pattern, hebrew] of MESSAGE_PATTERNS) {
    if (pattern.test(message)) return hebrew;
  }

  return 'משהו השתבש. נסו שוב, ואם זה חוזר — צרו קשר עם התמיכה.';
}

// ═══════════════ translateDbError ═══════════════
// אותו עיקרון כמו translateAuthError, לשגיאות שמגיעות מהטבלאות ולא
// מ-Auth. גם כאן: אסור להדליף מחרוזת גולמית של Postgres למשתמש.
//
// 23505 הוא המקרה היחיד שיש לו משמעות עסקית אמיתית בשלב 1 — האינדקס
// one_active_shift_per_courier אוסר על שליח להיות במשמרת פעילה בשני
// עסקים במקביל, וזו בדיוק ההודעה שהשליח צריך לראות.
const DB_CODE_MESSAGES: Record<string, string> = {
  '23505': 'אתם כבר במשמרת פעילה בעסק אחר. יש לסיים אותה קודם.',
  '23503': 'אחד מהפרטים כבר לא קיים במערכת. רעננו את הדף ונסו שוב.',
  '42501': 'אין לכם הרשאה לפעולה הזו.',
};

export function translateDbError(error: unknown): string {
  if (!error) return '';

  const dbError = error as { code?: string };
  if (dbError.code && DB_CODE_MESSAGES[dbError.code]) {
    return DB_CODE_MESSAGES[dbError.code];
  }

  return 'משהו השתבש. נסו שוב, ואם זה חוזר — צרו קשר עם התמיכה.';
}

// ═══════════════ AuthProvider ═══════════════
// כל אפליקציה מזריקה את הקליינט שלה (src/lib/supabase.ts) — הספרייה
// המשותפת לא יוצרת קליינט בעצמה.
interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: unknown }>;
  signUp: (
    email: string,
    password: string,
    metadata: Record<string, unknown>
  ) => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  supabase,
  children,
}: {
  supabase: SupabaseClient;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, [supabase]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    signUp: async (email, password, metadata) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      });
      return { error };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth חייב לרוץ בתוך AuthProvider');
  return ctx;
}
