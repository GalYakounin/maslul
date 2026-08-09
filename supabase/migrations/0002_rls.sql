-- שלב 0 — Row Level Security. ראו docs/spec.md §5 ו-CLAUDE.md.
-- הרשאות נאכפות ב-DB, לא בקוד. גם באג בפרונט לא חושף נתונים של עסק אחר.
--
-- הערות על הרחבות מעבר לספק (הספק לא כיסה את כל הטבלאות/מקרים):
--   1. הספק לא הגדיר policy מפורש ל-routes עצמה (רק ל-deliveries שמצביעות
--      עליה) — בלי policy, enable RLS חוסם גישה לגמרי, כולל לבעל העסק.
--      נוספו business_routes / courier_routes.
--   2. הספק לא כיסה businesses / business_members / couriers / route_stops
--      במפורש בקטע ה-RLS (למרות שה"עקרון המנחה" דורש זאת) — נוספו policies
--      מינימליות: בעל עסק רואה/מעדכן את העסק שלו; שליח רואה את עצמו,
--      ובעל עסק רואה שליח רק אם יש ביניהם shift (לא רשימה גלובלית —
--      עקבי עם "חיפוש שליח = התאמה מדויקת בלבד").
--   3. shift_courier_respond בספק חסר with check מפורש. ב-Postgres, UPDATE
--      policy בלי with check משתמש ב-using גם על השורה החדשה — זה היה
--      חוסם את השליח לעדכן status מ-'pending' ל-'active'/'rejected' (השורה
--      החדשה לא הייתה עוברת את אותו using). נוסף with check מתאים.

-- פונקציית עזר: אילו עסקים שייכים למשתמש הנוכחי
create or replace function my_business_ids()
returns setof uuid language sql security definer stable as $$
  select business_id from business_members where user_id = auth.uid()
$$;

grant execute on function my_business_ids() to authenticated;

alter table businesses       enable row level security;
alter table business_members enable row level security;
alter table couriers         enable row level security;
alter table shifts           enable row level security;
alter table deliveries       enable row level security;
alter table routes           enable row level security;
alter table route_stops      enable row level security;

-- ═══════════════ businesses ═══════════════
create policy business_self on businesses
  for select using (business_id in (select my_business_ids()));

create policy business_update on businesses
  for update using (business_id in (select my_business_ids()));

-- ═══════════════ business_members ═══════════════
create policy business_members_self on business_members
  for select using (user_id = auth.uid());

-- ═══════════════ couriers ═══════════════
-- שליח רואה ומעדכן את עצמו בלבד
create policy courier_self_select on couriers
  for select using (courier_id = auth.uid());

create policy courier_self_update on couriers
  for update using (courier_id = auth.uid());

-- בעל עסק רואה פרטי שליח רק אם קיימת ביניהם שורת shift כלשהי
-- (אין endpoint שמחזיר את כל השליחים — ראו find_courier_by_phone ב-0003)
create policy business_sees_shift_couriers on couriers
  for select using (
    exists (
      select 1 from shifts s
      where s.courier_id = couriers.courier_id
        and s.business_id in (select my_business_ids())
    )
  );

-- ═══════════════ shifts ═══════════════
create policy shift_courier on shifts
  for select using (courier_id = auth.uid());

create policy shift_business on shifts
  for all using (business_id in (select my_business_ids()));

create policy shift_courier_respond on shifts
  for update
  using (courier_id = auth.uid() and status = 'pending')
  with check (courier_id = auth.uid() and status in ('active','rejected'));

-- ═══════════════ deliveries ═══════════════
-- בעל עסק: שליטה מלאה במשלוחים של העסק שלו
create policy biz_deliveries on deliveries
  for all using (business_id in (select my_business_ids()));

-- שליח: רואה רק משלוחים במסלול שהוצמד לו והופעל
create policy courier_deliveries on deliveries
  for select using (
    exists (
      select 1 from route_stops rs
      join routes r on r.route_id = rs.route_id
      where rs.delivery_id = deliveries.delivery_id
        and r.courier_id = auth.uid()
        and r.status in ('offered','dispatched')
    )
  );

-- שליח: מעדכן רק סטטוס מסירה של משלוחים שלו
create policy courier_update_delivery on deliveries
  for update using (
    exists (select 1 from route_stops rs join routes r using(route_id)
            where rs.delivery_id = deliveries.delivery_id
              and r.courier_id = auth.uid() and r.status = 'dispatched')
  );

-- ═══════════════ routes ═══════════════
create policy business_routes on routes
  for all using (business_id in (select my_business_ids()));

create policy courier_routes on routes
  for select using (
    courier_id = auth.uid() and status in ('offered','dispatched','completed')
  );

-- ═══════════════ route_stops ═══════════════
create policy business_route_stops on route_stops
  for all using (
    exists (select 1 from routes r
            where r.route_id = route_stops.route_id
              and r.business_id in (select my_business_ids()))
  );

create policy courier_route_stops on route_stops
  for select using (
    exists (select 1 from routes r
            where r.route_id = route_stops.route_id
              and r.courier_id = auth.uid()
              and r.status in ('offered','dispatched'))
  );
