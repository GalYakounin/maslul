-- שלב 0 — סכימה מלאה. ראו docs/spec.md §4 ו-CLAUDE.md לנימוקים.
-- הערה: businesses.lat/lng nullable (בניגוד לספק בספק) — אין קואורדינטות בהרשמה,
-- גיאוקודינג מגיע בשלב 2. ראו טבלת ההחלטות ב-CLAUDE.md.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ═══════════════ עסקים ═══════════════
create table businesses (
  business_id   uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text not null,
  lat           double precision,
  lng           double precision,
  phone         text,
  -- הגדרות אצווה שבעל העסק שולט בהן
  batch_max_size          int not null default 4,
  batch_max_wait_minutes  int not null default 8,
  created_at    timestamptz not null default now()
);

-- קישור משתמשי Auth לעסק (מאפשר כמה מנהלים לעסק אחד)
create table business_members (
  user_id      uuid not null references auth.users(id) on delete cascade,
  business_id  uuid not null references businesses(business_id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','dispatcher')),
  primary key (user_id, business_id)
);

-- ═══════════════ שליחים ═══════════════
create table couriers (
  courier_id        uuid primary key references auth.users(id) on delete cascade,
  name              text not null,
  phone             text not null,
  vehicle_type      text not null default 'motorcycle'
                    check (vehicle_type in ('motorcycle','scooter','car','bicycle')),
  last_lat          double precision,
  last_lng          double precision,
  last_location_at  timestamptz,
  created_at        timestamptz not null default now()
);

-- ═══════════════ משמרות ═══════════════
-- מחליף את active + current_business_id. שומר היסטוריה ומאפשר מצב "ממתין לאישור".
create table shifts (
  shift_id     uuid primary key default gen_random_uuid(),
  courier_id   uuid not null references couriers(courier_id) on delete cascade,
  business_id  uuid not null references businesses(business_id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','active','ended','rejected')),
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  ended_at     timestamptz
);

-- שליח לא יכול להיות במשמרת פעילה בשני עסקים במקביל
create unique index one_active_shift_per_courier
  on shifts (courier_id) where status = 'active';

-- ═══════════════ משלוחים ═══════════════
create table deliveries (
  delivery_id     uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(business_id) on delete cascade,

  order_details   text,
  customer_name   text,
  customer_phone  text not null,
  address         text not null,
  address_note    text,                    -- קומה, כניסה, קוד שער

  lat             double precision,
  lng             double precision,
  geocode_status  text not null default 'pending'
                  check (geocode_status in ('pending','ok','failed','manual')),

  price_agorot    integer not null default 0,   -- אגורות, לא float
  payment_method  text not null default 'cash'
                  check (payment_method in ('cash','card_online','card_on_delivery')),
  paid            boolean not null default false,

  status          text not null default 'new'
                  check (status in ('new','ready','assigned','picked_up','delivered','cancelled')),

  -- חותמות הזמן — הבסיס לכל מדידה ולכל אופטימיזציה
  created_at      timestamptz not null default now(),
  ready_at        timestamptz,   -- יצא מהמטבח
  picked_up_at    timestamptz,   -- השליח לקח
  delivered_at    timestamptz    -- נמסר ללקוח
);

-- ═══════════════ מסלולים ═══════════════
create table routes (
  route_id                    uuid primary key default gen_random_uuid(),
  business_id                 uuid not null references businesses(business_id) on delete cascade,
  courier_id                  uuid references couriers(courier_id),
  status                      text not null default 'draft'
                              check (status in ('draft','offered','dispatched','completed','cancelled')),
  estimated_duration_seconds  int,
  created_at                  timestamptz not null default now(),
  dispatched_at               timestamptz,
  completed_at                timestamptz
);

create table route_stops (
  route_id     uuid not null references routes(route_id) on delete cascade,
  delivery_id  uuid not null unique references deliveries(delivery_id) on delete cascade,
  sequence     int not null,          -- פלט האלגוריתם
  eta          timestamptz,
  primary key (route_id, delivery_id)
);

-- ═══════════════ אינדקסים ═══════════════
create index idx_deliveries_open on deliveries (business_id, status)
  where status in ('new','ready');
create index idx_deliveries_created on deliveries (business_id, created_at desc);
create index idx_shifts_active on shifts (business_id) where status = 'active';
create index idx_shifts_courier on shifts (courier_id, status);
create index idx_routes_courier on routes (courier_id, status);
create index idx_route_stops_seq on route_stops (route_id, sequence);
