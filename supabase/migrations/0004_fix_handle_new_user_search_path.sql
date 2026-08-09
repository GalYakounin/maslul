-- תיקון: handle_new_user נכשל בהרשמה עם 500 ("Database error saving new user").
--
-- הסיבה: הטריגר רץ בתוך ה-INSERT ל-auth.users, כלומר בהקשר של
-- supabase_auth_admin — לא בהקשר של האפליקציה. security definer מחליף
-- את *הרשאות* המשתמש אבל לא את search_path, ובהקשר הזה public אינו
-- בנתיב החיפוש. לכן `insert into businesses` לא מצא את הטבלה.
--
-- התיקון: לקבע search_path על הפונקציה + לכתוב את השמות מלאים
-- (public.businesses). זו גם הקשחה: security definer בלי search_path
-- מקובע חשוף ל-search_path hijacking.
--
-- הלוגיקה זהה ל-0003 — רק ההקשר תוקן.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        text := new.raw_user_meta_data->>'role';
  v_business_id uuid;
begin
  if v_role = 'business' then
    insert into public.businesses (name, address, lat, lng, phone)
    values (
      coalesce(new.raw_user_meta_data->>'business_name', ''),
      coalesce(new.raw_user_meta_data->>'address', ''),
      null,
      null,
      new.raw_user_meta_data->>'phone'
    )
    returning business_id into v_business_id;

    insert into public.business_members (user_id, business_id, role)
    values (new.id, v_business_id, 'owner');

  elsif v_role = 'courier' then
    insert into public.couriers (courier_id, name, phone, vehicle_type)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', ''),
      coalesce(new.raw_user_meta_data->>'phone', ''),
      coalesce(new.raw_user_meta_data->>'vehicle_type', 'motorcycle')
    );
  end if;

  return new;
end;
$$;
