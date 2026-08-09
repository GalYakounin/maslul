-- שלב 0 — טריגר הרשמה + RPCs. ראו CLAUDE.md: "פרופיל נוצר בטריגר handle_new_user"
-- ו"me() RPC בעליית האפליקציה", ו"חיפוש שליח = התאמה מדויקת בלבד".

-- ═══════════════ טריגר הרשמה ═══════════════
-- נקרא אחרי כל INSERT ל-auth.users. קורא role מ-raw_user_meta_data
-- (נשלח מהקליינט דרך supabase.auth.signUp({ options: { data: {...} } }))
-- ויוצר את שורת הפרופיל המתאימה באותה טרנזקציה — מונע משתמש יתום
-- אם קריאה שנייה נכשלת.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_role        text := new.raw_user_meta_data->>'role';
  v_business_id uuid;
begin
  if v_role = 'business' then
    insert into businesses (name, address, lat, lng, phone)
    values (
      coalesce(new.raw_user_meta_data->>'business_name', ''),
      coalesce(new.raw_user_meta_data->>'address', ''),
      null,
      null,
      new.raw_user_meta_data->>'phone'
    )
    returning business_id into v_business_id;

    insert into business_members (user_id, business_id, role)
    values (new.id, v_business_id, 'owner');

  elsif v_role = 'courier' then
    insert into couriers (courier_id, name, phone, vehicle_type)
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ═══════════════ me() ═══════════════
-- תפקיד + פרופיל בבקשה אחת בעליית האפליקציה, במקום שתי קריאות נפרדות.
create or replace function me()
returns jsonb language sql security definer stable as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'role',
      case
        when exists (select 1 from business_members where user_id = auth.uid()) then 'business'
        when exists (select 1 from couriers where courier_id = auth.uid()) then 'courier'
        else null
      end,
    'business', (
      select to_jsonb(b) from businesses b
      join business_members bm on bm.business_id = b.business_id
      where bm.user_id = auth.uid()
      limit 1
    ),
    'courier', (
      select to_jsonb(c) from couriers c where c.courier_id = auth.uid()
    )
  );
$$;

grant execute on function me() to authenticated;

-- ═══════════════ find_courier_by_phone() ═══════════════
-- התאמה מדויקת בלבד — אין endpoint שמחזיר רשימת שליחים. בעל עסק לא
-- יכול "לדלות" את מאגר השליחים; הוא חייב לדעת את הטלפון מראש.
-- הטלפון מנורמל בקליינט לפני הקריאה (normalizePhone).
create or replace function find_courier_by_phone(p_phone text)
returns table(courier_id uuid, name text, phone text)
language sql security definer stable as $$
  select courier_id, name, phone from couriers where phone = p_phone limit 1
$$;

grant execute on function find_courier_by_phone(text) to authenticated;
