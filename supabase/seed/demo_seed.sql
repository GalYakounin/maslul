-- ═══════════════════════════════════════════════════════════════
-- נתוני דמו למסלול — נוצר על ידי scripts/build_demo_seed.py
-- אל תערכו קובץ זה ידנית; ערכו את הסקריפט והריצו אותו מחדש.
--
-- *** כל הנתונים כאן מדומים. ***
-- שמות הלקוחות והטלפונים אינם של אף אדם אמיתי. הכתובות אמיתיות
-- ונלקחו ממאגר הכתובות הפתוח, כדי שהמרחקים יהיו נכונים.
--
-- ── לפני ההרצה ──────────────────────────────────────────────────
-- 1. הירשמו דרך הדשבורד כעסק, ודרך אפליקציית השליח כשליח.
-- 2. עדכנו את שני האימיילים בבלוק שלמטה.
-- 3. הדביקו את כל הקובץ ל-SQL editor של Supabase והריצו.
--
-- הסקריפט אידמפוטנטי: הרצה חוזרת מוחקת את נתוני הדמו הקודמים ובונה
-- אותם מחדש. זו גם דרך לאפס את הדמו אחרי שמישהו התנסה בו.
-- הוא נוגע אך ורק בעסק של אימייל הדמו. חשבונות אחרים אינם מושפעים.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  -- ── עדכנו את שני אלה ──
  v_biz_email     text := 'demo@maslul.local';
  v_courier_email text := 'courier@maslul.local';

  v_biz_user  uuid;
  v_courier   uuid;
  v_business  uuid;
  v_route     uuid;
  v_now       timestamptz := now();
