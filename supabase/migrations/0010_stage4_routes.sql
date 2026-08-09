-- שלב 4 — מסלולים ידניים. הסכימה וה-RLS קיימות משלב 0; חסר רק השידור.

-- אותו לקח שלישית: מנוי על טבלה שאינה בפרסום מצליח בשקט ולא מקבל
-- אירועים. השליח חייב לדעת שהוקצה לו מסלול בלי לרענן.
--
-- route_stops לא נוספת בכוונה: אין בה עמודת שיוך ישירה (business_id
-- או courier_id), ולכן אי אפשר לסנן עליה מנוי בצד השרת, והמדיניות
-- שלה נשענת על תת-שאילתה. במקום זה השליח מקשיב ל-routes לפי
-- courier_id וטוען את העצירות מחדש. ממילא מסלול קופא ברגע ששוגר,
-- כך שהעצירות אינן משתנות אחרי שהשליח רואה אותן.
alter table routes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'routes'
  ) then
    alter publication supabase_realtime add table routes;
  end if;
end $$;
