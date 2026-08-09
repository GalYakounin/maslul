-- שלב 1 — משמרות. שני פערים שהסכימה של שלב 0 לא כיסתה.

-- ═══════════════ 1. Realtime על shifts ═══════════════
-- טבלה חדשה אינה בפרסום supabase_realtime כברירת מחדל, ולכן שינויים בה
-- לא משודרים למנויים. בלי השורות האלה כל מסכי שלב 1 ייראו תקינים
-- ולא יתעדכנו — בדיקת הקבלה ("ההזמנה מגיעה תוך פחות משתי שניות") תיכשל.
--
-- replica identity full: ב-UPDATE/DELETE ברירת המחדל משדרת רק את המפתח
-- הראשי של השורה הישנה. אכיפת RLS על אירועי Realtime צריכה את שאר
-- העמודות (courier_id / business_id) כדי להכריע אם המנוי רשאי לקבל
-- את האירוע — בלעדיהן עדכונים נבלעים בשקט.
alter table shifts replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shifts'
  ) then
    alter publication supabase_realtime add table shifts;
  end if;
end $$;

-- ═══════════════ 2. השליח רואה את העסק שהזמין אותו ═══════════════
-- תמונת מראה של business_sees_shift_couriers מ-0002: קיימת שורת shift
-- בין השניים ⇐ כל צד רשאי לראות את הצד השני, ולא יותר מזה. שליח לא
-- יכול לדלות את רשימת העסקים, בדיוק כפי שעסק לא יכול לדלות שליחים.
--
-- בלי המדיניות הזו מסך ההזמנה אצל השליח יכול להציג רק מזהה, לא שם עסק.
drop policy if exists courier_sees_shift_businesses on businesses;

create policy courier_sees_shift_businesses on businesses
  for select using (
    exists (
      select 1 from shifts s
      where s.business_id = businesses.business_id
        and s.courier_id = auth.uid()
    )
  );