begin
  select id into v_biz_user from auth.users where email = v_biz_email;
  if v_biz_user is null then
    raise exception 'לא נמצא משתמש עם האימייל %. הירשמו קודם דרך הדשבורד.', v_biz_email;
  end if;

  select id into v_courier from auth.users where email = v_courier_email;
  if v_courier is null then
    raise exception 'לא נמצא שליח עם האימייל %. הירשמו קודם דרך אפליקציית השליח.', v_courier_email;
  end if;

  select business_id into v_business from business_members where user_id = v_biz_user limit 1;
  if v_business is null then
    raise exception 'המשתמש % אינו משויך לעסק. נרשמתם כשליח במקום כעסק?', v_biz_email;
  end if;

  -- ═══════════════ המסעדה ═══════════════
  update businesses set
    name    = 'פלאפל הנגב (דמו)',
    address = 'סמילנסקי 1, באר שבע',
    lat     = 31.236237,
    lng     = 34.789024,
    phone   = '0500000100'
  where business_id = v_business;

  -- ═══════════════ ניקוי הרצה קודמת ═══════════════
  -- route_stops נמחקות ב-cascade עם המסלולים.
  delete from routes     where business_id = v_business;
  delete from deliveries where business_id = v_business;
  delete from shifts     where business_id = v_business;

  -- ═══════════════ משמרת פעילה ═══════════════
  -- one_active_shift_per_courier מונע שתי משמרות פעילות לאותו שליח,
  -- ולכן סוגרים משמרת קודמת אצל עסק אחר לפני הפתיחה.
  update shifts set status = 'ended', ended_at = v_now
  where courier_id = v_courier and status = 'active';

  update couriers set name = 'אבי (שליח דמו)', phone = '0500000200'
  where courier_id = v_courier;

  insert into shifts (courier_id, business_id, status, invited_at, accepted_at)
  values (v_courier, v_business, 'active', v_now - interval '3 hours', v_now - interval '3 hours');

  -- ═══════════════ משלוחים ═══════════════
  -- כל השורות מדומות. ראו הכותרת.
  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at, picked_up_at, delivered_at)
  values (v_business, 'דנה לוי', '0500000101', 'ההסתדרות 108, באר שבע',
    'פיצה משפחתית + שתייה', 31.242100, 34.791429, 'ok', 6500, 'card_online', true,
    'delivered', v_now - interval '77 minutes', v_now - interval '52 minutes', v_now - interval '30 minutes', v_now - interval '21 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at, picked_up_at, delivered_at)
  values (v_business, 'יוסי כהן', '0500000102', 'חנקין 3, באר שבע',
    '2 המבורגר, צ׳יפס', 31.242620, 34.797542, 'ok', 7350, 'cash', false,
    'delivered', v_now - interval '72 minutes', v_now - interval '47 minutes', v_now - interval '30 minutes', v_now - interval '12 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at, picked_up_at)
  values (v_business, 'מירב אברהם', '0500000103', 'ישמעאל 1, באר שבע',
    'מרק עדשים, סלט', 31.235690, 34.798704, 'ok', 8200, 'cash', false,
    'picked_up', v_now - interval '69 minutes', v_now - interval '44 minutes', v_now - interval '30 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at, picked_up_at)
  values (v_business, 'איתי שרון', '0500000104', 'מרגולין 23, באר שבע',
    'שווארמה בלאפה', 31.225487, 34.800070, 'ok', 9050, 'card_online', true,
    'picked_up', v_now - interval '66 minutes', v_now - interval '41 minutes', v_now - interval '30 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at)
  values (v_business, 'נועה בר', '0500000105', 'טננבוים מרדכי 2, באר שבע',
    'פסטה ברוטב שמנת', 31.223653, 34.781434, 'ok', 9900, 'cash', false,
    'ready', v_now - interval '39 minutes', v_now - interval '14 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at)
  values (v_business, 'רון מזרחי', '0500000106', 'סתונית 24, באר שבע',
    'סושי 16 יח׳', 31.228766, 34.780028, 'ok', 10750, 'cash', false,
    'ready', v_now - interval '36 minutes', v_now - interval '11 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at)
  values (v_business, 'שירה פרץ', '0500000107', 'צוקית 37, באר שבע',
    'חומוס פול + פיתות', 31.232195, 34.760777, 'ok', 11600, 'card_online', true,
    'ready', v_now - interval '32 minutes', v_now - interval '7 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at)
  values (v_business, 'עומר דהן', '0500000108', 'סוסיה 7, באר שבע',
    'סלט יווני, לחם', 31.244337, 34.772661, 'ok', 12450, 'cash', false,
    'ready', v_now - interval '29 minutes', v_now - interval '4 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at)
  values (v_business, 'טל אזולאי', '0500000109', 'מצדה 105, באר שבע',
    'שניצל בבאגט', 31.258488, 34.779208, 'ok', 13300, 'cash', false,
    'new', v_now - interval '25 minutes', null);

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at)
  values (v_business, 'ליאור חדד', '0500000110', 'סנהדרין 14, באר שבע',
    'פאד תאי + אגרול', null, null, 'pending', 14150, 'card_online', true,
    'ready', v_now - interval '34 minutes', v_now - interval '9 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at, picked_up_at, delivered_at)
  values (v_business, 'מאיה גל', '0500000111', 'תפוז 2, באר שבע',
    'כריך טונה, קפה', 31.220679, 34.823396, 'ok', 15000, 'cash', false,
    'delivered', v_now - interval '215 minutes', v_now - interval '190 minutes', v_now - interval '170 minutes', v_now - interval '158 minutes');

  insert into deliveries (business_id, customer_name, customer_phone, address,
    order_details, lat, lng, geocode_status, price_agorot, payment_method, paid,
    status, created_at, ready_at, picked_up_at, delivered_at)
  values (v_business, 'אורי נחום', '0500000112', 'חבצלת הנגב 88, באר שבע',
    '3 מנות ילדים', 31.231199, 34.786889, 'ok', 15850, 'cash', false,
    'delivered', v_now - interval '210 minutes', v_now - interval '185 minutes', v_now - interval '170 minutes', v_now - interval '149 minutes');

  -- ═══════════════ מסלול פעיל ═══════════════
  -- הסדר כאן ידני — כפי שבעל העסק היה מסדר בשלב 4. זו נקודת הייחוס
  -- שמולה שלב 6 יצטרך להוכיח שיפור.
  insert into routes (business_id, courier_id, status, created_at, dispatched_at)
  values (v_business, v_courier, 'dispatched', v_now - interval '35 minutes',
          v_now - interval '30 minutes')
  returning route_id into v_route;

  insert into route_stops (route_id, delivery_id, sequence)
  select v_route, d.delivery_id, row_number() over (order by d.created_at)
  from deliveries d
  where d.business_id = v_business
    and d.customer_phone in ('0500000101', '0500000102', '0500000103', '0500000104');

  -- ═══════════════ מסלול היסטורי שנסגר ═══════════════
  insert into routes (business_id, courier_id, status, created_at, dispatched_at, completed_at)
  values (v_business, v_courier, 'completed', v_now - interval '180 minutes',
          v_now - interval '172 minutes', v_now - interval '145 minutes')
  returning route_id into v_route;

  insert into route_stops (route_id, delivery_id, sequence)
  select v_route, d.delivery_id, row_number() over (order by d.created_at)
  from deliveries d
  where d.business_id = v_business
    and d.customer_phone in ('0500000111', '0500000112');

  -- ═══════════════ מסלול טיוטה — כאן רואים את שלב 6 ═══════════════
  -- כפתור "חשב סדר אופטימלי" מופיע רק בטיוטה, כי מסלול משוגר קופא.
  -- בלי טיוטה בזרע, מבקר שנכנס לתשעים שניות לא יראה את הפיצ'ר
  -- המרכזי של הפרויקט בכלל.
  --
  -- הסדר ההתחלתי הוא **מהרחוק לקרוב במכוון** — הסדר הגרוע ביותר
  -- למינימום המתנה. הוא גורר את השליח לקצה ומשאיר שניים לחכות
  -- לחזרתו, כך שהלחיצה על הכפתור מייצרת שיפור נראה לעין במקום
  -- "הסדר שהיה כבר היה הטוב ביותר".
  insert into routes (business_id, courier_id, status, created_at)
  values (v_business, v_courier, 'draft', v_now - interval '4 minutes')
  returning route_id into v_route;

  insert into route_stops (route_id, delivery_id, sequence)
  select v_route, d.delivery_id, 1
  from deliveries d
  where d.business_id = v_business and d.customer_phone = '0500000107';
  insert into route_stops (route_id, delivery_id, sequence)
  select v_route, d.delivery_id, 2
  from deliveries d
  where d.business_id = v_business and d.customer_phone = '0500000105';
  insert into route_stops (route_id, delivery_id, sequence)
  select v_route, d.delivery_id, 3
  from deliveries d
  where d.business_id = v_business and d.customer_phone = '0500000106';
  raise notice 'נתוני הדמו נטענו לעסק %', v_business;
end $$;
