-- הקשחה: קיבוע search_path בשלוש הפונקציות שנותרו.
--
-- זו אותה חולשה שהפילה את ההרשמה ביום הראשון (ראו 0004): פונקציית
-- security definer מחליפה את *הרשאות* המשתמש אך לא את search_path.
-- מי שיכול להשפיע על search_path של הקריאה יכול להחליף את הטבלאות
-- שהפונקציה קוראת מהן — והיא תרוץ עם הרשאות הבעלים.
--
-- שלוש אלה עבדו עד היום רק משום שהן נקראות מהאפליקציה, שבה public
-- בנתיב. זה מזל מבני, לא הגנה. my_business_ids() היא הבסיס לכל
-- מדיניות ה-RLS במערכת, ולכן היא הרגישה מכולן.
--
-- הלוגיקה זהה למקור (0002, 0003). שונו רק ההקשר ושמות הטבלאות המלאים.
-- auth.uid() כבר היה מוסמך ולכן ממשיך לעבוד תחת search_path מקובע.

-- ═══════════════ my_business_ids ═══════════════
create or replace function my_business_ids()
returns setof uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select bm.business_id from public.business_members bm where bm.user_id = auth.uid()
$$;

grant execute on function my_business_ids() to authenticated;

-- ═══════════════ me ═══════════════
create or replace function me()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'role',
      case
        when exists (
          select 1 from public.business_members bm where bm.user_id = auth.uid()
        ) then 'business'
        when exists (
          select 1 from public.couriers c where c.courier_id = auth.uid()
        ) then 'courier'
        else null
      end,
    'business', (
      select to_jsonb(b) from public.businesses b
      join public.business_members bm on bm.business_id = b.business_id
      where bm.user_id = auth.uid()
      limit 1
    ),
    'courier', (
      select to_jsonb(c) from public.couriers c where c.courier_id = auth.uid()
    )
  );
$$;

grant execute on function me() to authenticated;

-- ═══════════════ find_courier_by_phone ═══════════════
-- התאמה מדויקת בלבד — אין endpoint שמחזיר רשימת שליחים.
create or replace function find_courier_by_phone(p_phone text)
returns table(courier_id uuid, name text, phone text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select c.courier_id, c.name, c.phone
  from public.couriers c
  where c.phone = p_phone
  limit 1
$$;

grant execute on function find_courier_by_phone(text) to authenticated;
