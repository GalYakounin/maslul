-- שלב 2 — משלוחים + גיאוקודינג.

-- ═══════════════ חיפוש לקוח חוזר ═══════════════
-- השדה הראשון בטופס הזנת משלוח הוא טלפון, לא כתובת: אם הלקוח הזמין
-- בעבר, הכתובת והקואורדינטות שכבר אומתו נפתחות מאליהן ואין הקלדה כלל.
-- זו ההגנה הטובה ביותר משגיאות — מה שלא מוקלד לא משתבש — והיא גם
-- מרככת פערי כיסוי בגיאוקודינג: כתובת שלא נמצאה נפתרת פעם אחת ללקוח.
create index idx_deliveries_customer_lookup
  on deliveries (business_id, customer_phone, created_at desc);

-- ═══════════════ Realtime על deliveries ═══════════════
-- אותו לקח משלב 1: מנוי על טבלה שאינה בפרסום מצליח בשקט ולא מקבל
-- אירועים. רשימת המשלוחים בדשבורד חייבת להתעדכן בין מכשירים.
alter table deliveries replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table deliveries;
  end if;
end $$;
